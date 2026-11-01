import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { parseFieldIdiom, quoteFieldPath, quoteIdent } from '../../src/migrations';
import { run, withScratchDatabase, type ScratchDatabase } from './surrealdb-facts/helpers';

const BS = String.fromCharCode(92);
const BT = '`';
const TERMINATORS: readonly (readonly [string, number])[] = [
  ['LF', 0x0a],
  ['CR', 0x0d],
  ['NEL', 0x85],
  ['LS', 0x2028],
  ['PS', 0x2029],
  ['VT', 0x0b],
  ['FF', 0x0c],
  ['tab', 0x09],
  ['NUL-adjacent SOH', 0x01],
];

const PAYLOAD = 'REMOVE TABLE victim;';
const NAMES: readonly (readonly [string, string])[] = [
  ['semicolon', 'h; REMOVE TABLE victim; --'],
  ['space', 'h REMOVE TABLE victim'],
  ...TERMINATORS.map(([label, unit]) => [label, `h${String.fromCharCode(unit)}${PAYLOAD}`] as const),
  ['backtick', `h${BT}; REMOVE TABLE victim; --`],
  ['trailing backslash', `h; REMOVE TABLE victim; --${BS}`],
  ['backslash then backtick', `h${BS}${BT}; REMOVE TABLE victim; --`],
  ['dot', 'h.REMOVE'],
  ['unicode', 'héllo😀; REMOVE TABLE victim; --'],
];

let db: ScratchDatabase;

async function ok(surql: string): Promise<void> {
  const results = await run(db, surql);
  expect(results.map((r) => r.status)).toEqual(results.map(() => 'OK'));
}

async function victimRows(): Promise<number> {
  const [rows] = await run(db, 'SELECT * FROM victim;');

  return rows!.status === 'OK' ? (rows!.result as unknown[]).length : 0;
}

async function info(part: 'tables' | 'fields' | 'indexes', table?: string): Promise<string[]> {
  const [result] = await run(db, table ? `INFO FOR TABLE ${quoteIdent(table)};` : 'INFO FOR DB;');

  return Object.keys((result!.result as Record<string, Record<string, string>>)[part]!);
}

beforeAll(async () => {
  db = await withScratchDatabase('quotelive');
});

afterAll(async () => {
  await db.remove();
});

beforeEach(async () => {
  const [tables] = await run(db, 'INFO FOR DB;');
  for (const name of Object.keys((tables!.result as { tables: Record<string, string> }).tables)) {
    await ok(`REMOVE TABLE ${quoteIdent(name)};`);
  }
  await ok('DEFINE TABLE victim; CREATE victim:1 SET v = 1;');
});

describe.each(NAMES)('hostile name: %s', (_label, name) => {
  test('a table name read back from INFO is removed alone, victim keeps its row', async () => {
    await ok(`DEFINE TABLE ${quoteIdent(name)};`);
    const found = (await info('tables')).find((n) => n === name);
    expect(found).toBe(name);

    await ok(`REMOVE TABLE ${quoteIdent(found!)};`);

    expect(await victimRows()).toBe(1);
    expect(await info('tables')).toEqual(['victim']);
  });

  test('a field and an index of that name are removed alone, siblings kept', async () => {
    await ok(
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD sibling ON t TYPE string; DEFINE INDEX sibling_idx ON t FIELDS sibling;
       DEFINE FIELD ${quoteIdent(name)} ON t TYPE string; DEFINE INDEX ${quoteIdent(name)} ON t FIELDS ${quoteIdent(name)};`,
    );

    await ok(`REMOVE INDEX ${quoteIdent(name)} ON t; REMOVE FIELD ${quoteIdent(name)} ON t;`);

    expect(await info('fields', 't')).toEqual(['sibling']);
    expect(await info('indexes', 't')).toEqual(['sibling_idx']);
    expect(await victimRows()).toBe(1);
  });

  test('a nested path built from parsed segments removes only the sub-field', async () => {
    await ok(
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD ${quoteIdent(name)} ON t TYPE object;
       DEFINE FIELD ${quoteFieldPath([name, 'x'])} ON t TYPE string; DEFINE FIELD ${quoteFieldPath([name, 'y'])} ON t TYPE string;`,
    );
    const rendered = (await info('fields', 't')).find(
      (k) => parseFieldIdiom(k).length === 2 && parseFieldIdiom(k)[1] === 'x',
    );
    expect(parseFieldIdiom(rendered!)).toEqual([name, 'x']);

    await ok(`REMOVE FIELD ${quoteFieldPath(parseFieldIdiom(rendered!))} ON t;`);

    expect((await info('fields', 't')).map((k) => parseFieldIdiom(k).length)).toEqual([1, 2]);
    expect(await victimRows()).toBe(1);
  });
});

describe('element paths', () => {
  test('arr.* removes only the element definition', async () => {
    await ok('DEFINE TABLE t SCHEMAFULL; DEFINE FIELD arr ON t TYPE array<string>;');
    expect((await info('fields', 't')).map((k) => parseFieldIdiom(k))).toContainEqual(['arr', { element: true }]);

    await ok(`REMOVE FIELD ${quoteFieldPath(['arr', { element: true }])} ON t;`);

    expect(await info('fields', 't')).toEqual(['arr']);
  });
});
