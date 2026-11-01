import { existsSync, statSync } from 'node:fs';
import { readFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { CerialGenerationError, CerialValidationError } from '../../errors';
import { handlesPath } from '../../generators/handles';
import { attachComments } from '../../formatter';
import type { CommentMap } from '../../formatter';
import { loadDeclarations, materialise } from '../../parser/builder';
import { tokenize } from '../../parser/tokenizer';
import type { SchemaAST } from '../../types';
import { checkPrintable } from './check-printable';
import { compareExact } from './compare';
import { commentToken, printCerial, verifyCerial } from './emit-cerial';
import type { CerialFile } from './emit-cerial';
import { emitTypescript } from './emit-ts';
import type { EmittedModule } from './emit-ts';
import { LOSSY_CASES, lossyCase } from './lossy-cases';
import { isInside, planOutputs } from './output-paths';
import type { OutputPlan } from './output-paths';
import { removeSources } from './remove-sources';
import type { SourceClaim } from './remove-sources';
import { scanModules } from './scan-module';
import type { ScanHit } from './scan-module';
import { writeOutputs } from './write-output';
import type { StagedTree } from './write-output';
import { buildResolvedSchemaAst } from '../resolvers/schema-ast';
import type { SchemaAstResult } from '../resolvers/schema-ast';
import { buildWatchTargets } from '../commands/generate';
import { schemaSource } from '../generate';
import type { WatchTarget } from '../watcher';

/** The directions `convert` can write. */
export const CONVERT_TARGETS = ['ts', 'cerial'] as const;
export type ConvertTarget = (typeof CONVERT_TARGETS)[number];

export interface ConvertOptions {
  /** `--to`; required. */
  readonly to?: string;
  /** `-s`: a schema file or directory instead of the config. */
  readonly schema?: string;
  /** `-C`. */
  readonly config?: string;
  /** `-n`: convert one schema of the config. */
  readonly name?: string;
  /** `-o`: write under this directory, mirroring the layout. */
  readonly output?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  /** `--remove-source`: delete the `.cerial` files that were fully converted, after the output is committed. */
  readonly removeSource?: boolean;
  /** `-v`: list each expanded case per declaration and the declarations written per file. */
  readonly verbose?: boolean;
  /** Replaces the deletion of one source so a removal failure can be injected. */
  readonly removeFile?: (path: string) => Promise<void>;
  /** What the emitted modules import the builder from. Defaults to `cerial/schema`. */
  readonly schemaImport?: string;
  /** Replaces `fs.rename` in the writer so a commit failure can be injected. */
  readonly rename?: (from: string, to: string) => Promise<void>;
}

export interface ConvertResult {
  readonly dryRun: boolean;
  readonly plan: OutputPlan;
  /** Targets written; empty for a dry run. */
  readonly written: readonly string[];
  readonly warnings: readonly string[];
  /** Sources `--remove-source` could not delete; the run exits 1 when any. */
  readonly failures: readonly string[];
  /** What to print on success: one line per file, then the next step. */
  readonly lines: readonly string[];
}

interface Group {
  readonly name: string | undefined;
  readonly result: SchemaAstResult;
  readonly root: string;
  readonly modules: readonly EmittedModule[];
  readonly kept: readonly string[];
}

function blank(value: string | undefined): boolean {
  return value !== undefined && !value.trim();
}

/** Refuses a bad flag by name, before anything is read. */
function validateOptions(options: ConvertOptions): ConvertTarget {
  const choices = CONVERT_TARGETS.join(', ');
  if (options.to === undefined || !options.to.trim())
    throw new CerialValidationError(`--to is required. Choose one of: ${choices}`);
  if (!(CONVERT_TARGETS as readonly string[]).includes(options.to))
    throw new CerialValidationError(`--to '${options.to}' is not a direction. Choose one of: ${choices}`);
  if (options.to === 'cerial' && options.removeSource)
    throw new CerialValidationError(
      '--remove-source is not available with --to cerial yet, so no TypeScript module is deleted. Remove them by hand once generate works from the .cerial files',
    );
  if (blank(options.name)) throw new CerialValidationError('-n needs a schema name');
  if (blank(options.output)) throw new CerialValidationError('-o needs a directory');
  if (blank(options.schema)) throw new CerialValidationError('-s needs a schema file or directory');
  if (blank(options.config)) throw new CerialValidationError('-C needs a config file path');
  if (options.output !== undefined && existsSync(options.output) && !statSync(options.output).isDirectory())
    throw new CerialValidationError(`-o ${options.output} is a file, not a directory`);

  return options.to as ConvertTarget;
}

/** What `--help` says conversion drops, read from the table so the text cannot drift from the rows. */
export function droppedNotice(): string {
  const expanded = LOSSY_CASES.filter(
    (entry) => entry.direction === 'to-cerial' && entry.action === 'expand' && entry.comment !== null,
  ).map((entry) => entry.id.replace(/-/g, ' '));

  return `--to cerial does not preserve TypeScript comments. These are written out in full and marked with a comment, and the .cerial no longer follows their TypeScript source: ${expanded.join(', ')}. Constructs that cannot be written as .cerial are refused, all in one report.`;
}

function commonDir(dirs: readonly string[]): string {
  const split = dirs.map((d) => d.split(sep));
  const first = split[0] ?? [];
  let length = first.length;
  for (const parts of split) {
    let i = 0;
    while (i < length && i < parts.length && parts[i] === first[i]) i++;
    length = i;
  }

  return first.slice(0, length).join(sep) || sep;
}

function rootOf(target: WatchTarget): string {
  const path = resolve(target.schemaPath);

  return existsSync(path) && statSync(path).isFile() ? dirname(path) : path;
}

function commentsOf(result: SchemaAstResult): Map<string, CommentMap> {
  const comments = new Map<string, CommentMap>();
  for (const { path, content } of result.schemaContents) {
    const own = <T extends { origin: { file: string } }>(items: T[]): T[] =>
      items.filter((i) => i.origin.file === path);
    const ast = result.combinedAST;
    const only: SchemaAST = {
      models: own(ast.models),
      objects: own(ast.objects),
      tuples: own(ast.tuples),
      literals: own(ast.literals),
      enums: own(ast.enums),
      source: '',
    };
    comments.set(path, attachComments(tokenize(content), only));
  }

  return comments;
}

function sourceErrors(label: string, result: SchemaAstResult): string[] {
  return [
    ...result.parseErrors.map((e) => `${label}${e}`),
    ...result.extendsErrors.map((e) => `${label}${e.origin?.file ?? ''}${e.line ? `:${e.line}` : ''}: ${e.message}`),
  ];
}

/** True when `cerial/schema` resolves from `dir`: some ancestor has `node_modules/cerial`. */
function resolvesFrom(dir: string): boolean {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(join(current, 'node_modules', 'cerial'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/** Only the declarations named, so a kept module's own declarations do not need rebuilding. */
function restrictTo(ast: SchemaAST, names: ReadonlySet<string>): SchemaAST {
  const keep = <T extends { name: string }>(items: T[]): T[] => items.filter((i) => names.has(i.name));

  return {
    ...ast,
    models: keep(ast.models),
    objects: keep(ast.objects),
    tuples: keep(ast.tuples),
    literals: keep(ast.literals),
    enums: keep(ast.enums),
  };
}

async function verifyGroup(group: Group, tree: StagedTree): Promise<void> {
  const sources = new Set(group.modules.map((m) => m.file));
  const staged = tree.files.filter((f) => sources.has(f.source)).map((f) => f.path);
  const kept = group.kept.map((k) => join(tree.dir, relative(group.root, k)));
  const built = materialise(await loadDeclarations([...staged, ...kept]));

  const expected = group.result.combinedAST;
  const written = new Set(
    [...expected.models, ...expected.objects, ...expected.tuples, ...expected.literals, ...expected.enums]
      .filter((d) => d.origin.kind === 'dsl')
      .map((d) => d.name),
  );
  const mixed = group.kept.length > 0;
  const differences = compareExact(
    mixed ? restrictTo(expected, written) : expected,
    mixed ? restrictTo(built, written) : built,
    {
      tolerate: {
        declarationOrder: group.modules.flatMap((m) => m.hoisted),
        directiveKindOrder: group.modules.flatMap((m) => m.directiveKindOrder),
      },
    },
  );
  if (differences.length) {
    throw new CerialGenerationError(
      `Nothing was written. The converted modules do not rebuild the source schema${group.name ? ` '${group.name}'` : ''}:\n${differences.map((d) => `  ${d}`).join('\n')}`,
    );
  }
}

/**
 * Converts every selected schema in one plan: parse, emit, then preflight, stage and verify all of them before
 * the first file is committed. Every refusal throws a typed error and leaves the disk as it was.
 */
export async function runConvert(options: ConvertOptions): Promise<ConvertResult> {
  validateOptions(options);

  // Discovery writes `cerial/handles.ts` when an entry mixes `.cerial` and TypeScript, which a refused or
  // dry run must not leave behind
  const created: string[] = [];
  try {
    const result = await convertAll(options, created);
    if (result.dryRun) await removeCreated(created);

    return result;
  } catch (error) {
    await removeCreated(created);
    throw error;
  }
}

async function removeCreated(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    await rm(path, { force: true });
    await rmdir(dirname(path)).catch(() => undefined);
  }
}

function analyse(targets: readonly WatchTarget[], filterRoot: string) {
  return Promise.all(
    targets.map(async (target) => ({
      target,
      result: await buildResolvedSchemaAst({
        ...schemaSource(
          {
            name: target.name ?? '',
            path: target.schemaPath,
            entry: target.entry,
            files: target.files,
            entryOnly: target.entryOnly,
            output: target.outputDir,
            clientClassName: target.clientClassName ?? '',
          },
          filterRoot,
        ),
        filter: target.filter,
      }),
    })),
  );
}

async function convertAll(options: ConvertOptions, created: string[]): Promise<ConvertResult> {
  const targets = await buildWatchTargets({ schema: options.schema, config: options.config });
  const filterRoot = options.config ? dirname(resolve(options.config)) : process.cwd();

  const unwritten = targets.map((t) => handlesPath(rootOf(t))).filter((path) => !existsSync(path));
  let analysed: Awaited<ReturnType<typeof analyse>>;
  try {
    analysed = await analyse(targets, filterRoot);
  } finally {
    created.push(...unwritten.filter((path) => existsSync(path)));
  }
  const selected = options.name === undefined ? analysed : analysed.filter((a) => a.target.name === options.name);
  if (!selected.length) {
    const available = analysed.map((a) => a.target.name).filter(Boolean);
    throw new CerialValidationError(
      `-n '${options.name}' is not a schema of this project. Available schemas: ${available.length ? available.join(', ') : '(none)'}`,
    );
  }

  const problems = selected.flatMap(({ target, result }) =>
    sourceErrors(selected.length > 1 && target.name ? `[${target.name}] ` : '', result),
  );
  if (problems.length)
    throw new CerialGenerationError(
      `Nothing was written. The schema has errors:\n${problems.map((p) => `  ${p}`).join('\n')}`,
    );

  if (options.to === 'cerial') return convertToCerial(options, selected, analysed);

  const groups: Group[] = [];
  const refusals: string[] = [];
  for (const { target, result } of selected) {
    const label = target.name ? ` in schema '${target.name}'` : '';
    if (!result.schemaFiles.length)
      throw new CerialGenerationError(`Nothing to convert${label}: it has no .cerial source files.`);

    const emitted = emitTypescript(result.combinedAST, {
      schemaImport: options.schemaImport,
      comments: commentsOf(result),
    });
    for (const r of emitted.refusals)
      refusals.push(`${r.caseId}: ${r.declaration} (module ${r.module})${label}: ${r.reason}`);

    const kept = result.typescriptFiles.filter((file) => {
      const specifier = file.replace(/\.[cm]?tsx?$/, '');

      return emitted.modules.some((m) => {
        const rel = relative(dirname(m.path), specifier).split(sep).join('/');
        const spec = rel.startsWith('.') ? rel : `./${rel}`;

        return m.text.includes(`'${spec}'`) || m.text.includes(`"${spec}"`);
      });
    });
    groups.push({ name: target.name, result, root: rootOf(target), modules: emitted.modules, kept });
  }
  if (refusals.length)
    throw new CerialGenerationError(
      `Nothing was written. ${refusals.length} declaration(s) cannot be converted:\n${refusals.map((r) => `  ${r}`).join('\n')}`,
    );

  const modules = groups.flatMap((g) => g.modules);
  if (!modules.length)
    throw new CerialGenerationError('Nothing to convert: the selected sources hold no declarations.');

  // Every config entry guards its sources, not only the ones converted now
  const protectedSources = analysed.flatMap(({ result }) => [...result.schemaFiles, ...result.typescriptFiles]);
  const entryRoot = commonDir(groups.map((g) => g.root));
  const plan = planOutputs({
    sources: modules.map((m) => m.file),
    entryRoot,
    toExtension: '.schema.ts',
    outDir: options.output,
    protectedSources,
    keptModules: groups.flatMap((g) => g.kept),
  });

  const warnings = modules.flatMap((m) => m.warnings.map((w) => `${m.file}: ${w}`));
  if (plan.outDir && !isInside(plan.entryRoot, plan.outDir) && !resolvesFrom(plan.outDir))
    warnings.push(
      `${plan.outDir} is outside any project that installs cerial, so 'cerial/schema' does not resolve from there. The modules were verified in a stage under ${plan.entryRoot}.`,
    );

  const written = await writeOutputs(plan, {
    contents: new Map(modules.map((m) => [m.file, m.text])),
    force: options.force,
    dryRun: options.dryRun,
    rename: options.rename,
    verify: async (tree) => {
      for (const group of groups) await verifyGroup(group, tree);
    },
  });

  const pairs = plan.outputs.map(({ source, target }) => `${source} -> ${target}`);
  const sources = plan.outputs.map((o) => o.source);
  const lines = options.dryRun
    ? [...pairs.map((p) => `would write ${p}`), 'Dry run: nothing was written.']
    : pairs.map((p) => `wrote ${p}`);
  if (options.verbose) lines.push(...countLines(groups.map((g) => g.result.combinedAST)));

  let failures: readonly string[] = [];
  if (options.removeSource) {
    const claims: SourceClaim[] = analysed.map(({ target, result }) => ({
      name: target.name,
      sources: [...result.schemaFiles, ...result.typescriptFiles],
      listed:
        target.name === undefined
          ? []
          : [
              ...(target.files ?? []).map((file) => ({ key: 'files' as const, file })),
              ...(target.entry ? [{ key: 'entry' as const, file: target.entry }] : []),
              ...(isFile(target.schemaPath) ? [{ key: 'path' as const, file: target.schemaPath }] : []),
            ],
    }));
    const declaring = new Set(
      groups.flatMap(({ result: { combinedAST: ast } }) =>
        [...ast.models, ...ast.objects, ...ast.tuples, ...ast.literals, ...ast.enums].map((d) => d.origin.file),
      ),
    );
    const report = await removeSources(
      {
        inputs: groups.flatMap((g) => g.result.schemaFiles),
        outputs: plan.outputs.filter((o) => declaring.has(o.source)),
        written: written.written,
        claims,
      },
      { dryRun: options.dryRun, remove: options.removeFile },
    );
    lines.push(...report.lines);
    failures = report.failed;
    if (failures.length)
      lines.push(
        `${failures.length} source(s) could not be removed; the converted modules are in place. Remove them by hand: ${failures.join(', ')}`,
      );
  } else if (!options.dryRun) {
    lines.push(
      `The .cerial sources were left in place. Rerun with --remove-source to delete them, or remove them once generate works from the new modules: ${sources.join(', ')}`,
    );
  }

  return { dryRun: written.dryRun, plan, written: written.written, warnings, failures, lines };
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

const KINDS = [
  ['models', 'model'],
  ['objects', 'object'],
  ['tuples', 'tuple'],
  ['literals', 'literal'],
  ['enums', 'enum'],
] as const;

interface Placed {
  readonly kind: string;
  readonly name: string;
  readonly exportName: string | undefined;
  readonly file: string;
  readonly fields: readonly string[];
}

function placed(ast: SchemaAST): Placed[] {
  return KINDS.flatMap(([list, kind]) =>
    ast[list].map((item) => ({
      kind,
      name: item.name,
      exportName: item.origin.kind === 'ts' ? item.origin.export : undefined,
      file: item.origin.file,
      fields: 'fields' in item ? item.fields.map((field) => field.name) : [],
    })),
  );
}

function countLines(asts: readonly SchemaAST[]): string[] {
  const counts = new Map<string, number>();
  for (const item of asts.flatMap(placed)) counts.set(item.file, (counts.get(item.file) ?? 0) + 1);

  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([file, n]) => `${file}: ${n} declaration(s)`);
}

function onlyTypescript(ast: SchemaAST): SchemaAST {
  const own = <T extends { origin: { kind: string } }>(items: T[]): T[] =>
    items.filter((item) => item.origin.kind === 'ts');

  return {
    models: own(ast.models),
    objects: own(ast.objects),
    tuples: own(ast.tuples),
    literals: own(ast.literals),
    enums: own(ast.enums),
    source: '',
  };
}

/** The row's comment, with the name it asks for filled in. */
function commentText(template: string, hit: ScanHit): string {
  return template.replace('<callee>', hit.subject ?? 'a function').replace('<name>', hit.subject ?? 'a field set');
}

/**
 * A comment above each declaration (or field) an `expand` row rewrote, so the `.cerial` does not read as
 * hand-written. A hit inside a helper body no declaration owns goes above the first declaration of its module.
 */
function expandComments(ast: SchemaAST, hits: readonly ScanHit[]): CommentMap {
  const comments: CommentMap = new Map();
  const items = placed(ast);
  const add = (key: string, text: string): void => {
    const entry = comments.get(key) ?? { leading: [], trailing: [] };
    if (!entry.leading.some((token) => token.value === text)) entry.leading.push(commentToken(text));
    comments.set(key, entry);
  };

  for (const hit of hits) {
    const template = lossyCase(hit.id).comment;
    if (lossyCase(hit.id).action !== 'expand' || template === null) continue;
    const text = commentText(template, hit);
    const names = hit.declaration?.split(', ');
    const owners = items.filter((item) =>
      names ? item.file === hit.file && item.exportName !== undefined && names.includes(item.exportName) : false,
    );
    const targets = names ? owners : items.filter((item) => item.file === hit.file).slice(0, 1);
    for (const owner of targets) {
      const onField = hit.field !== null && owner.fields.includes(hit.field);
      add(onField ? `field:${owner.name}.${hit.field}` : `${owner.kind}:${owner.name}`, text);
    }
  }

  return comments;
}

function groupedByModule(entries: ReadonlyArray<{ module: string; text: string }>): string {
  const byModule = new Map<string, string[]>();
  for (const { module, text } of entries) byModule.set(module, [...(byModule.get(module) ?? []), text]);

  return [...byModule]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, texts]) => `  ${module}\n${texts.map((t) => `    ${t}`).join('\n')}`)
    .join('\n');
}

interface CerialGroup {
  readonly name: string | undefined;
  readonly root: string;
  readonly ast: SchemaAST;
  readonly files: readonly CerialFile[];
}

async function convertToCerial(
  options: ConvertOptions,
  selected: Awaited<ReturnType<typeof analyse>>,
  analysed: Awaited<ReturnType<typeof analyse>>,
): Promise<ConvertResult> {
  const groups: CerialGroup[] = [];
  const refusals: Array<{ module: string; text: string }> = [];
  const verboseLines: string[] = [];

  for (const { target, result } of selected) {
    const label = target.name ? ` in schema '${target.name}'` : '';
    if (!result.typescriptFiles.length)
      throw new CerialGenerationError(`Nothing to convert${label}: it has no TypeScript schema modules.`);

    const ast = onlyTypescript(result.combinedAST);
    const hits = await scanModules(result.typescriptFiles);
    for (const finding of checkPrintable(ast)) {
      if (lossyCase(finding.id).action === 'refuse')
        refusals.push({ module: finding.module, text: `${finding.id}: ${finding.message}` });
    }
    for (const hit of hits) {
      const entry = lossyCase(hit.id);
      if (entry.action === 'refuse')
        refusals.push({
          module: hit.file,
          text: `${hit.id}: ${hit.message} (${hit.line}:${hit.column}): ${entry.reason}`,
        });
      else if (options.verbose)
        verboseLines.push(`expanded ${hit.id} (${entry.construct.split(':')[0]}) in ${hit.declaration ?? hit.file}`);
    }
    if (refusals.length) continue;

    const files = printCerial(ast, result.declarations, expandComments(ast, hits));
    groups.push({ name: target.name, root: rootOf(target), ast, files });
  }
  if (refusals.length)
    throw new CerialGenerationError(
      `Nothing was written. ${refusals.length} construct(s) cannot be converted to .cerial:\n${groupedByModule(refusals)}`,
    );

  const files = groups.flatMap((g) => g.files);
  if (!files.length) throw new CerialGenerationError('Nothing to convert: the selected sources hold no declarations.');

  const plan = planOutputs({
    sources: files.map((file) => file.from),
    entryRoot: commonDir(groups.map((g) => g.root)),
    toExtension: '.cerial',
    outDir: options.output,
    // Every config entry guards its sources, not only the ones converted now
    protectedSources: analysed.flatMap(({ result }) => [...result.schemaFiles, ...result.typescriptFiles]),
  });

  const written = await writeOutputs(plan, {
    contents: new Map(files.map((file) => [file.from, file.text])),
    force: options.force,
    dryRun: options.dryRun,
    rename: options.rename,
    verify: async (tree) => {
      for (const group of groups) {
        const own = new Set(group.files.map((file) => file.from));
        const staged: CerialFile[] = [];
        for (const file of tree.files.filter((f) => own.has(f.source)))
          staged.push({ from: file.source, path: file.path, text: await readFile(file.path, 'utf8') });
        verifyCerial(group.ast, staged);
      }
    },
  });

  const pairs = plan.outputs.map(({ source, target }) => `${source} -> ${target}`);
  const lines = options.dryRun
    ? [...pairs.map((p) => `would write ${p}`), 'Dry run: nothing was written.']
    : pairs.map((p) => `wrote ${p}`);
  if (options.verbose) lines.push(...verboseLines, ...countLines(groups.map((g) => g.ast)));
  if (!options.dryRun) {
    lines.push(
      `The TypeScript modules were left in place. Move them away before generate, since each declaration now exists in both forms, and list the .cerial entry in the config instead of defineSchema: ${plan.outputs.map((o) => o.source).join(', ')}`,
    );
  }

  return { dryRun: written.dryRun, plan, written: written.written, warnings: [], failures: [], lines };
}
