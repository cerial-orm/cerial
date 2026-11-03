import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CASE_NAMES, CASES, type CaseName, isCaseName, type Tree } from '../../../bench/cases';
import { runTsc } from '../../../bench/compilers';
import { parseBenchArgs, readTree, runBench, writeTree } from '../../../bench/curve';

const DIST = join(import.meta.dir, '..', '..', '..', 'dist', 'index.d.mts');
const withDist = existsSync(DIST) ? describe : describe.skip;

const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-bench-cases-'));
  roots.push(dir);

  return dir;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const MODEL = `import type { Object as O, Any as A } from 'ts-toolbelt';

export interface UserSelectFields {
  id?: boolean;
  name?: boolean;
  profile?: boolean | ProfileSelect;
}

export type UserSelect = AtLeastOne<UserSelectFields>;

export type GetUserIncludePayload<I extends UserInclude | undefined> = I extends UserInclude
  ? Pick<{ posts: Post[] }, Extract<keyof I, 'posts'>>
  : {};

export type GetUserPayload<
  S extends UserSelect | undefined = undefined,
  I extends UserInclude | undefined = undefined,
> = A.Compute<
  S extends UserSelect
    ? { [K in keyof S]: K }
    : User,
  'flat'
>;
`;

const CONSUMER = `import type { CerialClient } from './gen';

declare const client: CerialClient;

export const nestedSelect = client.db.User.findMany({ select: { name: true, profile: { label: true } } });
export const nestedInclude = client.db.User.findMany({ include: { posts: true } });
`;

const UNION_SELECT = `export type UserSelect =
  | ({ id: boolean } & { name?: boolean; profile?: boolean | ProfileSelect })
  | ({ name: boolean } & { id?: boolean; profile?: boolean | ProfileSelect });
`;

const SELECT_ONLY = 'export type UserSelect = { id: boolean };\n';

function treeOf(entries: Record<string, string>): Tree {
  return new Map(Object.entries(entries));
}

const FULL = treeOf({
  'consumer.ts': CONSUMER,
  'gen/models/user.ts': MODEL,
  'gen/models/index.ts': `export * from './user';\n`,
  'gen/enums/role.ts': `export const Role = { admin: 'admin' } as const;\n`,
  'gen/index.ts': `export * from './models';\n`,
});

// A tree that carries none of the patterns, as a generator change could leave it
const EMPTY = treeOf({
  'consumer.ts': 'export const x = 1;\n',
  'gen/user.ts': 'export interface User {\n  id: string;\n}\n',
  'gen/index.ts': `export const y = 1;\n`,
});

function file(tree: Tree, path: string): string {
  const text = tree.get(path);
  if (text === undefined) throw new Error(`no ${path} in the tree`);

  return text;
}

describe('case names', () => {
  test('every named case has a transform and at least one variant', () => {
    for (const name of CASE_NAMES) {
      expect(typeof CASES[name].transform).toBe('function');
      expect(CASES[name].variants.length).toBeGreaterThan(0);
    }
  });

  test('only dts and ts have a second, skipLibCheck=false variant', () => {
    expect(CASES.dts.variants.map((variant) => variant.skipLibCheck)).toEqual([true, false]);
    expect(CASES.ts.variants.map((variant) => variant.skipLibCheck)).toEqual([true, false]);
    for (const name of CASE_NAMES.filter((name) => name !== 'dts' && name !== 'ts')) {
      expect(CASES[name].variants.map((variant) => variant.skipLibCheck)).toEqual([true]);
    }
  });

  test('isCaseName accepts every name and refuses others', () => {
    for (const name of CASE_NAMES) expect(isCaseName(name)).toBe(true);
    expect(isCaseName('no-where')).toBe(false);
  });

  test('--case parses a known name and refuses an unknown one', () => {
    expect(parseBenchArgs(['--case', 'dts']).case).toBe('dts');
    expect(parseBenchArgs([]).case).toBeNull();
    expect(() => parseBenchArgs(['--case', 'nope'])).toThrow('--case takes');
  });
});

const DTS_TREE: Tree = new Map(
  [...FULL].map(([path, text]) => [/^gen\/(models)\//.test(path) ? path.replace(/\.ts$/, '.d.ts') : path, text]),
);

describe('transforms on a tree with the pattern', () => {
  test('no-queries drops every query and keeps the import and client', () => {
    const next = CASES['no-queries'].transform(FULL);
    const consumer = file(next, 'consumer.ts');

    expect(consumer).not.toContain('findMany');
    expect(consumer).toContain(`import type { CerialClient } from './gen';`);
    expect(consumer).toContain('declare const client: CerialClient;');
    expect(file(next, 'gen/models/user.ts')).toBe(MODEL);
  });

  test('no-select collapses every select type and drops the select query', () => {
    const next = CASES['no-select'].transform(FULL);

    expect(file(next, 'gen/models/user.ts')).toContain('export type UserSelect = Record<string, unknown>;');
    expect(file(next, 'gen/models/user.ts')).toContain('export type GetUserIncludePayload');
    expect(file(next, 'gen/models/user.ts')).not.toContain('AtLeastOne<UserSelectFields>');
    expect(file(next, 'consumer.ts')).toContain('export const nestedSelect = client.db.User.findMany({});');
    expect(file(next, 'consumer.ts')).toContain('findMany({ include: { posts: true } })');
  });

  test('flat-select replaces AtLeastOne of the fields with the flat fields interface', () => {
    const model = file(CASES['flat-select'].transform(FULL), 'gen/models/user.ts');

    expect(model).toContain('export type UserSelect = UserSelectFields;');
    expect(model).toContain('export interface UserSelectFields {');
    expect(model).not.toContain('AtLeastOne<');
  });

  test('flat-select still keeps the first variant of a select written as a union, with every key optional', () => {
    const tree = treeOf({ 'gen/models/user.ts': UNION_SELECT });
    const model = file(CASES['flat-select'].transform(tree), 'gen/models/user.ts');

    expect(model).toContain(
      'export type UserSelect = { id?: boolean } & { name?: boolean; profile?: boolean | ProfileSelect };',
    );
    expect(model).not.toContain('| ({');
  });

  test('flat-select leaves an already flat select as it is', () => {
    const tree = treeOf({ ...Object.fromEntries(FULL), 'gen/tuples/pair.ts': SELECT_ONLY });
    const next = CASES['flat-select'].transform(tree);

    expect(file(next, 'gen/tuples/pair.ts')).toBe(SELECT_ONLY);
  });

  test('flat-select throws on a tree whose selects are all already flat', () => {
    const tree = treeOf({ 'gen/tuples/pair.ts': SELECT_ONLY });

    expect(() => CASES['flat-select'].transform(tree)).toThrow('matched nothing');
  });

  test('no-include collapses the include payload and keeps the select', () => {
    const model = file(CASES['no-include'].transform(FULL), 'gen/models/user.ts');

    expect(model).toContain('export type GetUserIncludePayload<I extends UserInclude | undefined> = {};');
    expect(model).not.toContain('Pick<');
    expect(model).toContain('AtLeastOne<UserSelectFields>');
  });

  test('no-compute unwraps A.Compute and keeps the payload body', () => {
    const model = file(CASES['no-compute'].transform(FULL), 'gen/models/user.ts');

    expect(model).not.toContain('A.Compute<');
    expect(model).not.toContain(`'flat'`);
    expect(model).toContain('S extends UserSelect\n    ? { [K in keyof S]: K }\n    : User;');
  });

  test('dts measures the tree as generated, and ts asks the generator for typeFiles ts', () => {
    expect(CASES.dts.transform(DTS_TREE)).toBe(DTS_TREE);
    expect(CASES.ts.transform(FULL)).toBe(FULL);
    expect(CASES.ts.typeFiles).toBe('ts');
    expect(CASES.dts.typeFiles).toBeUndefined();
  });

  test.each(['no-queries', 'no-select', 'flat-select', 'no-include', 'no-compute'] as const)(
    '%s matches the .d.ts layout as it does .ts',
    (name) => {
      const asTs = CASES[name].transform(FULL);
      const asDts = CASES[name].transform(DTS_TREE);

      expect(file(asDts, 'gen/models/user.d.ts')).toBe(file(asTs, 'gen/models/user.ts'));
      expect(file(asDts, 'consumer.ts')).toBe(file(asTs, 'consumer.ts'));
    },
  );

  test('a transform never changes its input', () => {
    const before = new Map(FULL);
    for (const name of CASE_NAMES.filter((name) => name !== 'dts')) CASES[name].transform(FULL);
    CASES.dts.transform(DTS_TREE);

    expect(FULL).toEqual(before);
  });
});

describe('transforms on a tree without the pattern', () => {
  test.each(CASE_NAMES)('%s throws', (name: CaseName) => {
    expect(() => CASES[name].transform(EMPTY)).toThrow(/case (no-|flat-|dts|ts)/);
  });

  test('no-queries and no-select throw when the tree has no consumer', () => {
    const noConsumer = treeOf({ 'gen/models/user.ts': MODEL });

    expect(() => CASES['no-queries'].transform(noConsumer)).toThrow('no consumer.ts');
    expect(() => CASES['no-select'].transform(noConsumer)).toThrow('no consumer.ts');
  });

  test('no-select throws when the consumer has no select query', () => {
    const tree = treeOf({ ...Object.fromEntries(FULL), 'consumer.ts': 'export const x = 1;\n' });

    expect(() => CASES['no-select'].transform(tree)).toThrow('no select query');
  });

  test('flat-select throws on a union it cannot read', () => {
    const tree = treeOf({
      'gen/models/user.ts': 'export type UserSelect =\n  | { id: boolean }\n  | { name: boolean };\n',
    });

    expect(() => CASES['flat-select'].transform(tree)).toThrow('expected shape');
  });

  test('dts throws when only enums and the root exist, and when the type-only files are plain .ts', () => {
    const tree = treeOf({ 'consumer.ts': '', 'gen/enums/role.ts': 'export {};\n', 'gen/index.ts': 'export {};\n' });

    expect(() => CASES.dts.transform(tree)).toThrow('not the default layout');
    expect(() => CASES.dts.transform(FULL)).toThrow('not the default layout');
  });

  test('ts throws on the default layout, so a run that ignored typeFiles cannot pass as the ts row', () => {
    expect(() => CASES.ts.transform(DTS_TREE)).toThrow('not the typeFiles');
  });
});

describe('tree on disk', () => {
  test('writeTree replaces gen so a renamed file does not linger', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'gen', 'models'), { recursive: true });
    writeFileSync(join(dir, 'consumer.ts'), CONSUMER);
    writeFileSync(join(dir, 'gen', 'models', 'user.ts'), MODEL);
    writeFileSync(join(dir, 'gen', 'index.ts'), 'export {};\n');

    const renamed: Tree = new Map(
      [...readTree(dir)].map(([path, text]) => [path.replace(/user\.ts$/, 'user.d.ts'), text]),
    );
    writeTree(dir, renamed);

    expect([...readTree(dir).keys()].sort()).toEqual(['consumer.ts', 'gen/index.ts', 'gen/models/user.d.ts']);
  });
});

describe('skipLibCheck=false only fails on errors under the generated tree', () => {
  async function check(skipLibCheck: boolean): Promise<void> {
    const dir = tempDir();
    mkdirSync(join(dir, 'gen'), { recursive: true });
    writeFileSync(join(dir, 'consumer.ts'), 'export {};\n');
    writeFileSync(join(dir, 'gen', 'bad.d.ts'), 'export type Broken = Missing;\n');
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { noEmit: true, skipLibCheck, types: [] },
        include: ['consumer.ts', 'gen/**/*.ts'],
      }),
    );
    await runTsc('7', dir, { countedRoots: [join(dir, 'gen'), join(dir, 'consumer.ts')] });
  }

  test('an error in a generated declaration file fails the strict run', async () => {
    await expect(check(false)).rejects.toThrow('bad.d.ts');
  });

  test('the same error passes with skipLibCheck on, which is why the strict row exists', async () => {
    await check(true);
  });
});

withDist('every case compiles clean', () => {
  const ALL: readonly [CaseName, readonly string[]][] = [
    ['no-queries', ['3 no-queries']],
    ['no-select', ['3 no-select']],
    ['flat-select', ['3 flat-select']],
    ['no-include', ['3 no-include']],
    ['no-compute', ['3 no-compute']],
    ['dts', ['3 dts', '3 dts skipLibCheck=false']],
    ['ts', ['3 ts', '3 ts skipLibCheck=false']],
  ];

  test.each(ALL)(
    '%s under 5.9 and 7',
    async (name, rowNames) => {
      const { rows } = await runBench(
        {
          sizes: [3],
          runs: 1,
          compilers: ['5.9', '7'],
          fields: 3,
          json: null,
          ceiling: null,
          heapMb: 4096,
          case: name,
        },
        { allowStale: true },
      );
      const small = rows.filter((row) => row.size === 3);

      expect([...new Set(small.map((row) => row.name))]).toEqual([...rowNames]);
      expect(small.every((row) => row.state === 'ok' && row.types !== null)).toBe(true);
      expect(small.length).toBe(rowNames.length * 2);
    },
    120_000,
  );
});
