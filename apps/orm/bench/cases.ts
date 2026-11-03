/**
 * Named transforms over generated output. Each takes the tree a case directory holds (paths relative to it: `gen/...` and
 * `consumer.ts`) and returns a new tree, so the generator is never touched and a result can be reproduced from the same input.
 * A transform throws when its pattern matches nothing, so a generator change cannot turn a case into a silent no-op.
 */
export type Tree = ReadonlyMap<string, string>;

export const CASE_NAMES = ['no-queries', 'no-select', 'flat-select', 'no-include', 'no-compute', 'dts'] as const;
export type CaseName = (typeof CASE_NAMES)[number];

export interface CaseVariant {
  /** Appended to the row name; empty for the default run */
  readonly label: string;
  readonly skipLibCheck: boolean;
}

export interface BenchCase {
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
 * Keeps the first variant of each select union with its required key made optional: every field optional and nothing
 * required. It accepts `select: {}`, which the union refuses, so it is a bound and never a candidate.
 */
function flatSelect(tree: Tree): Tree {
  return rewriteGenerated(tree, 'flat-select', (text) =>
    text.replace(SELECT_DECL, (declaration: string, name: string) => {
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

/** Type-only files move to `.d.ts` under the same names, barrels included; content is byte-identical */
function dts(tree: Tree): Tree {
  const next = new Map<string, string>();
  let renamed = 0;

  for (const [path, text] of tree) {
    const folder = path.split('/')[1];
    const typeOnly = path.startsWith('gen/') && path.endsWith('.ts') && TYPE_ONLY_DIRS.includes(folder ?? '');
    if (!typeOnly || path.endsWith('.d.ts')) {
      next.set(path, text);
      continue;
    }

    next.set(`${path.slice(0, -'.ts'.length)}.d.ts`, text);
    renamed++;
  }
  if (!renamed) throw new Error('case dts: the generated tree has no type-only file to rename');

  return next;
}

const DEFAULT_VARIANT: CaseVariant = { label: '', skipLibCheck: true };

export const CASES: Record<CaseName, BenchCase> = {
  'no-queries': { transform: noQueries, variants: [DEFAULT_VARIANT] },
  'no-select': { transform: noSelect, variants: [DEFAULT_VARIANT] },
  'flat-select': { transform: flatSelect, variants: [DEFAULT_VARIANT] },
  'no-include': { transform: noInclude, variants: [DEFAULT_VARIANT] },
  'no-compute': { transform: noCompute, variants: [DEFAULT_VARIANT] },
  // The second row type-checks the declaration files that `skipLibCheck: true` would skip
  dts: { transform: dts, variants: [DEFAULT_VARIANT, { label: ' skipLibCheck=false', skipLibCheck: false }] },
};

export function isCaseName(value: string): value is CaseName {
  return (CASE_NAMES as readonly string[]).includes(value);
}
