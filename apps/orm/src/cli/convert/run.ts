import { existsSync, statSync } from 'node:fs';
import { readFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { CerialGenerationError, CerialValidationError } from '../../errors';
import { handlesPath } from '../../generators/handles';
import { attachComments } from '../../formatter';
import type { CommentMap } from '../../formatter';
import { loadDeclarations, materialise } from '../../parser/builder';
import type { ExportedDeclaration } from '../../parser/builder';
import { tokenize } from '../../parser/tokenizer';
import type { SchemaAST } from '../../types';
import { checkPrintable } from './check-printable';
import { compareExact } from './compare';
import { commentToken, printCerial, verifyCerial } from './emit-cerial';
import type { CerialFile } from './emit-cerial';
import { emitTypescript } from './emit-ts';
import type { EmittedModule } from './emit-ts';
import { LOSSY_CASES, lossyCase } from './lossy-cases';
import { nonLiteralExports, planPartial, referencesOf, renderUnresolved, withoutNames } from './partial';
import type { ConvertedDeclaration, HeldBack, Item, PartialRefusal } from './partial';
import { isInside, planOutputs } from './output-paths';
import type { OutputPlan } from './output-paths';
import { moduleEdges, pureModules, removeSources } from './remove-sources';
import type { ConvertedSources, RemovalReport, SourceClaim } from './remove-sources';
import { scanModules } from './scan-module';
import type { ScanHit } from './scan-module';
import { writeOutputs } from './write-output';
import type { StagedTree } from './write-output';
import { escapesRoot } from '../utils';
import { buildResolvedSchemaAst } from '../resolvers/schema-ast';
import type { SchemaAstResult } from '../resolvers/schema-ast';
import { buildWatchTargets } from '../commands/generate';
import { formatOrigin, validateLiteralFieldReferences } from '../validators';
import { validateObjectReferences, validateRelations } from '../validators/schema-validator';
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
  /** `--remove-source`: delete the sources that were fully converted, after the output is committed. */
  readonly removeSource?: boolean;
  /** `--partial`: write what converts, hold back what reaches a refused declaration, and report the rest. */
  readonly partial?: boolean;
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
  /** Refused and held-back declarations; a `--partial` run that left any exits 1. */
  readonly refused: number;
  /** What to print on success: one line per file, then the next step. */
  readonly lines: readonly string[];
}

interface Group {
  readonly name: string | undefined;
  readonly result: SchemaAstResult;
  readonly root: string;
  readonly modules: readonly EmittedModule[];
  readonly kept: readonly string[];
  /** Refused and held-back names, which the converted modules are not compared against. */
  readonly excluded: ReadonlySet<string>;
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

  const notices = LOSSY_CASES.flatMap((entry) => (entry.notice ? [entry.notice] : []));

  return `--to cerial does not preserve TypeScript comments. These are written out in full and marked with a comment, and the .cerial no longer follows their TypeScript source: ${expanded.join(', ')}. Constructs that cannot be written as .cerial are refused, all in one report. ${notices.join(' ')}`;
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

  const expected = withoutNames(group.result.combinedAST, group.excluded);
  const written = new Set(
    [...expected.models, ...expected.objects, ...expected.tuples, ...expected.literals, ...expected.enums]
      .filter((d) => d.origin.kind === 'dsl')
      .map((d) => d.name),
  );
  // A kept module no emitted file imports is not rebuilt either, so any TypeScript source makes the entry mixed
  const mixed = group.result.typescriptFiles.length > 0;
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

/**
 * Refuses a run that would write or delete where the real path is outside the project root, even when `-s` or a
 * config names it. `-o` is the one explicit destination and stays the user's choice.
 */
function refuseSymlinkEscapes(root: string, plan: OutputPlan, inputs: readonly string[], output?: string): void {
  // A file is replaced or unlinked in its folder, so the folder is what must stay inside; a link itself is only unlinked
  const touched = [...(output === undefined ? plan.outputs.map((o) => o.target) : []), ...inputs];
  const escaping = [
    ...(escapesRoot(root, plan.entryRoot) ? [plan.entryRoot] : []),
    ...new Set(touched.filter((path) => escapesRoot(root, dirname(path)))),
  ];
  if (escaping.length)
    throw new CerialGenerationError(
      `Nothing was written. These paths are outside the project root ${root}:\n${escaping.map((p) => `  ${p}`).join('\n')}`,
    );
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
  const refused: PartialRefusal[] = [];
  const held: HeldBack[] = [];
  for (const { target, result } of selected) {
    const label = target.name ? ` in schema '${target.name}'` : '';
    if (!result.schemaFiles.length)
      throw new CerialGenerationError(`Nothing to convert${label}: it has no .cerial source files.`);

    const emitOptions = { schemaImport: options.schemaImport, comments: commentsOf(result) };
    let emitted = emitTypescript(result.combinedAST, emitOptions);
    let excluded: ReadonlySet<string> = new Set();
    if (options.partial && emitted.refusals.length) {
      const plan = planPartial(result.combinedAST, emitted.refusals);
      emitted = emitTypescript(plan.kept, emitOptions);
      excluded = plan.excluded;
      refused.push(...plan.refused);
      held.push(...plan.held);
    }
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
    groups.push({ name: target.name, result, root: rootOf(target), modules: emitted.modules, kept, excluded });
  }
  if (refusals.length)
    throw new CerialGenerationError(
      `Nothing was written. ${refusals.length} declaration(s) cannot be converted:\n${refusals.map((r) => `  ${r}`).join('\n')}`,
    );

  const modules = groups.flatMap((g) => g.modules);
  if (!modules.length) {
    if (refused.length)
      throw new CerialGenerationError(
        `Nothing was written. Every declaration is refused or held back:\n${renderUnresolved({ refused, held, duplicated: [] }).join('\n')}`,
      );
    throw new CerialGenerationError('Nothing to convert: the selected sources hold no declarations.');
  }

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

  refuseSymlinkEscapes(
    filterRoot,
    plan,
    options.removeSource ? groups.flatMap((g) => g.result.schemaFiles) : [],
    options.output,
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
  const duplicated = insideEntry(plan)
    ? groups.flatMap(({ result: { combinedAST: ast }, excluded }) => declarationsOf(withoutNames(ast, excluded), 'dsl'))
    : [];
  const lines = options.dryRun
    ? [...pairs.map((p) => `would write ${p}`), 'Dry run: nothing was written.']
    : pairs.map((p) => `wrote ${p}`);
  if (options.verbose) lines.push(...countLines(groups.map((g) => g.result.combinedAST)));

  let failures: readonly string[] = [];
  let removed: readonly string[] = [];
  if (options.removeSource) {
    const blocked = new Map<string, string>();
    for (const r of [...refused, ...held]) blocked.set(r.module, UNCONVERTED);
    for (const { result, excluded } of groups) {
      for (const file of filesOf(result.combinedAST, excluded)) blocked.set(file, UNCONVERTED);
      if (!insideEntry(plan))
        for (const [file, reason] of referencedFiles(result.combinedAST, excluded))
          if (!blocked.has(file)) blocked.set(file, reason);
    }
    const declaring = new Set(
      groups.flatMap(({ result: { combinedAST: ast } }) =>
        [...ast.models, ...ast.objects, ...ast.tuples, ...ast.literals, ...ast.enums].map((d) => d.origin.file),
      ),
    );
    const report = await removeConverted(options, analysed, {
      inputs: groups.flatMap((g) => g.result.schemaFiles),
      outputs: plan.outputs.filter((o) => declaring.has(o.source)),
      written: written.written,
      blocked,
    });
    lines.push(...report.lines);
    failures = report.failed;
    removed = options.dryRun ? [] : report.removed;
  } else if (!options.dryRun) {
    lines.push(
      `The .cerial sources were left in place. Rerun with --remove-source to delete them, or remove them once generate works from the new modules: ${sources.join(', ')}`,
    );
  }

  if (options.partial) lines.push(...(await closingLines(options, selected, { refused, held, duplicated }, removed)));

  return {
    dryRun: written.dryRun,
    plan,
    written: written.written,
    warnings,
    failures,
    refused: refused.length + held.length,
    lines,
  };
}

/** True when the converted files land where `generate` reads, so a source left in place is read beside them. */
function insideEntry(plan: OutputPlan): boolean {
  return !plan.outDir || isInside(plan.entryRoot, plan.outDir);
}

/** The files declaring something in `names`, which a partial run leaves in its source. */
function filesOf(ast: SchemaAST, names: ReadonlySet<string>): Set<string> {
  return new Set(
    KINDS.flatMap(([list]) => ast[list] as Item[])
      .filter((item) => names.has(item.name))
      .map((item) => item.origin.file),
  );
}

/** The files that declare something a kept declaration refers to by name, each with the declaration that does. */
function referencedFiles(ast: SchemaAST, kept: ReadonlySet<string>): Map<string, string> {
  const items = KINDS.flatMap(([list]) => ast[list] as Item[]);
  const files = new Map<string, string>();
  for (const item of items) {
    if (!kept.has(item.name)) continue;
    for (const name of referencesOf(item)) {
      const target = items.find((other) => other.name === name && !kept.has(name));
      if (target && !files.has(target.origin.file))
        files.set(target.origin.file, `the declaration ${item.name}, which stays, refers to ${name}`);
    }
  }

  return files;
}

function claimsOf(analysed: Awaited<ReturnType<typeof analyse>>): SourceClaim[] {
  return analysed.map(({ target, result }) => ({
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
}

async function removeConverted(
  options: ConvertOptions,
  analysed: Awaited<ReturnType<typeof analyse>>,
  converted: Omit<ConvertedSources, 'claims'>,
): Promise<RemovalReport> {
  const report = await removeSources(
    { ...converted, claims: claimsOf(analysed) },
    { dryRun: options.dryRun, remove: options.removeFile },
  );
  if (!report.failed.length) return report;

  return {
    ...report,
    lines: [
      ...report.lines,
      `${report.failed.length} source(s) could not be removed; the converted output is in place. Remove them by hand: ${report.failed.join(', ')}`,
    ],
  };
}

/**
 * The closing section of a `--partial` run. After a removal the claim that the project generates is measured by
 * reading the entry again, since a removed source is no longer a duplicate and a removed entry module is no longer there.
 */
async function closingLines(
  options: ConvertOptions,
  selected: Awaited<ReturnType<typeof analyse>>,
  report: { refused: PartialRefusal[]; held: HeldBack[]; duplicated: ConvertedDeclaration[] },
  removed: readonly string[],
): Promise<string[]> {
  const gone = new Set(removed);
  const lines = renderUnresolved({ ...report, duplicated: report.duplicated.filter((d) => !gone.has(d.source)) });
  if (!removed.length) return lines;

  let problems: string[];
  try {
    const filterRoot = options.config ? dirname(resolve(options.config)) : process.cwd();
    const again = await analyse(
      selected.map((s) => s.target),
      filterRoot,
    );
    problems = again.flatMap(({ target, result }) =>
      sourceErrors(again.length > 1 && target.name ? `[${target.name}] ` : '', result),
    );
  } catch (error) {
    problems = [error instanceof Error ? error.message : String(error)];
  }
  lines[lines.length - 1] = problems.length
    ? `The project does not generate as it stands: ${problems.join('; ')}`
    : 'The project generates as it stands.';

  return lines;
}

function declarationsOf(ast: SchemaAST, kind: 'dsl' | 'ts'): ConvertedDeclaration[] {
  return KINDS.flatMap(([list]) =>
    ast[list]
      .filter((item) => item.origin.kind === kind)
      .map((item) => ({ name: item.name, source: item.origin.file })),
  );
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

/** Every binding a declaration was exported under whose name is not the declaration's own, which the .cerial cannot carry. */
function droppedBindings(declarations: readonly ExportedDeclaration[]): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const { handle, module, exportName } of declarations) {
    const name = (handle as { name: string }).name;
    const key = `${module}\0${exportName}\0${name}`;
    if (exportName === name || seen.has(key)) continue;
    seen.add(key);
    warnings.push(
      `${module}: the binding '${exportName}' is not in the .cerial (${exportName} -> ${name}); importers of '${exportName}' break once the TypeScript module is removed`,
    );
  }

  return warnings;
}

/** The modules that export or run something other than a declaration, which a .cerial cannot hold. */
async function modulesWithOtherCode(
  files: readonly string[],
  declarations: readonly ExportedDeclaration[],
): Promise<string[]> {
  const imported = (await import('typescript')) as typeof import('typescript') & {
    default?: typeof import('typescript');
  };
  const ts = imported.default ?? imported;
  const exported = new Map<string, Set<string>>();
  for (const { module, exportName } of declarations)
    exported.set(module, (exported.get(module) ?? new Set()).add(exportName));

  const found: string[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const own = exported.get(file) ?? new Set<string>();
    const isExported = (node: import('typescript').Node): boolean =>
      ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const names = (name: import('typescript').BindingName): string[] =>
      ts.isIdentifier(name)
        ? [name.text]
        : name.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : names(el.name)));

    const other = source.statements.some((statement) => {
      if (ts.isExpressionStatement(statement)) return true;
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return true;
      if (ts.isVariableStatement(statement))
        return (
          isExported(statement) &&
          statement.declarationList.declarations.some((d) => names(d.name).some((n) => !own.has(n)))
        );
      if (ts.isExportAssignment(statement)) return !own.has('default');
      if (
        ts.isExportDeclaration(statement) &&
        !statement.moduleSpecifier &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      )
        return statement.exportClause.elements.some((el) => !own.has(el.name.text));

      return false;
    });
    if (other) found.push(file);
  }

  return found;
}

const UNCONVERTED = 'it holds a declaration that was refused or held back';

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
  /** What the printed files are checked against: the whole merged entry, `.cerial` declarations included. */
  readonly merged: SchemaAST;
  /** The entry's own `.cerial` files, which stay byte for byte and which the converted text may refer to. */
  readonly kept: readonly CerialFile[];
  readonly ast: SchemaAST;
  readonly files: readonly CerialFile[];
  /** Every TypeScript declaration of the entry, and the names a partial run left in their modules. */
  readonly whole: SchemaAST;
  readonly excluded: ReadonlySet<string>;
}

async function convertToCerial(
  options: ConvertOptions,
  selected: Awaited<ReturnType<typeof analyse>>,
  analysed: Awaited<ReturnType<typeof analyse>>,
): Promise<ConvertResult> {
  const groups: CerialGroup[] = [];
  const refusals: Array<{ module: string; text: string }> = [];
  const refused: PartialRefusal[] = [];
  const held: HeldBack[] = [];
  const verboseLines: string[] = [];
  const warnings: string[] = [];
  const otherCode: string[] = [];
  const blocked = new Map<string, string>();

  for (const { target, result } of selected) {
    const label = target.name ? ` in schema '${target.name}'` : '';
    if (!result.typescriptFiles.length)
      throw new CerialGenerationError(`Nothing to convert${label}: it has no TypeScript schema modules.`);

    const whole = onlyTypescript(result.combinedAST);
    const hits = await scanModules(result.typescriptFiles);
    const groupStart = refusals.length;
    // What each refusal names, for `--partial`: declarations by AST name, and files whose helper no declaration owns
    const named: PartialRefusal[] = [];
    const unowned: Array<{ file: string; reason: string }> = [];
    const refuse = (module: string, text: string, names: readonly string[], reason: string): void => {
      refusals.push({ module, text });
      for (const declaration of names) named.push({ declaration, module, reason });
      if (!names.length) unowned.push({ file: module, reason });
    };
    for (const finding of checkPrintable(whole)) {
      if (lossyCase(finding.id).action === 'refuse')
        refuse(finding.module, `${finding.id}: ${finding.message}`, [finding.declaration], finding.message);
    }
    for (const hit of hits) {
      const entry = lossyCase(hit.id);
      if (entry.action === 'refuse') {
        const exports = hit.declaration?.split(', ') ?? [];
        const owners = placed(whole)
          .filter((d) => d.file === hit.file && d.exportName !== undefined && exports.includes(d.exportName))
          .map((d) => d.name);
        refuse(
          hit.file,
          `${hit.id}: ${hit.message} (${hit.line}:${hit.column}): ${entry.reason}`,
          owners,
          `${hit.id}: ${hit.message}`,
        );
      } else if (options.verbose)
        verboseLines.push(`expanded ${hit.id} (${entry.construct.split(':')[0]}) in ${hit.declaration ?? hit.file}`);
    }
    // The validators `generate` runs on the resolved schema, so a reference to a declaration that was never
    // exported (and so is not in the AST) is refused here instead of printed as a dangling name
    const resolved = result.resolvedAST;
    if (resolved) {
      const concrete = { ...resolved, models: resolved.models.filter((m) => !m.abstract) };
      for (const error of [
        ...validateRelations(concrete),
        ...validateObjectReferences(concrete),
        ...validateLiteralFieldReferences(concrete),
      ]) {
        const module = error.origin?.file ?? target.schemaPath;
        const owners = whole.models.filter((m) => m.name === error.model).map((m) => m.name);
        refuse(
          module,
          `unexported-declaration: ${error.origin ? `${formatOrigin(error.origin)}: ` : ''}${error.message}`,
          owners.length
            ? owners
            : placed(whole)
                .filter((d) => d.file === module)
                .map((d) => d.name),
          error.message,
        );
      }
    }
    if (refusals.length && !options.partial) continue;

    let excluded: ReadonlySet<string> = new Set();
    if (refusals.length > groupStart) {
      // A computed value in a helper no declaration owns could change any declaration that is not a plain builder chain
      if (unowned.length) {
        const declared = placed(whole).filter((d) => d.exportName !== undefined);
        for (const module of new Set(declared.map((d) => d.file))) {
          const own = declared.filter((d) => d.file === module);
          const risky = new Set(
            await nonLiteralExports(
              module,
              own.map((d) => d.exportName!),
            ),
          );
          for (const d of own)
            if (risky.has(d.exportName!)) named.push({ declaration: d.name, module, reason: unowned[0]!.reason });
        }
      }
      const plan = planPartial(whole, named);
      excluded = plan.excluded;
      refused.push(...plan.refused);
      held.push(...plan.held);
    }
    const ast = withoutNames(whole, excluded);
    const merged = withoutNames(result.combinedAST, excluded);

    const files = printCerial(ast, result.declarations, expandComments(ast, hits));
    const kept = result.schemaContents.map(({ path, content }) => ({ from: path, path, text: content }));
    warnings.push(...droppedBindings(result.declarations));
    otherCode.push(...(await modulesWithOtherCode(result.typescriptFiles, result.declarations)));
    groups.push({ name: target.name, root: rootOf(target), merged, kept, ast, files, whole, excluded });
    for (const refusal of refusals.slice(groupStart)) blocked.set(refusal.module, UNCONVERTED);
    for (const file of filesOf(whole, excluded)) blocked.set(file, UNCONVERTED);
  }
  if (refusals.length && !options.partial)
    throw new CerialGenerationError(
      `Nothing was written. ${refusals.length} construct(s) cannot be converted to .cerial:\n${groupedByModule(refusals)}`,
    );

  const files = groups.flatMap((g) => g.files);
  if (!files.length) {
    if (refusals.length)
      throw new CerialGenerationError(
        `Nothing was written. Every declaration is refused or held back:\n${renderUnresolved({ refused, held, duplicated: [] }).join('\n')}`,
      );
    throw new CerialGenerationError('Nothing to convert: the selected sources hold no declarations.');
  }

  const plan = planOutputs({
    sources: files.map((file) => file.from),
    entryRoot: commonDir(groups.map((g) => g.root)),
    toExtension: '.cerial',
    outDir: options.output,
    // Every config entry guards its sources, not only the ones converted now
    protectedSources: analysed.flatMap(({ result }) => [...result.schemaFiles, ...result.typescriptFiles]),
  });

  // Read before the commit, so a module that cannot be read refuses the run with nothing written
  let removal: Omit<ConvertedSources, 'claims' | 'written'> | undefined;
  if (options.removeSource) {
    // An entry lists the modules it imports, so a converted module need not be among the discovered files
    const inputs = [
      ...new Set([...selected.flatMap(({ result }) => result.typescriptFiles), ...plan.outputs.map((o) => o.source)]),
    ];
    const imports = await moduleEdges(inputs);
    for (const file of otherCode) blocked.set(file, 'it holds code other than imports and declarations');
    if (!insideEntry(plan))
      for (const { whole, excluded } of groups)
        for (const [file, reason] of referencedFiles(whole, excluded))
          if (!blocked.has(file)) blocked.set(file, reason);
    removal = { inputs, outputs: plan.outputs, blocked, imports, pure: await pureModules([...imports.keys()]) };
  }

  refuseSymlinkEscapes(
    options.config ? dirname(resolve(options.config)) : process.cwd(),
    plan,
    removal?.inputs ?? [],
    options.output,
  );

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
        verifyCerial(group.merged, staged, group.kept);
      }
    },
  });

  const pairs = plan.outputs.map(({ source, target }) => `${source} -> ${target}`);
  const lines = options.dryRun
    ? [...pairs.map((p) => `would write ${p}`), 'Dry run: nothing was written.']
    : pairs.map((p) => `wrote ${p}`);
  if (options.verbose) lines.push(...verboseLines, ...countLines(groups.map((g) => g.ast)));
  let failures: readonly string[] = [];
  let removed: readonly string[] = [];
  if (removal) {
    const report = await removeConverted(options, analysed, { ...removal, written: written.written });
    lines.push(...report.lines);
    failures = report.failed;
    removed = options.dryRun ? [] : report.removed;
    if (report.removed.length)
      warnings.push(
        `comments in the TypeScript modules ${options.dryRun ? 'that would be removed' : 'that were removed'} are gone: the .cerial files do not carry them`,
      );
  } else if (!options.dryRun) {
    lines.push(
      `The TypeScript modules were left in place. Move them away before generate, since each declaration now exists in both forms, and list the .cerial entry in the config instead of defineSchema: ${plan.outputs.map((o) => o.source).join(', ')}`,
    );
  }

  if (otherCode.length)
    lines.push(
      `Other exports and code in these modules are not converted: ${[...new Set(otherCode)].sort().join(', ')}`,
    );

  if (options.partial) {
    const duplicated = insideEntry(plan) ? groups.flatMap((g) => declarationsOf(g.ast, 'ts')) : [];
    lines.push(...(await closingLines(options, selected, { refused, held, duplicated }, removed)));
  }

  return {
    dryRun: written.dryRun,
    plan,
    written: written.written,
    warnings,
    failures,
    refused: refused.length + held.length,
    lines,
  };
}
