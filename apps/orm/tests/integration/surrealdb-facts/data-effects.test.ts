/**
 * Facts about what REMOVE, a type change and UNIQUE over duplicates do to rows already
 * stored. Every table is SCHEMAFULL and each row is read back after each step.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

const databases: ScratchDatabase[] = [];

async function scratch(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  databases.push(db);

  return db;
}

afterAll(async () => {
  await Promise.all(databases.map((db) => db.remove()));
});

/** Runs one statement and returns its result, asserting only that it was OK. */
async function ok(db: ScratchDatabase, surql: string): Promise<unknown> {
  const [r] = await run(db, surql);
  expect(r!.status).toBe('OK');

  return r!.result;
}

/** Runs one statement and returns the error text, asserting it failed. */
async function err(db: ScratchDatabase, surql: string): Promise<string> {
  const [r] = await run(db, surql);
  expect(r!.status).toBe('ERR');

  return String(r!.result);
}

const rows = (db: ScratchDatabase, table = 't') => ok(db, `SELECT * FROM ${table} ORDER BY id;`);

const SEED_AB = `DEFINE TABLE t SCHEMAFULL;
  DEFINE FIELD a ON t TYPE string;
  DEFINE FIELD b ON t TYPE string;
  CREATE t:1 SET a = 'x', b = 'y';`;

describe('REMOVE FIELD over stored data', () => {
  // Changed on 4.0 (compatibility level 4): 3.3.0 returned the value and refused every write.
  test('the stored value is deleted', async () => {
    const db = await scratch('rm_read');
    await run(db, SEED_AB);
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x', b: 'y' }]);

    await ok(db, 'REMOVE FIELD b ON t;');
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x' }]);
  });

  test('writes to the row succeed', async () => {
    const db = await scratch('rm_write');
    await run(db, SEED_AB);
    await ok(db, 'REMOVE FIELD b ON t;');

    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);

    await ok(db, "UPDATE t:1 MERGE { a: 'q' };");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'q' }]);
  });

  test('UNSET of the removed field is the one write that succeeds, and it clears the value', async () => {
    const db = await scratch('rm_unset');
    await run(db, SEED_AB);
    await ok(db, 'REMOVE FIELD b ON t;');

    await ok(db, 'UPDATE t:1 UNSET b;');
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x' }]);

    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);
  });

  test('REMOVE then UNSET in one transaction leaves the row writable', async () => {
    const db = await scratch('rm_txn');
    await run(db, SEED_AB);

    const results = await run(db, 'BEGIN; REMOVE FIELD b ON t; UPDATE t:1 UNSET b; COMMIT;');
    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'OK']);
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x' }]);

    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);
  });

  test('UNSET before REMOVE on a required field fails on coercion and leaves the value', async () => {
    const db = await scratch('rm_reverse');
    await run(db, SEED_AB);

    const results = await run(db, 'BEGIN; UPDATE t:1 UNSET b; REMOVE FIELD b ON t; COMMIT;');
    expect(results[1]!.status).toBe('ERR');
    expect(String(results[1]!.result)).toContain("Couldn't coerce value for field `b`");
    expect(results.at(-1)!.status).toBe('ERR');

    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x', b: 'y' }]);
    const info = (await ok(db, 'INFO FOR TABLE t;')) as { fields: Record<string, string> };
    expect(Object.keys(info.fields).sort()).toEqual(['a', 'b']);
  });
});

describe('REMOVE FIELD on a parent object', () => {
  const SEED_P = `DEFINE TABLE t SCHEMAFULL;
    DEFINE FIELD a ON t TYPE string;
    DEFINE FIELD p ON t TYPE object;
    DEFINE FIELD p.x ON t TYPE string;
    CREATE t:1 SET a = 'x', p = { x: 'y' };`;

  const fieldNames = async (db: ScratchDatabase) =>
    Object.keys(((await ok(db, 'INFO FOR TABLE t;')) as { fields: Record<string, string> }).fields).sort();

  // Changed on 4.0: removing the parent takes its children's definitions and the stored object with it.
  test('REMOVE FIELD parent removes parent.x and the stored object', async () => {
    const db = await scratch('parent_left');
    await run(db, SEED_P);
    await ok(db, 'REMOVE FIELD p ON t;');

    expect(await fieldNames(db)).toEqual(['a']);
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x' }]);
  });

  test('with the parent removed, writes to other fields succeed and p is no longer a field', async () => {
    const db = await scratch('parent_writes');
    await run(db, SEED_P);
    await ok(db, 'REMOVE FIELD p ON t;');

    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);

    expect(await err(db, "UPDATE t:1 SET p = { x: 'r' };")).toContain("Found field 'p', but no such field exists");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);
  });

  test('removing the child first and then the parent deletes the object and keeps writes working', async () => {
    const db = await scratch('parent_children_first');
    await run(db, SEED_P);

    await ok(db, 'REMOVE FIELD p.x ON t;');
    expect(await fieldNames(db)).toEqual(['a', 'p']);
    await ok(db, 'REMOVE FIELD p ON t;');
    expect(await fieldNames(db)).toEqual(['a']);
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x' }]);

    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);
  });
});

describe('removing a parent object and its children in one transaction', () => {
  const SEED_P = `DEFINE TABLE t SCHEMAFULL;
    DEFINE FIELD a ON t TYPE string;
    DEFINE FIELD p ON t TYPE object;
    DEFINE FIELD p.x ON t TYPE string;
    CREATE t:1 SET a = 'x', p = { x: 'y' };`;

  const fieldNames = async (db: ScratchDatabase) =>
    Object.keys(((await ok(db, 'INFO FOR TABLE t;')) as { fields: Record<string, string> }).fields).sort();

  test('child, parent, then UNSET: the row loses p, stays writable and SELECT * no longer shows p', async () => {
    const db = await scratch('parent_full_txn');
    await run(db, SEED_P);

    const results = await run(db, 'BEGIN; REMOVE FIELD p.x ON t; REMOVE FIELD p ON t; UPDATE t:1 UNSET p; COMMIT;');
    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'OK', 'OK']);
    expect(await fieldNames(db)).toEqual(['a']);
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x' }]);

    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);
  });

  test('the same removals without the UNSET delete p and leave the row writable', async () => {
    const db = await scratch('parent_txn_no_unset');
    await run(db, SEED_P);

    await run(db, 'BEGIN; REMOVE FIELD p.x ON t; REMOVE FIELD p ON t; COMMIT;');
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x' }]);
    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z' }]);
  });

  test('removing only p.x with UNSET p.x keeps p, as an empty object, and the row stays writable', async () => {
    const db = await scratch('nested_path_only');
    await run(db, SEED_P);

    const results = await run(db, 'BEGIN; REMOVE FIELD p.x ON t; UPDATE t:1 UNSET p.x; COMMIT;');
    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'OK']);
    expect(await fieldNames(db)).toEqual(['a', 'p']);
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'x', p: {} }]);

    await ok(db, "UPDATE t:1 SET a = 'z';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'z', p: {} }]);
  });
});

describe('DEFINE FIELD OVERWRITE with a new type over stored data', () => {
  // Changed on 4.0 (compatibility level 4): 3.3.0 accepted the change and left the old value in place.
  test('is refused unless the new type accepts every old value, and the row is untouched', async () => {
    const db = await scratch('type_change');
    await run(db, "DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string; CREATE t:1 SET a = 's';");

    expect(await err(db, 'DEFINE FIELD OVERWRITE a ON t TYPE int;')).toContain('MIGRATE EXISTING ROWS');
    expect(await rows(db)).toEqual([{ id: 't:1', a: 's' }]);
    await ok(db, "UPDATE t:1 SET a = 'u';");
  });

  test('with MIGRATE EXISTING ROWS converts what casts and gives the rest the fallback', async () => {
    const db = await scratch('type_change_migrate');
    await run(
      db,
      "DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string; CREATE t:1 SET a = '7'; CREATE t:2 SET a = 's';",
    );

    await ok(
      db,
      'DEFINE FIELD OVERWRITE a ON t TYPE int MIGRATE EXISTING ROWS AS to_int USING <int>$value FALLBACK 0;',
    );
    expect(await rows(db)).toEqual([
      { id: 't:1', a: 7 },
      { id: 't:2', a: 0 },
    ]);
    await ok(db, 'UPDATE t:1 SET a = 5;');
  });
});

describe('DEFINE INDEX UNIQUE over duplicates', () => {
  test('fails, leaves no index behind and leaves the rows unchanged', async () => {
    const db = await scratch('unique_dupes');
    await run(
      db,
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string;
       CREATE t:1 SET a = 'd'; CREATE t:2 SET a = 'd';`,
    );
    const before = [
      { id: 't:1', a: 'd' },
      { id: 't:2', a: 'd' },
    ];
    expect(await rows(db)).toEqual(before);

    expect(await err(db, 'DEFINE INDEX ia ON t FIELDS a UNIQUE;')).toContain('already contains');

    const info = (await ok(db, 'INFO FOR TABLE t;')) as { indexes: Record<string, string> };
    expect(info.indexes).toEqual({});
    expect(await rows(db)).toEqual(before);
  });
});

describe('REMOVE TABLE then DEFINE TABLE', () => {
  test('the redefined table is empty and carries no fields', async () => {
    const db = await scratch('table_recreate');
    await run(db, "DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string; CREATE t:1 SET a = 'd';");
    expect(await rows(db)).toEqual([{ id: 't:1', a: 'd' }]);

    await ok(db, 'REMOVE TABLE t;');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL;');
    expect(await rows(db)).toEqual([]);
    const info = (await ok(db, 'INFO FOR TABLE t;')) as { fields: Record<string, string> };
    expect(info.fields).toEqual({});
  });
});

describe('DEFINE INDEX OVERWRITE rebuild over 60000 rows', () => {
  test('rebuilds on every run; the timing is recorded, not asserted', async () => {
    const db = await scratch('rebuild');
    await run(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string;');
    await ok(db, 'FOR $i IN 0..60000 { CREATE t SET a = <string>$i; };');
    expect(await ok(db, 'SELECT count() FROM t GROUP ALL;')).toEqual([{ count: 60000 }]);

    const timings: number[] = [];
    for (let i = 0; i < 2; i++) {
      const started = performance.now();
      await ok(db, 'DEFINE INDEX OVERWRITE ia ON t FIELDS a;');
      timings.push(Math.round(performance.now() - started));
      expect(await ok(db, 'SELECT count() FROM t GROUP ALL;')).toEqual([{ count: 60000 }]);
    }
    console.log(`DEFINE INDEX OVERWRITE over 60000 rows, ms: ${timings.join(', ')}`);

    const info = (await ok(db, 'INFO FOR TABLE t;')) as { indexes: Record<string, string> };
    expect(Object.keys(info.indexes)).toEqual(['ia']);
  }, 60000);
});
