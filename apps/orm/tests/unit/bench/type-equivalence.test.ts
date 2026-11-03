import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CASES } from '../../../bench/cases';
import {
  compareTrees,
  enumerateTree,
  formatReport,
  parseDeclarations,
  readTypeTree,
} from '../../../bench/type-equivalence';

const DIST = join(import.meta.dir, '..', '..', '..', 'dist', 'index.d.mts');
const GENERATED = join(import.meta.dir, '..', '..', 'e2e', 'generated');
const withDist = existsSync(DIST) ? describe : describe.skip;
const withGenerated = existsSync(DIST) && existsSync(join(GENERATED, 'index.ts')) ? describe : describe.skip;

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const ITEM = `export interface Item {
  id: string;
  name: string;
  note?: string;
}

export type ItemSelect =
  | ({ id: boolean } & { name?: boolean; note?: boolean })
  | ({ name: boolean } & { id?: boolean; note?: boolean })
  | ({ note: boolean } & { id?: boolean; name?: boolean });

export type GetItemPayload<S extends ItemSelect | undefined = undefined> = S extends ItemSelect
  ? { [K in keyof S as S[K] extends false | undefined ? never : K]: K extends keyof Item ? Item[K] : never }
  : Item;

export interface ItemModel {
  find<S extends ItemSelect | undefined = undefined>(options?: { select?: S }): GetItemPayload<S>[];
  count(): number;
}
`;

const INDEX = `export type Wrap<T, K extends string = 'x'> = { [P in K]: T };
export type { Item } from './models/item';
`;

type Files = Record<string, string>;

const BASE: Files = { 'models/item.ts': ITEM, 'index.ts': INDEX };

function writeTree(files: Files): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-type-equivalence-test-'));
  roots.push(dir);

  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }

  return dir;
}

/** The base tree with one edit to the Item model file */
function edited(from: string, to: string): Files {
  if (!ITEM.includes(from)) throw new Error(`fixture has no "${from}"`);

  return { ...BASE, 'models/item.ts': ITEM.replace(from, to) };
}

async function compare(after: Files) {
  return compareTrees(writeTree(BASE), writeTree(after));
}

describe('parseDeclarations', () => {
  test('reads type parameters with constraints, defaults and nested brackets', () => {
    const [declaration] = parseDeclarations(
      `export type Pick2<T extends Record<string, (a: number) => void> = {}, K = 'a' | 'b'> = T;\n`,
    );

    expect(declaration?.name).toBe('Pick2');
    expect(declaration?.params).toEqual([
      { name: 'T', constraint: 'Record<string, (a: number) => void>', fallback: '{}' },
      { name: 'K', constraint: null, fallback: "'a' | 'b'" },
    ]);
  });

  test('a name with a dollar sign and a declaration without parameters', () => {
    const found = parseDeclarations(`export interface A$Relations {\n  x: 1;\n}\nexport type B = string;\n`);

    expect(found.map((declaration) => [declaration.name, declaration.kind, declaration.params.length])).toEqual([
      ['A$Relations', 'interface', 0],
      ['B', 'type', 0],
    ]);
  });
});

describe('enumerateTree', () => {
  test('lists every exported declaration with samples, and generic ones with several', () => {
    const declarations = enumerateTree(readTypeTree(writeTree(BASE)));

    expect([...declarations.keys()].sort()).toEqual(['GetItemPayload', 'Item', 'ItemModel', 'ItemSelect', 'Wrap']);
    // One sample per select key and one for all keys, besides the base and the constraint
    expect(declarations.get('GetItemPayload')!.samples.length).toBeGreaterThan(4);
    // An interface with generic methods is compared member by member
    expect(declarations.get('ItemModel')!.samples.map((sample) => sample.id.split('#')[0])).toContain(
      'ItemModel.count',
    );
  });

  test('refuses a name declared in two files', () => {
    const tree = readTypeTree(writeTree({ ...BASE, 'other.ts': 'export type Wrap<T> = T;\n' }));

    expect(() => enumerateTree(tree)).toThrow('Wrap is declared in both');
  });
});

describe('compareTrees', () => {
  test('an identical pair passes under both compilers and lists no Flat use', async () => {
    const report = await compare(BASE);

    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.compilers).toEqual(['5.9', '7']);
    expect(report.generics).toBeGreaterThanOrEqual(3);
    expect(report.flatFallbacks).toEqual([]);
  }, 60_000);

  test('one extra optional key fails, which mutual assignability would accept', async () => {
    const report = await compare(edited('  note?: string;\n}', '  note?: string;\n  extra?: number;\n}'));

    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.sample)).toContain('Item#0');
    for (const compiler of ['5.9', '7'] as const) {
      expect(report.failures.some((failure) => failure.compiler === compiler)).toBe(true);
    }
  }, 60_000);

  test('readonly on one key fails', async () => {
    const report = await compare(edited('  id: string;\n  name', '  readonly id: string;\n  name'));

    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.sample)).toContain('Item#0');
  }, 60_000);

  test('any on one key fails', async () => {
    const report = await compare(edited('  name: string;\n  note', '  name: any;\n  note'));

    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.sample)).toContain('Item#0');
  }, 60_000);

  test('a type that is any after fails with the refusal, not the generic reason', async () => {
    const report = await compare(
      edited('export interface Item {', 'export type Item = any;\nexport interface Unused {'),
    );

    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.reason)).toContain('after is any');
  }, 60_000);

  test('a changed generic result fails on its sample', async () => {
    const report = await compare(edited('? Item[K] : never }', '? Item[K] | null : never }'));

    expect(report.ok).toBe(false);
    expect(report.failures.some((failure) => failure.sample.startsWith('GetItemPayload#'))).toBe(true);
  }, 60_000);

  test('an exported type removed or added fails', async () => {
    const removed = await compare({
      'models/item.ts': ITEM,
      'index.ts': "export type { Item } from './models/item';\n",
    });
    const added = await compare({ ...BASE, 'index.ts': `${INDEX}export type Extra = string;\n` });

    expect(removed.ok).toBe(false);
    expect(removed.removed).toEqual(['Wrap']);
    expect(added.ok).toBe(false);
    expect(added.added).toEqual(['Extra']);
  }, 60_000);

  test('a method instantiation that changes fails on its member sample', async () => {
    const report = await compare(edited('GetItemPayload<S>[];', 'GetItemPayload<S>[] | null;'));

    expect(report.ok).toBe(false);
    expect(report.failures.some((failure) => failure.sample.startsWith('ItemModel.find#'))).toBe(true);
  }, 60_000);
});

withDist('Flat fallback', () => {
  test('a form equal but not identical passes through Flat and is listed', async () => {
    const before = { ...BASE, 'index.ts': `${INDEX}export type Pair = { a: string } & { b: number };\n` };
    const after = { ...BASE, 'index.ts': `${INDEX}export type Pair = { a: string; b: number };\n` };
    const strict = await compareTrees(writeTree(before), writeTree(after), { compilers: ['7'] });
    const flat = await compareTrees(writeTree(before), writeTree(after), {
      compilers: ['7'],
      flatFallback: ['Pair#0'],
    });

    expect(strict.ok).toBe(false);
    expect(strict.failures.map((failure) => failure.sample)).toEqual(['Pair#0']);
    expect(flat.ok).toBe(true);
    expect(flat.flatFallbacks).toEqual(['Pair#0']);
    expect(formatReport(flat)).toContain('compared through Flat: Pair#0');
  }, 60_000);
});

withGenerated('the generated e2e tree', () => {
  test('the flat select form the benchmark uses as a bound is not identical to the generated one', async () => {
    const tree = new Map<string, string>([['consumer.ts', '']]);
    for (const [path, text] of readTypeTree(GENERATED)) tree.set(`gen/${path}`, text);

    const flat = writeTree({});
    for (const [path, text] of CASES['flat-select'].transform(tree)) {
      if (!path.startsWith('gen/')) continue;
      mkdirSync(dirname(join(flat, path.slice(4))), { recursive: true });
      writeFileSync(join(flat, path.slice(4)), text);
    }

    const identical = await compareTrees(GENERATED, GENERATED, { compilers: ['7'] });
    const report = await compareTrees(GENERATED, flat, { compilers: ['7'] });

    expect(identical.failures).toEqual([]);
    expect(identical.ok).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.sample)).toContain('ObjectTestUserSelect#0');
  }, 180_000);
});
