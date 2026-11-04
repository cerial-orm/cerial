/**
 * Named transforms over generated output. Each takes the tree a case directory holds (paths relative to it: `gen/...` and
 * `consumer.ts`) and returns a new tree, so the generator is never touched and a result can be reproduced from the same input.
 * A transform throws when its pattern matches nothing, so a generator change cannot turn a case into a silent no-op.
 */
import { heavyIncludeConsumer, heavySelectConsumer, heavyWriteConsumer } from './consumer';

export type Tree = ReadonlyMap<string, string>;

export const CASE_NAMES = [
  'no-queries',
  'no-select',
  'flat-select',
  'no-include',
  'no-compute',
  'dts',
  'ts',
  'heavy-select',
  'heavy-select-ts',
  'heavy-select-no-resolve',
  'heavy-select-no-resolve-ts',
  'heavy-select-no-arg',
  'heavy-select-no-arg-ts',
  'heavy-write',
  'heavy-write-no-arg',
  'heavy-include',
  'heavy-include-no-arg',
  'split-output',
  'barrel-models',
  'barrel-root',
] as const;
export type CaseName = (typeof CASE_NAMES)[number];

export interface CaseVariant {
  /** Appended to the row name; empty for the default run */
  readonly label: string;
  readonly skipLibCheck: boolean;
}

export interface BenchCase {
  /** Written to a config before generating; absent runs the CLI's default layout */
  readonly typeFiles?: 'ts';
  /** Measures the e2e corpus only: the consumer names corpus models, so the synthetic sizes are skipped */
  readonly corpusOnly?: boolean;
  /** The tsconfig names only `consumer.ts`, so the compiler loads what the consumer imports and not every generated file */
  readonly consumerOnly?: boolean;
  readonly transform: (tree: Tree) => Tree;
  readonly variants: readonly CaseVariant[];
}

/** Folders of type-only files; `enums/` stays `.ts` for its runtime constants */
const TYPE_ONLY_DIRS = ['models', 'objects', 'tuples', 'literals'];

const SELECT_DECL = /^export type (\w+Select) =[\s\S]*?;\n(?=\n|$)/gm;
const INCLUDE_PAYLOAD_DECL = /^export type (Get\w+IncludePayload)<([^>]*)> =[\s\S]*?;\n(?=\n|$)/gm;
const COMPUTE_WRAP = /= A\.Compute<\n([\s\S]*?),\n {2}'flat'\n>;/g;
const QUERY_LINE = /^export const \w+ = client\.db\.\w+\.\w+\(.*\);\n/gm;
const SELECT_QUERY = /^(export const \w+ = [\w.]+\.findMany\()\{ select: .* \}\);$/m;

function isGenerated(path: string): boolean {
  return path.startsWith('gen/') && path.endsWith('.ts');
}

/** Applies `edit` to every generated file; throws when no file changed, naming the case */
function rewriteGenerated(tree: Tree, name: CaseName, edit: (text: string) => string): Map<string, string> {
  const next = new Map(tree);
  let changed = 0;

  for (const [path, text] of tree) {
    if (!isGenerated(path)) continue;

    const edited = edit(text);
    if (edited === text) continue;
    next.set(path, edited);
    changed++;
  }
  if (!changed) throw new Error(`case ${name}: its pattern matched nothing in the generated tree`);

  return next;
}

function consumerOf(tree: Tree, name: CaseName): string {
  const consumer = tree.get('consumer.ts');
  if (consumer === undefined) throw new Error(`case ${name}: the tree has no consumer.ts`);

  return consumer;
}

/** The consumer keeps its import and client but runs no query, so only the generated declarations are checked */
function noQueries(tree: Tree): Tree {
  const consumer = consumerOf(tree, 'no-queries');
  const next = consumer.replace(QUERY_LINE, '');
  if (next === consumer) throw new Error('case no-queries: the consumer has no query to remove');

  return new Map(tree).set('consumer.ts', next);
}

/** Every `{Model}Select` becomes an open record and the consumer drops its select query */
function noSelect(tree: Tree): Tree {
  const consumer = consumerOf(tree, 'no-select');
  const nextConsumer = consumer.replace(SELECT_QUERY, '$1{});');
  if (nextConsumer === consumer) throw new Error('case no-select: the consumer has no select query to drop');

  return rewriteGenerated(tree, 'no-select', (text) =>
    text.replace(SELECT_DECL, 'export type $1 = Record<string, unknown>;\n'),
  ).set('consumer.ts', nextConsumer);
}

/**
 * Every select becomes flat, with every field optional and nothing required: `AtLeastOne<{X}SelectFields>` is replaced by
 * `{X}SelectFields`, and a select still written as a union keeps its first variant with the required key made optional.
 * It accepts `select: {}`, which the generated type refuses, so it is a bound and never a candidate.
 */
function flatSelect(tree: Tree): Tree {
  return rewriteGenerated(tree, 'flat-select', (text) =>
    text.replace(SELECT_DECL, (declaration: string, name: string) => {
      const atLeastOne = /^export type \w+ = AtLeastOne<(\w+)>;\n$/.exec(declaration);
      if (atLeastOne) return `export type ${name} = ${atLeastOne[1]};\n`;

      // A select with no union variants is already flat, as tuple selects are
      if (!/^ {2}\| /m.test(declaration)) return declaration;

      const first = /^ {2}\| \(\{ (\w+): ([^{}]+?) \} & ([\s\S]*?)\)(?=\n {2}\| |;\n$)/m.exec(declaration);
      if (!first) throw new Error(`case flat-select: ${name} has no first variant in the expected shape`);

      return `export type ${name} = { ${first[1]}?: ${first[2]} } & ${first[3]};\n`;
    }),
  );
}

/** `Get{Model}IncludePayload` becomes `{}`, so an include adds nothing to a payload */
function noInclude(tree: Tree): Tree {
  return rewriteGenerated(tree, 'no-include', (text) =>
    text.replace(INCLUDE_PAYLOAD_DECL, 'export type $1<$2> = {};\n'),
  );
}

/** Drops the `A.Compute<..., 'flat'>` wrapper from `Get{Model}Payload` */
function noCompute(tree: Tree): Tree {
  return rewriteGenerated(tree, 'no-compute', (text) => text.replace(COMPUTE_WRAP, '=\n$1;'));
}

/** Paths of the type-only files of a generated tree, with their barrels */
function typeOnlyFiles(tree: Tree): string[] {
  return [...tree.keys()].filter(
    (path) => path.startsWith('gen/') && path.endsWith('.ts') && TYPE_ONLY_DIRS.includes(path.split('/')[1] ?? ''),
  );
}

/** The default layout: the generator itself wrote the type-only files as `.d.ts`, so the tree is measured as it is */
function declarations(tree: Tree): Tree {
  const files = typeOnlyFiles(tree);
  if (!files.length || files.some((path) => !path.endsWith('.d.ts'))) {
    throw new Error('case dts: the generated tree is not the default layout of type-only .d.ts files');
  }

  return tree;
}

/** `typeFiles: 'ts'`: the generator wrote plain `.ts` files, so the tree is measured as it is */
function plainTs(tree: Tree): Tree {
  const files = typeOnlyFiles(tree);
  if (!files.length || files.some((path) => path.endsWith('.d.ts'))) {
    throw new Error("case ts: the generated tree is not the typeFiles: 'ts' layout of plain .ts files");
  }

  return tree;
}

const RESOLVE_DECL = /^export type ResolveFieldSelect<FieldType, SelectValue> =[\s\S]*?;\n/m;
const SELECT_ARG_DECL = /^export type SelectArg<S, T> =[\s\S]*?;\n/m;
const DATA_ARG_DECL = /^export type DataArg<D, T> =[\s\S]*?;\n/m;
const INCLUDE_ARG_DECL = /^export type IncludeArg<I, T> =[\s\S]*?;\n/m;
const HEAVY_SELECT_MODEL = /^export interface UnsetTestSelectFields \{/m;
const HEAVY_QUERIES = 200;

type HeavyAblation = 'none' | 'resolve' | 'arg';

/**
 * A consumer that replaces the corpus consumer with 200 queries selecting every field of `UnsetTest`, which holds the
 * corpus's deepest object nesting. An ablation swaps one part of the select machinery in the generated client for a trivial
 * form: `resolve` makes `ResolveFieldSelect` return the field type unchanged (which also leaves `ApplyObjectSelect` and
 * `ApplyTupleSelect` unreached), `arg` makes `SelectArg` just `S & NoInfer<T>`, with no excess-key check and no recursion.
 */
function heavySelect(name: CaseName, ablation: HeavyAblation, layout: (tree: Tree) => Tree): (tree: Tree) => Tree {
  return (tree) => {
    layout(tree);
    if (![...tree].some(([path, text]) => isGenerated(path) && HEAVY_SELECT_MODEL.test(text))) {
      throw new Error(`case ${name}: the generated tree has no UnsetTest model to select from`);
    }

    const next = new Map(tree).set('consumer.ts', heavySelectConsumer(HEAVY_QUERIES));
    if (ablation === 'none') return next;

    const [pattern, trivial] =
      ablation === 'resolve'
        ? [RESOLVE_DECL, 'export type ResolveFieldSelect<FieldType, SelectValue> = FieldType;\n']
        : [SELECT_ARG_DECL, 'export type SelectArg<S, T> = S & NoInfer<T>;\n'];

    return rewriteGenerated(next, name, (text) => text.replace(pattern, trivial));
  };
}

const WRITE_QUERIES = 600;
const INCLUDE_QUERIES = 200;

/**
 * `heavy-write` and `heavy-include`: a consumer of mixed nested `updateMany` writes or nested includes with selects over the
 * corpus. The ablation swaps `DataArg` or `IncludeArg` in the generated client for `D & NoInfer<T>` or `I & NoInfer<T>`,
 * with no excess-key check and no recursion.
 */
function heavyArg(name: CaseName, kind: 'write' | 'include', ablated: boolean): BenchCase {
  const [source, pattern, trivial] =
    kind === 'write'
      ? [heavyWriteConsumer(WRITE_QUERIES), DATA_ARG_DECL, 'export type DataArg<D, T> = D & NoInfer<T>;\n']
      : [heavyIncludeConsumer(INCLUDE_QUERIES), INCLUDE_ARG_DECL, 'export type IncludeArg<I, T> = I & NoInfer<T>;\n'];

  return {
    corpusOnly: true,
    transform: (tree) => {
      declarations(tree);
      if (![...tree].some(([path, text]) => isGenerated(path) && HEAVY_SELECT_MODEL.test(text))) {
        throw new Error(`case ${name}: the generated tree has no UnsetTest model to write to`);
      }

      const next = new Map(tree).set('consumer.ts', source);

      return ablated ? rewriteGenerated(next, name, (text) => text.replace(pattern, trivial)) : next;
    },
    variants: [DEFAULT_VARIANT],
  };
}

const REGISTRY_DECL = /^export const (\w+Registry): (\w+) = \{\n([\s\S]*?)\n\};$/gm;
const REGISTRY_ENTRY = /^ {2}(\w+): (?:\{.*\}|\{\n[\s\S]*?\n {2}\}),$/gm;
const MIGRATIONS_DECL = /^export const migrationsByModel: Record<ModelName, string\[\]> = \{\n([\s\S]*?)\n\};$/m;
const MIGRATION_ENTRY = /^ {2}(\w+): (?:\[.*\]|\[\n[\s\S]*?\n {2}\]),$/gm;

interface Entry {
  readonly name: string;
  readonly text: string;
}

/** The entries of an object literal body, throwing when anything in the body is not an entry of the expected shape */
function entriesOf(body: string, pattern: RegExp, where: string): Entry[] {
  const entries = [...body.matchAll(pattern)].map((match) => ({ name: match[1]!, text: match[0] }));
  if (entries.map((entry) => entry.text).join('\n') !== body) {
    throw new Error(`case split-output: ${where} has entries in a shape the transform does not read`);
  }

  return entries;
}

/** Everything after the first line, up to the trailing comma: the value an entry's key points at */
function valueOf(entry: Entry): string {
  return entry.text.slice(entry.text.indexOf(': ') + 2, -1);
}

function splitFileName(name: string): string {
  return name.toLowerCase();
}

/**
 * Moves each registry entry and each model's migration statements into a file of its own and leaves `internal/model-registry.ts`
 * and `internal/migrations.ts` as aggregators that export the same names. The values are the generator's own text, so the
 * split changes where they live and nothing about what they are.
 */
function splitOutput(tree: Tree): Tree {
  const next = new Map(tree);
  const registryPath = 'gen/internal/model-registry.ts';
  const migrationsPath = 'gen/internal/migrations.ts';
  const registry = tree.get(registryPath);
  const migrations = tree.get(migrationsPath);
  if (registry === undefined || migrations === undefined) {
    throw new Error('case split-output: the generated tree has no internal registry or migrations file');
  }

  const registryImports: string[] = [];
  const splitRegistry = registry.replace(REGISTRY_DECL, (_whole, constName: string, type: string, body: string) => {
    const dir = `${constName.slice(0, -'Registry'.length).toLowerCase()}s`;
    const entries = entriesOf(body, REGISTRY_ENTRY, constName);
    const keys = entries.map((entry, index) => {
      const file = splitFileName(entry.name);
      next.set(
        `gen/internal/registry/${dir}/${file}.ts`,
        `import type { ${type} } from 'cerial';\n\nexport const entry: ${type}[string] = ${valueOf(entry)};\n`,
      );
      registryImports.push(`import { entry as ${dir}${index} } from './registry/${dir}/${file}';`);

      return `  ${entry.name}: ${dir}${index},`;
    });

    return `export const ${constName}: ${type} = {${keys.length ? `\n${keys.join('\n')}\n` : ''}};`;
  });
  if (splitRegistry === registry || !registryImports.length) {
    throw new Error('case split-output: the model registry has no entries to move');
  }
  next.set(registryPath, splitRegistry.replace(/^(import type .*\n)/m, `$1${registryImports.join('\n')}\n`));

  const migrationImports: string[] = [];
  const splitMigrations = migrations.replace(MIGRATIONS_DECL, (_whole, body: string) => {
    const keys = entriesOf(body, MIGRATION_ENTRY, 'migrationsByModel').map((entry, index) => {
      const file = splitFileName(entry.name);
      next.set(`gen/internal/migrations/${file}.ts`, `export const statements: string[] = ${valueOf(entry)};\n`);
      migrationImports.push(`import { statements as statements${index} } from './migrations/${file}';`);

      return `  ${entry.name}: statements${index},`;
    });

    return `export const migrationsByModel: Record<ModelName, string[]> = {\n${keys.join('\n')}\n};`;
  });
  if (splitMigrations === migrations || !migrationImports.length) {
    throw new Error('case split-output: the migrations file has no model statements to move');
  }

  return next.set(migrationsPath, `${migrationImports.join('\n')}\n${splitMigrations}`);
}

/** The first model's interface name, read from the barrel of `gen/models` so the same case runs on any schema */
function firstModel(tree: Tree, name: CaseName): string {
  for (const path of [...tree.keys()].sort()) {
    const stem = /^gen\/models\/(?!index\.)([^/.]+)\.(?:d\.)?ts$/.exec(path)?.[1];
    if (stem === undefined) continue;

    // The file is named for its model in lower case, and holds the model's other interfaces beside it
    const model = [...tree.get(path)!.matchAll(/^export interface (\w+) /gm)].find(
      (match) => match[1]!.toLowerCase() === stem,
    );
    if (model) return model[1]!;
  }

  throw new Error(`case ${name}: the generated tree has no model interface to import`);
}

/** A consumer that imports one model from the `models/` barrel or from the root barrel and checks nothing else */
function barrel(name: CaseName, from: './gen/models' | './gen'): (tree: Tree) => Tree {
  return (tree) => {
    const model = firstModel(tree, name);

    return new Map(tree).set(
      'consumer.ts',
      `import type { ${model} } from '${from}';\n\nexport type Probe = ${model};\n`,
    );
  };
}

const DEFAULT_VARIANT: CaseVariant = { label: '', skipLibCheck: true };
const STRICT_VARIANT: CaseVariant = { label: ' skipLibCheck=false', skipLibCheck: false };

function heavyCase(name: CaseName, ablation: HeavyAblation, layout: 'dts' | 'ts'): BenchCase {
  return {
    ...(layout === 'ts' ? { typeFiles: 'ts' as const } : {}),
    corpusOnly: true,
    transform: heavySelect(name, ablation, layout === 'ts' ? plainTs : declarations),
    variants: [DEFAULT_VARIANT],
  };
}

export const CASES: Record<CaseName, BenchCase> = {
  'no-queries': { transform: noQueries, variants: [DEFAULT_VARIANT] },
  'no-select': { transform: noSelect, variants: [DEFAULT_VARIANT] },
  'flat-select': { transform: flatSelect, variants: [DEFAULT_VARIANT] },
  'no-include': { transform: noInclude, variants: [DEFAULT_VARIANT] },
  'no-compute': { transform: noCompute, variants: [DEFAULT_VARIANT] },
  // The second row of each layout type-checks the files that `skipLibCheck: true` would skip
  dts: { transform: declarations, variants: [DEFAULT_VARIANT, STRICT_VARIANT] },
  ts: { typeFiles: 'ts', transform: plainTs, variants: [DEFAULT_VARIANT, STRICT_VARIANT] },
  'heavy-select': heavyCase('heavy-select', 'none', 'dts'),
  'heavy-select-ts': heavyCase('heavy-select-ts', 'none', 'ts'),
  'heavy-select-no-resolve': heavyCase('heavy-select-no-resolve', 'resolve', 'dts'),
  'heavy-select-no-resolve-ts': heavyCase('heavy-select-no-resolve-ts', 'resolve', 'ts'),
  'heavy-select-no-arg': heavyCase('heavy-select-no-arg', 'arg', 'dts'),
  'heavy-select-no-arg-ts': heavyCase('heavy-select-no-arg-ts', 'arg', 'ts'),
  'heavy-write': heavyArg('heavy-write', 'write', false),
  'heavy-write-no-arg': heavyArg('heavy-write-no-arg', 'write', true),
  'heavy-include': heavyArg('heavy-include', 'include', false),
  'heavy-include-no-arg': heavyArg('heavy-include-no-arg', 'include', true),
  'split-output': { transform: splitOutput, variants: [DEFAULT_VARIANT] },
  'barrel-models': {
    consumerOnly: true,
    transform: barrel('barrel-models', './gen/models'),
    variants: [DEFAULT_VARIANT],
  },
  'barrel-root': { consumerOnly: true, transform: barrel('barrel-root', './gen'), variants: [DEFAULT_VARIANT] },
};

export function isCaseName(value: string): value is CaseName {
  return (CASE_NAMES as readonly string[]).includes(value);
}
