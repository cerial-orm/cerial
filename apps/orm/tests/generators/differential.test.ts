/**
 * The two frontends must agree: `parse()` of a `.cerial` file and the builder's materialise pass over its
 * TypeScript twin have to produce the same raw `SchemaAST`, key for key.
 *
 * Comparison unit: one `.cerial` file against one twin module, the file-for-file tree under
 * `tests/e2e/schemas-ts/`. Names a file uses from other files are resolved the way `generate` resolves
 * them. The `.cerial` side is parsed with the name sets of the whole corpus, and the twin side is
 * materialised together with the twin modules it imports (real imports between twins), then cut down
 * to the declarations that module itself exports.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadDeclarations, materialise } from '../../src/parser/builder';
import { parse } from '../../src/parser/parser';
import type { SchemaAST } from '../../src/types';
import { loadCorpus, SCHEMAS_DIR } from './parity-corpus';

const TWINS_DIR = join(import.meta.dir, '..', 'e2e', 'schemas-ts');
const LISTS = ['models', 'objects', 'tuples', 'literals', 'enums'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Drop `range` and `origin` at every depth and nothing else. A node the builder makes has no position in
 * any source text and its origin names a module export, so neither can equal the parser's.
 */
export function withoutPosition(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPosition);
  if (!isRecord(value)) return value;

  const kept: Record<string, unknown> = {};
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

function byName(items: readonly { readonly name: string }[]): { readonly name: string }[] {
  return [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Compare two raw ASTs. Each top-level array is compared by name, because a materialised AST is sorted by
 * name while the parser keeps file order; everything inside a declaration stays positional. `source` is
 * left out of both sides: it is the schema text, which a built AST does not have.
 */
export function compareAsts(parsed: SchemaAST, built: SchemaAST): string[] {
  const { source: _parsedSource, ...parsedRest } = parsed;
  const { source: _builtSource, ...builtRest } = built;
  const found = differences(Object.keys(parsedRest).sort(), Object.keys(builtRest).sort(), '$ keys');

  for (const list of LISTS) {
    const left = byName(parsed[list]);
    const right = byName(built[list]);
    const names = (items: readonly { readonly name: string }[]): string[] => items.map((item) => item.name);
    const same = differences(names(left), names(right), `${list} names`);
    if (same.length) {
      found.push(...same);
      continue;
    }
    left.forEach((item, i) =>
      found.push(...differences(withoutPosition(item), withoutPosition(right[i]), `${list}.${item.name}`)),
    );
  }

  return found;
}

/** The twin of `schemas/<dir>/<name>.cerial` is `schemas-ts/<dir>/<name>.schema.ts`. */
export function twinPathOf(cerialPath: string): string {
  const relative = cerialPath.slice(SCHEMAS_DIR.length + 1).replace(/\.cerial$/, '.schema.ts');

  return join(TWINS_DIR, relative);
}

function localImports(module: string): string[] {
  const found: string[] = [];
  for (const [, specifier] of readFileSync(module, 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
    const target = resolve(dirname(module), specifier!);
    for (const candidate of [target, `${target}.ts`]) {
      if (candidate.startsWith(TWINS_DIR) && existsSync(candidate) && candidate.endsWith('.ts')) found.push(candidate);
    }
  }

  return found;
}

/** The module and the twin modules it imports, transitively. */
function closureOf(module: string, seen = new Set<string>()): string[] {
  if (seen.has(module)) return [...seen];
  seen.add(module);
  for (const next of localImports(module)) closureOf(next, seen);

  return [...seen];
}

/** `parse()` of one corpus file, with the name sets of the whole corpus as `generate` supplies them. */
function parsedAst(cerialPath: string): SchemaAST {
  const corpus = loadCorpus();
  const index = corpus.files.indexOf(cerialPath.slice(SCHEMAS_DIR.length + 1));
  if (index < 0) throw new Error(`${cerialPath} is not in the corpus`);

  return corpus.parsed[index]!;
}

/** The load-plus-materialise pass over a twin and its imports, keeping what the twin itself exports. */
async function builtAst(twinPath: string): Promise<SchemaAST> {
  const all = materialise(await loadDeclarations(closureOf(twinPath)));
  const own = <T extends { readonly origin: { readonly file: string } }>(items: readonly T[]): T[] =>
    items.filter((item) => item.origin.file === twinPath);

  return {
    models: own(all.models),
    objects: own(all.objects),
    tuples: own(all.tuples),
    literals: own(all.literals),
    enums: own(all.enums),
    source: '',
  };
}

/** Differences between a `.cerial` file and its twin; empty when they agree. */
export async function differentialOf(cerialPath: string): Promise<string[]> {
  const twin = twinPathOf(cerialPath);
  if (!existsSync(twin)) return [`no twin at ${twin}`];

  return compareAsts(parsedAst(cerialPath), await builtAst(twin));
}

describe('the comparison itself', () => {
  test('toEqual cannot see an own key set to undefined, and differences can', () => {
    const withKey: Record<string, unknown> = { a: undefined };

    expect(withKey).toEqual({});
    expect(differences({ a: undefined }, {})).toEqual(['$.a: only in the first']);
    expect(differences({}, { a: undefined })).toEqual(['$.a: only in the second']);
  });

  test('an extra isArray: false fails, and an equal value passes', () => {
    expect(differences({ isArray: false, name: 'x' }, { name: 'x' })).toEqual(['$.isArray: only in the first']);
    expect(differences({ name: 'x', list: [1, { k: 2 }] }, { name: 'x', list: [1, { k: 2 }] })).toEqual([]);
  });

  test('arrays inside a declaration are positional, and values and lengths are compared', () => {
    expect(differences([1, 2], [2, 1])).toHaveLength(2);
    expect(differences([1], [1, 2])).toEqual(['$: length 1 against 2']);
    expect(differences({ a: 1 }, { a: '1' })).toHaveLength(1);
    expect(differences({ a: [] }, { a: {} })).toEqual(['$.a: array against non-array']);
  });

  test('only range and origin are dropped, at every depth', () => {
    const value = { range: 1, origin: 2, rangeless: 3, list: [{ range: 4, kept: undefined }] };

    expect(withoutPosition(value)).toStrictEqual({ rangeless: 3, list: [{ kept: undefined }] });
  });

  const source = (names: string[]) => names.map((name) => `model ${name} {\n  id Record @id\n}`).join('\n');

  test('top-level arrays are compared by name, not position', () => {
    expect(compareAsts(parse(source(['A', 'B'])).ast, parse(source(['B', 'A'])).ast)).toEqual([]);
  });

  test('a different set of names fails, as does a different count', () => {
    expect(compareAsts(parse(source(['A', 'B'])).ast, parse(source(['A', 'C'])).ast)).not.toEqual([]);
    expect(compareAsts(parse(source(['A', 'B'])).ast, parse(source(['A'])).ast)).not.toEqual([]);
  });

  test('fields inside a declaration are positional', () => {
    const one = parse('model A {\n  id Record @id\n  x Int\n  y Int\n}').ast;
    const other = parse('model A {\n  id Record @id\n  y Int\n  x Int\n}').ast;

    expect(compareAsts(one, other)).not.toEqual([]);
  });

  test('source never decides the result', () => {
    const one = parse(source(['A'])).ast;

    expect(compareAsts(one, { ...one, source: '' })).toEqual([]);
  });
});

for (const directory of readdirSync(TWINS_DIR).sort()) {
  const files = readdirSync(join(SCHEMAS_DIR, directory))
    .filter((file) => file.endsWith('.cerial'))
    .sort();

  describe(`${directory}/`, () => {
    test.each(files)('%s matches its twin', async (file) => {
      expect(await differentialOf(join(SCHEMAS_DIR, directory, file))).toEqual([]);
    });
  });
}

describe('the comparison', () => {
  test('a key added to a twin node is reported', async () => {
    const twin = await builtAst(twinPathOf(join(SCHEMAS_DIR, 'core/test-basics.cerial')));
    const parsed = parsedAst(join(SCHEMAS_DIR, 'core/test-basics.cerial'));
    const field = twin.models.find((model) => model.name === 'Post')!.fields[1]!;
    (field as unknown as Record<string, unknown>).isArray = false;

    expect(compareAsts(parsed, twin)).toEqual(['models.Post.fields[1].isArray: only in the second']);
  });

  test('a missing twin is reported by path', async () => {
    expect(await differentialOf(join(SCHEMAS_DIR, 'core/nope.cerial'))).toEqual([
      `no twin at ${join(TWINS_DIR, 'core/nope.schema.ts')}`,
    ]);
  });
});
