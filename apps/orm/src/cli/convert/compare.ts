import type { SchemaAST } from '../../types';

const LISTS = ['models', 'objects', 'tuples', 'literals', 'enums'] as const;

/** Provenance and position: a node made by another frontend or printed again cannot equal them. */
const NOT_STRUCTURE = new Set(['range', 'origin', 'source', 'position']);

/** `true` tolerates the difference everywhere, a list of names only for those names. */
export type ToleranceScope = boolean | readonly string[];

export interface CompareTolerance {
  /** Composite directives of a model may differ in the order of their kinds; scoped by model name. */
  readonly directiveKindOrder?: ToleranceScope;
  /** Declarations may differ in their position in a list; scoped by declaration name. */
  readonly declarationOrder?: ToleranceScope;
}

export interface CompareOptions {
  /** Each tolerance is off unless named. */
  readonly tolerate?: CompareTolerance;
}

type Node = Record<string, unknown>;

function isRecord(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inScope(scope: ToleranceScope | undefined, name: string): boolean {
  if (scope === undefined || scope === false) return false;

  return scope === true || scope.includes(name);
}

/**
 * Drop `range` and `origin` at every depth and nothing else. A node the builder makes has no position in
 * any source text and its origin names a module export, so neither can equal the parser's.
 */
export function withoutPosition(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPosition);
  if (!isRecord(value)) return value;

  const kept: Node = {};
  for (const key of Object.keys(value)) {
    if (key !== 'range' && key !== 'origin') kept[key] = withoutPosition(value[key]);
  }

  return kept;
}

/**
 * Every difference between two values as a path and a reason. It walks own keys itself because
 * `expect().toEqual` treats `{ a: undefined }` as equal to `{}`, which would hide a builder that sets a
 * key the parser leaves out. Arrays compare positionally.
 */
export function differences(left: unknown, right: unknown, path = '$'): string[] {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return [`${path}: array against non-array`];
    const found = left.length === right.length ? [] : [`${path}: length ${left.length} against ${right.length}`];
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      found.push(...differences(left[i], right[i], `${path}[${i}]`));
    }

    return found;
  }
  if (isRecord(left) && isRecord(right)) {
    const found: string[] = [];
    for (const key of Object.keys(left)) {
      if (!Object.hasOwn(right, key)) found.push(`${path}.${key}: only in the first`);
      else found.push(...differences(left[key], right[key], `${path}.${key}`));
    }
    for (const key of Object.keys(right)) {
      if (!Object.hasOwn(left, key)) found.push(`${path}.${key}: only in the second`);
    }

    return found;
  }

  return Object.is(left, right) ? [] : [`${path}: ${JSON.stringify(left)} against ${JSON.stringify(right)}`];
}

/** `source` is the schema text, which a built AST does not have. */
function exactForm(ast: SchemaAST): Node {
  const { source: _source, ...rest } = ast;

  return rest as unknown as Node;
}

/**
 * The printer writes decorators in a fixed order, not source order, and no decorator's meaning depends on
 * its neighbours' position. So decorator lists compare as sets. The JSON pass also drops keys set to
 * `undefined`, which the exact form keeps.
 */
function structureForm(ast: SchemaAST): Node {
  return JSON.parse(
    JSON.stringify(ast, (key, value) => {
      if (NOT_STRUCTURE.has(key)) return undefined;
      if (key === 'decorators' && Array.isArray(value))
        return [...value].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

      return value;
    }),
  );
}

function nameOf(item: unknown): string {
  return isRecord(item) && typeof item.name === 'string' ? item.name : '';
}

/** Group a model's directives by kind, each kind keeping its own order. */
function withKindsGrouped(item: unknown, list: string, scope: ToleranceScope | undefined): unknown {
  if (list !== 'models' || !isRecord(item) || !Array.isArray(item.directives)) return item;
  if (!inScope(scope, nameOf(item))) return item;
  const kinds = [...new Set(item.directives.map((directive) => (isRecord(directive) ? directive.kind : undefined)))];
  const rank = (directive: unknown): number => kinds.indexOf(isRecord(directive) ? directive.kind : undefined);
  const grouped = item.directives.map((directive, index) => ({ directive, index }));
  grouped.sort((a, b) => rank(a.directive) - rank(b.directive) || a.index - b.index);

  return { ...item, directives: grouped.map(({ directive }) => directive) };
}

/**
 * Items in scope are matched by name wherever they sit; the rest keep their positions relative to each
 * other. A name in scope that is on one side only, or a count that differs, is still a difference.
 */
function compareList(
  list: string,
  left: readonly unknown[],
  right: readonly unknown[],
  tolerate: CompareTolerance,
): string[] {
  const inKindScope = tolerate.directiveKindOrder;
  const prepared = (items: readonly unknown[]): unknown[] =>
    items.map((item) => withKindsGrouped(item, list, inKindScope));
  const lefts = prepared(left);
  const rights = prepared(right);
  const movable = (item: unknown): boolean => inScope(tolerate.declarationOrder, nameOf(item));
  const fixedLeft = lefts.filter((item) => !movable(item));
  const fixedRight = rights.filter((item) => !movable(item));
  const names = (items: readonly unknown[]): string[] => items.map(nameOf);
  const movedLeft = lefts.filter(movable);
  const movedRight = rights.filter(movable);
  const found = differences(names(fixedLeft), names(fixedRight), `${list} names`);
  found.push(...differences(names(movedLeft).sort(), names(movedRight).sort(), `${list} moved names`));
  if (found.length) return found;

  fixedLeft.forEach((item, i) => found.push(...differences(item, fixedRight[i], `${list}.${nameOf(item)}`)));
  const byName = new Map(movedRight.map((item) => [nameOf(item), item]));
  for (const item of movedLeft) found.push(...differences(item, byName.get(nameOf(item)), `${list}.${nameOf(item)}`));

  return found;
}

function compare(left: Node, right: Node, options: CompareOptions | undefined): string[] {
  const tolerate = options?.tolerate ?? {};
  const found = differences(Object.keys(left).sort(), Object.keys(right).sort(), '$ keys');

  for (const key of Object.keys(left)) {
    if (!Object.hasOwn(right, key)) continue;
    const one = left[key];
    const other = right[key];
    if ((LISTS as readonly string[]).includes(key) && Array.isArray(one) && Array.isArray(other)) {
      found.push(...compareList(key, one, other, tolerate));
    } else if (key !== 'source') {
      found.push(...differences(one, other, `$.${key}`));
    }
  }

  return found;
}

/**
 * Compare two raw ASTs, every array positionally: a materialised AST keeps the parser's file-then-declaration
 * order, and the generated client follows that order. Position and `source` are left out of both sides, and
 * a key set to `undefined` against an absent key is a difference.
 */
export function compareExact(left: SchemaAST, right: SchemaAST, options?: CompareOptions): string[] {
  return compare(withoutPosition(exactForm(left)) as Node, withoutPosition(exactForm(right)) as Node, options);
}

/** Compare two ASTs by structure: decorators as sets, position and provenance dropped. */
export function compareStructure(left: SchemaAST, right: SchemaAST, options?: CompareOptions): string[] {
  return compare(structureForm(left), structureForm(right), options);
}
