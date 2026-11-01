import { existsSync, statSync } from 'node:fs';
import { rm, rmdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { CerialGenerationError, CerialValidationError } from '../../errors';
import { handlesPath } from '../../generators/handles';
import { attachComments } from '../../formatter';
import type { CommentMap } from '../../formatter';
import { loadDeclarations, materialise } from '../../parser/builder';
import { tokenize } from '../../parser/tokenizer';
import type { SchemaAST } from '../../types';
import { compareExact } from './compare';
import { emitTypescript } from './emit-ts';
import type { EmittedModule } from './emit-ts';
import { isInside, planOutputs } from './output-paths';
import type { OutputPlan } from './output-paths';
import { writeOutputs } from './write-output';
import type { StagedTree } from './write-output';
import { buildResolvedSchemaAst } from '../resolvers/schema-ast';
import type { SchemaAstResult } from '../resolvers/schema-ast';
import { buildWatchTargets } from '../commands/generate';
import { schemaSource } from '../generate';
import type { WatchTarget } from '../watcher';

/** The directions `convert` can write. */
export const CONVERT_TARGETS = ['ts'] as const;
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
  if (blank(options.name)) throw new CerialValidationError('-n needs a schema name');
  if (blank(options.output)) throw new CerialValidationError('-o needs a directory');
  if (blank(options.schema)) throw new CerialValidationError('-s needs a schema file or directory');
  if (blank(options.config)) throw new CerialValidationError('-C needs a config file path');
  if (options.output !== undefined && existsSync(options.output) && !statSync(options.output).isDirectory())
    throw new CerialValidationError(`-o ${options.output} is a file, not a directory`);

  return options.to as ConvertTarget;
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
  const lines = options.dryRun
    ? [...pairs.map((p) => `would write ${p}`), 'Dry run: nothing was written.']
    : [
        ...pairs.map((p) => `wrote ${p}`),
        `The .cerial sources were left in place. Remove them once generate works from the new modules: ${plan.outputs.map((o) => o.source).join(', ')}`,
      ];

  return { dryRun: written.dryRun, plan, written: written.written, warnings, lines };
}
