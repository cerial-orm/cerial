/**
 * Facts about transactional DDL and what a failed script leaves behind. Measured on the memory
 * backend only; another backend was not measured.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

const scratch: ScratchDatabase[] = [];

async function fresh(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  scratch.push(db);

  return db;
}

afterAll(async () => {
  await Promise.all(scratch.map((db) => db.remove()));
});

async function tableExists(db: ScratchDatabase, table: string): Promise<boolean> {
  const [info] = await run(db, 'INFO FOR DB;');

  return table in (info!.result as { tables: Record<string, string> }).tables;
}

async function fieldNames(db: ScratchDatabase, table: string): Promise<string[]> {
  const [info] = await run(db, `INFO FOR TABLE ${table};`);

  return Object.keys((info!.result as { fields: Record<string, string> }).fields);
}

describe('DDL inside BEGIN ... COMMIT', () => {
  test('applies every definition when the script completes', async () => {
    const db = await fresh('ddl_ok');
    const results = await run(
      db,
      `BEGIN;
       DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD a ON t TYPE string;
       DEFINE FIELD b ON t TYPE int;
       COMMIT;`,
    );

    expect(results.every((r) => r.status === 'OK')).toBe(true);
    expect(await tableExists(db, 't')).toBe(true);
    expect((await fieldNames(db, 't')).sort()).toEqual(['a', 'b']);
  });

  test('a THROW before COMMIT leaves no table and no field', async () => {
    const db = await fresh('ddl_throw');
    const results = await run(
      db,
      `BEGIN;
       DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD a ON t TYPE string;
       THROW 'abort';
       COMMIT;`,
    );

    expect(results.some((r) => r.status === 'ERR')).toBe(true);
    expect(await tableExists(db, 't')).toBe(false);
  });

  test('a THROW after REMOVE TABLE keeps the table and its rows', async () => {
    const db = await fresh('ddl_remove');
    await run(
      db,
      'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string; CREATE t:1 SET a = "x"; CREATE t:2 SET a = "y";',
    );

    const results = await run(db, `BEGIN; REMOVE TABLE t; THROW 'abort'; COMMIT;`);
    const [rows] = await run(db, 'SELECT * FROM t ORDER BY id;');

    expect(results.some((r) => r.status === 'ERR')).toBe(true);
    expect(await tableExists(db, 't')).toBe(true);
    expect(rows!.result as unknown[]).toHaveLength(2);
  });

  test('a unique index failure rolls back the definitions before it', async () => {
    const db = await fresh('ddl_unique');
    await run(
      db,
      'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string; CREATE t:1 SET a = "dup"; CREATE t:2 SET a = "dup";',
    );

    const results = await run(
      db,
      `BEGIN;
       DEFINE FIELD b ON t TYPE option<int>;
       DEFINE TABLE u SCHEMAFULL;
       DEFINE INDEX ia ON t FIELDS a UNIQUE;
       COMMIT;`,
    );

    expect(results.some((r) => r.status === 'ERR')).toBe(true);
    expect(await fieldNames(db, 't')).toEqual(['a']);
    expect(await tableExists(db, 'u')).toBe(false);
    const [info] = await run(db, 'INFO FOR TABLE t;');
    expect(Object.keys((info!.result as { indexes: Record<string, string> }).indexes)).toEqual([]);
  });
});

describe('the same script without BEGIN', () => {
  test('carries on past the failure and leaves the earlier statements applied', async () => {
    const db = await fresh('ddl_nobegin');
    const results = await run(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD a ON t TYPE string;
       THROW 'abort';
       DEFINE FIELD b ON t TYPE int;`,
    );

    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'ERR', 'OK']);
    expect(await tableExists(db, 't')).toBe(true);
    expect((await fieldNames(db, 't')).sort()).toEqual(['a', 'b']);
  });
});

describe('inside an SDK transaction over WebSocket', () => {
  async function connect(db: ScratchDatabase): Promise<Surreal> {
    const surreal = new Surreal();
    await surreal.connect('ws://127.0.0.1:8000/rpc');
    await surreal.signin({ username: 'root', password: 'root' });
    await surreal.use({ namespace: 'main', database: db.name });

    return surreal;
  }

  async function count(db: ScratchDatabase, table: string): Promise<number> {
    const [rows] = await run(db, `SELECT * FROM ${table};`);

    return (rows!.result as unknown[]).length;
  }

  test('a THROW before a CREATE throws, yet the CREATE lands and commit succeeds', async () => {
    const db = await fresh('sdk_throw');
    await run(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE int;');
    const surreal = await connect(db);

    try {
      const txn = await surreal.beginTransaction();
      // BEGIN and COMMIT are stripped here, as the executor does inside an SDK transaction.
      const script = `THROW 'abort'; CREATE t:1 SET v = 1;`;
      let thrown: unknown;
      try {
        await txn.query(script).collect();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeDefined();
      await txn.commit();
      expect(await count(db, 't')).toBe(1);
    } finally {
      await surreal.close();
    }
  });

  test('a THROW guarded write followed by commit() still commits the write', async () => {
    const db = await fresh('sdk_guard');
    await run(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE int;');
    const surreal = await connect(db);

    try {
      const txn = await surreal.beginTransaction();
      let thrown: unknown;
      try {
        await txn
          .query(`CREATE t:1 SET v = 1; IF (SELECT count() FROM t GROUP ALL)[0].count >= 1 { THROW 'guard' };`)
          .collect();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeDefined();
      await txn.commit();
      expect(await count(db, 't')).toBe(1);
    } finally {
      await surreal.close();
    }
  });
});
