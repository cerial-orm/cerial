/**
 * Facts about hostile identifiers: interpolating a name read back from `INFO` runs the
 * payload inside it, a line terminator turns a trailing comment into a statement, and a
 * backtick-quoted name with the escapes below removes exactly the object it names.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

import { BS, BT, FF, NAME_CASES, PAYLOAD, quote, quotePath, TERMINATORS, VT } from './hostile-names';

let db: ScratchDatabase;

async function ok(surql: string): Promise<void> {
  const results = await run(db, surql);
  expect(results.map((r) => r.status)).toEqual(results.map(() => 'OK'));
}

async function tableNames(): Promise<string[]> {
  const [info] = await run(db, 'INFO FOR DB;');

  return Object.keys((info!.result as { tables: Record<string, string> }).tables);
}

async function victimRows(): Promise<number> {
  const [rows] = await run(db, 'SELECT * FROM victim;');
  if (rows!.status !== 'OK') return 0;

  return (rows!.result as unknown[]).length;
}

async function tableKeys(part: 'fields' | 'indexes'): Promise<string[]> {
  const [info] = await run(db, 'INFO FOR TABLE t;');

  return Object.keys((info!.result as Record<string, Record<string, string>>)[part]!);
}

beforeAll(async () => {
  db = await withScratchDatabase('payloads');
});

afterAll(async () => {
  await db.remove();
});

beforeEach(async () => {
  await ok(
    `REMOVE TABLE IF EXISTS victim; REMOVE TABLE IF EXISTS t;
     DEFINE TABLE victim; CREATE victim:1 SET v = 1;
     DEFINE TABLE t SCHEMAFULL; DEFINE FIELD sibling ON t TYPE string; DEFINE INDEX sibling_idx ON t FIELDS sibling;`,
  );
});

describe('plain interpolation of a name read from INFO', () => {
  test('a statement inside the name removes victim although the first statement fails', async () => {
    const hostile = 'a; REMOVE TABLE victim; --';
    await ok(`DEFINE TABLE ${BT}${hostile}${BT};`);
    const key = (await tableNames()).find((n) => n === hostile);
    expect(key).toBe(hostile);
    expect(await victimRows()).toBe(1);

    const results = await run(db, `REMOVE TABLE ${key};`);

    expect(results.map((r) => r.status)).toEqual(['ERR', 'OK']);
    expect(await victimRows()).toBe(0);
    expect(await tableNames()).not.toContain('victim');
    expect(await tableNames()).toContain(hostile);
  });
});

describe('a comment built from a name holding a terminator', () => {
  for (const [label, raw] of TERMINATORS) {
    test(`${label} ends the comment and the next line runs`, async () => {
      expect(await victimRows()).toBe(1);

      await run(db, `-- REMOVE TABLE nl${raw}${PAYLOAD}`);

      expect(await victimRows()).toBe(0);
      expect(await tableNames()).not.toContain('victim');
    });
  }

  for (const [label, raw] of [
    ['VT', VT],
    ['FF', FF],
  ] as const) {
    test(`${label} does not end the comment`, async () => {
      const results = await run(db, `-- REMOVE TABLE nl${raw}${PAYLOAD}`);

      expect(results).toEqual([]);
      expect(await victimRows()).toBe(1);
    });
  }
});

describe('REMOVE TABLE with a quoted name', () => {
  for (const { label, name } of NAME_CASES) {
    test(`${label}: removes exactly the hostile table`, async () => {
      const q = quote(name);
      await ok(`DEFINE TABLE ${q};`);
      expect(await tableNames()).toContain(name);

      // Terminators are escaped, so a comment holding the quoted name has no line end to run past.
      expect(await run(db, `-- REMOVE TABLE ${q}`)).toEqual([]);
      expect(await tableNames()).toContain(name);
      expect(await victimRows()).toBe(1);

      const results = await run(db, `REMOVE TABLE ${q};`);

      expect(results.map((r) => r.status)).toEqual(['OK']);
      expect(await tableNames()).not.toContain(name);
      expect(await tableNames()).toContain('victim');
      expect(await victimRows()).toBe(1);
    });
  }
});

describe('REMOVE FIELD with a quoted name', () => {
  for (const { label, name } of NAME_CASES) {
    test(`${label}: removes exactly the hostile field`, async () => {
      const q = quote(name);
      await ok(`DEFINE FIELD ${q} ON t TYPE string;`);
      const before = await tableKeys('fields');
      expect(before.length).toBe(2);

      expect(await run(db, `-- REMOVE FIELD ${q} ON t`)).toEqual([]);
      expect(await tableKeys('fields')).toEqual(before);

      const results = await run(db, `REMOVE FIELD ${q} ON t;`);

      expect(results.map((r) => r.status)).toEqual(['OK']);
      expect(await tableKeys('fields')).toEqual(['sibling']);
      expect(await victimRows()).toBe(1);
    });
  }
});

describe('REMOVE INDEX with a quoted name', () => {
  for (const { label, name } of NAME_CASES) {
    test(`${label}: removes exactly the hostile index`, async () => {
      const q = quote(name);
      await ok(`DEFINE INDEX ${q} ON t FIELDS sibling;`);
      const before = await tableKeys('indexes');
      expect(before.length).toBe(2);

      expect(await run(db, `-- REMOVE INDEX ${q} ON t`)).toEqual([]);
      expect(await tableKeys('indexes')).toEqual(before);

      const results = await run(db, `REMOVE INDEX ${q} ON t;`);

      expect(results.map((r) => r.status)).toEqual(['OK']);
      expect(await tableKeys('indexes')).toEqual(['sibling_idx']);
      expect(await victimRows()).toBe(1);
    });
  }
});

describe('REMOVE FIELD on a nested path', () => {
  const torture = `h${BS}${BT};\n${PAYLOAD} --${BS}`;

  test('o.x removes only the sub-field', async () => {
    await ok('DEFINE FIELD o ON t TYPE object; DEFINE FIELD o.x ON t TYPE string;');
    const before = await tableKeys('fields');

    const results = await run(db, `REMOVE FIELD ${quotePath('o', 'x')} ON t;`);

    expect(results.map((r) => r.status)).toEqual(['OK']);
    const after = await tableKeys('fields');
    expect(before.filter((k) => !after.includes(k))).toEqual(['o.x']);
    expect(after).toContain('o');
    expect(await victimRows()).toBe(1);
  });

  test('arr.* removes only the element definition', async () => {
    await ok('DEFINE FIELD arr ON t TYPE array<string>;');
    const before = await tableKeys('fields');
    expect(before).toContain('arr.*');

    const results = await run(db, `REMOVE FIELD ${quotePath('arr', '*')} ON t;`);

    expect(results.map((r) => r.status)).toEqual(['OK']);
    const after = await tableKeys('fields');
    expect(before.filter((k) => !after.includes(k))).toEqual(['arr.*']);
    expect(after).toContain('arr');
    expect(await victimRows()).toBe(1);
  });

  test('a hostile segment under o removes only that sub-field', async () => {
    await ok(`DEFINE FIELD o ON t TYPE object; DEFINE FIELD ${quotePath('o', torture)} ON t TYPE string;`);
    const before = await tableKeys('fields');
    expect(before.length).toBe(3);

    expect(await run(db, `-- REMOVE FIELD ${quotePath('o', torture)} ON t`)).toEqual([]);
    expect(await tableKeys('fields')).toEqual(before);

    const results = await run(db, `REMOVE FIELD ${quotePath('o', torture)} ON t;`);

    expect(results.map((r) => r.status)).toEqual(['OK']);
    const after = await tableKeys('fields');
    expect(before.filter((k) => !after.includes(k)).length).toBe(1);
    expect(after).toContain('o');
    expect(after).toContain('sibling');
    expect(await victimRows()).toBe(1);
  });

  test('a hostile array name with .* removes only the element definition', async () => {
    await ok(`DEFINE FIELD ${quotePath(torture)} ON t TYPE array<string>;`);
    const before = await tableKeys('fields');
    expect(before.length).toBe(3);

    const results = await run(db, `REMOVE FIELD ${quotePath(torture, '*')} ON t;`);

    expect(results.map((r) => r.status)).toEqual(['OK']);
    const after = await tableKeys('fields');
    const removed = before.filter((k) => !after.includes(k));
    expect(removed.length).toBe(1);
    expect(removed[0]!.endsWith('.*')).toBe(true);
    expect(after).toContain('sibling');
    expect(after.length).toBe(2);
    expect(await victimRows()).toBe(1);
  });
});

describe('the angle form cannot quote every name', () => {
  const name = 'a⟩b';

  test('a closing angle bracket in a name is a parse error, with or without a backslash', async () => {
    await ok(`DEFINE TABLE ${quote(name)};`);

    await expect(run(db, 'REMOVE TABLE ⟨a⟩b⟩;')).rejects.toThrow('Parse error');
    await expect(run(db, `REMOVE TABLE ⟨a${BS}⟩b⟩;`)).rejects.toThrow('Invalid escape sequence');
    expect(await tableNames()).toContain(name);
  });

  test('the backtick form removes that table', async () => {
    await ok(`DEFINE TABLE OVERWRITE ${quote(name)};`);

    const results = await run(db, `REMOVE TABLE ${quote(name)};`);

    expect(results.map((r) => r.status)).toEqual(['OK']);
    expect(await tableNames()).not.toContain(name);
    expect(await victimRows()).toBe(1);
  });
});
