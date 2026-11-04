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

async function status(db: ScratchDatabase, surql: string): Promise<{ status: string; text: string }> {
  const [r] = await run(db, surql);

  return { status: r!.status, text: String(r!.result) };
}

async function rowsOf(db: ScratchDatabase, table = 't'): Promise<unknown[]> {
  const [r] = await run(db, `SELECT * FROM ${table} ORDER BY id;`);

  return r!.result as unknown[];
}

const SEED_STRINGS = `DEFINE TABLE t SCHEMAFULL;
  DEFINE FIELD a ON t TYPE string;
  CREATE t:1 SET a = '12';
  CREATE t:2 SET a = 'abc';
  CREATE t:3 SET a = '7';`;

describe('compatibility level of a fresh database', () => {
  test('is 4, read from INFO FOR DB and from the DEFINE DATABASE text in INFO FOR NS', async () => {
    const db = await fresh('compat_level');
    const [dbInfo] = await run(db, 'INFO FOR DB;');
    const [nsInfo] = await run(db, 'INFO FOR NS;');
    const databases = (nsInfo!.result as { databases: Record<string, string> }).databases;

    expect((dbInfo!.result as { compatibility: number }).compatibility).toBe(4);
    expect(databases[db.name]).toBe(`DEFINE DATABASE ${db.name} COMPATIBILITY 4`);
  });

  test('ALTER DATABASE ... COMPATIBILITY 3 opts the database out, and 4 opts it back in', async () => {
    const db = await fresh('compat_alter');

    expect((await run(db, `ALTER DATABASE ${db.name} COMPATIBILITY 3;`))[0]!.status).toBe('OK');
    const [lowered] = await run(db, 'INFO FOR DB;');
    expect((lowered!.result as { compatibility: number }).compatibility).toBe(3);

    expect((await run(db, `ALTER DATABASE ${db.name} COMPATIBILITY 4;`))[0]!.status).toBe('OK');
    const [raised] = await run(db, 'INFO FOR DB;');
    expect((raised!.result as { compatibility: number }).compatibility).toBe(4);
  });
});

describe('REMOVE FIELD over rows that hold the field, at compatibility level 4', () => {
  test('deletes the stored values: the row stops returning them and stays writable', async () => {
    const db = await fresh('rm_deletes');
    await run(
      db,
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string; DEFINE FIELD b ON t TYPE string;
       CREATE t:1 SET a = 'x', b = 'y';`,
    );

    expect((await status(db, 'REMOVE FIELD b ON t;')).status).toBe('OK');

    expect(await rowsOf(db)).toEqual([{ id: 't:1', a: 'x' }]);
    expect((await status(db, "UPDATE t:1 SET a = 'z';")).status).toBe('OK');
  });

  test('the value is gone for good: defining the field again as optional finds nothing', async () => {
    const db = await fresh('rm_gone');
    await run(db, `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD b ON t TYPE string; CREATE t:1 SET b = 'y';`);
    await run(db, 'REMOVE FIELD b ON t;');

    await run(db, 'DEFINE FIELD b ON t TYPE option<string>;');

    expect(await rowsOf(db)).toEqual([{ id: 't:1' }]);
  });

  test('a nested field is deleted the same way and leaves the parent object empty', async () => {
    const db = await fresh('rm_nested');
    await run(
      db,
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD o ON t TYPE option<object>; DEFINE FIELD o.k ON t TYPE string;
       CREATE t:1 SET o = { k: 'v' };`,
    );

    await run(db, 'REMOVE FIELD o.k ON t;');

    expect(await rowsOf(db)).toEqual([{ id: 't:1', o: {} }]);
  });

  test('opt out: at compatibility level 3 the stored value is still returned', async () => {
    const db = await fresh('rm_compat3');
    await run(db, `ALTER DATABASE ${db.name} COMPATIBILITY 3;`);
    await run(
      db,
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE string; DEFINE FIELD b ON t TYPE string;
       CREATE t:1 SET a = 'x', b = 'y';`,
    );

    await run(db, 'REMOVE FIELD b ON t;');

    expect(await rowsOf(db)).toEqual([{ id: 't:1', a: 'x', b: 'y' }]);
  });

  test('a SCHEMALESS table keeps the value, since the row was never limited to defined fields', async () => {
    const db = await fresh('rm_schemaless');
    await run(db, `DEFINE TABLE t SCHEMALESS; DEFINE FIELD a ON t TYPE string; CREATE t:1 SET a = 'x';`);

    await run(db, 'REMOVE FIELD a ON t;');

    expect(await rowsOf(db)).toEqual([{ id: 't:1', a: 'x' }]);
  });

  test('REMOVE FIELD takes no MIGRATE clause: there is no syntax to keep the values at level 4', async () => {
    const db = await fresh('rm_no_migrate');
    await run(db, SEED_STRINGS);

    await expect(run(db, 'REMOVE FIELD a ON t MIGRATE EXISTING ROWS;')).rejects.toThrow(/Parse error/);
  });
});

describe('a type change over rows, at compatibility level 4', () => {
  test('is refused when the new type does not accept every old value, and the rows are untouched', async () => {
    const db = await fresh('type_refused');
    await run(db, SEED_STRINGS);
    const before = await rowsOf(db);

    const { status: outcome, text } = await status(db, 'DEFINE FIELD OVERWRITE a ON t TYPE int;');

    expect(outcome).toBe('ERR');
    expect(text).toContain('compatibility level 4 and has rows');
    expect(text).toContain('does not accept every value the old one did: add MIGRATE EXISTING ROWS');
    expect(await rowsOf(db)).toEqual(before);
  });

  test('a tighter ASSERT on the same type is accepted: only the type is compared, stored values are not rechecked', async () => {
    const db = await fresh('type_assert');
    await run(db, SEED_STRINGS);

    const outcome = await status(db, "DEFINE FIELD OVERWRITE a ON t TYPE string ASSERT $value != 'abc';");

    expect(outcome.status).toBe('OK');
    expect(await rowsOf(db)).toContainEqual({ id: 't:2', a: 'abc' });
  });

  test('a widening change is accepted with no clause and leaves the values as stored', async () => {
    const db = await fresh('type_widen');
    await run(db, SEED_STRINGS);

    expect((await status(db, 'DEFINE FIELD OVERWRITE a ON t TYPE option<string>;')).status).toBe('OK');
    expect((await status(db, 'DEFINE FIELD OVERWRITE a ON t TYPE option<string | int>;')).status).toBe('OK');

    expect(await rowsOf(db)).toEqual([
      { id: 't:1', a: '12' },
      { id: 't:2', a: 'abc' },
      { id: 't:3', a: '7' },
    ]);
  });

  test('narrowing back by dropping NONE from the type is refused', async () => {
    const db = await fresh('type_narrow');
    await run(db, SEED_STRINGS);
    await run(db, 'DEFINE FIELD OVERWRITE a ON t TYPE option<string | int>;');

    const outcome = await status(db, 'DEFINE FIELD OVERWRITE a ON t TYPE string | int;');

    expect(outcome.status).toBe('ERR');
    expect(outcome.text).toContain('add MIGRATE EXISTING ROWS');
  });

  test('MIGRATE EXISTING ROWS AS <name> USING <expr> FALLBACK <expr> converts what conforms and falls back for the rest', async () => {
    const db = await fresh('type_migrate');
    await run(db, SEED_STRINGS);

    const outcome = await status(
      db,
      'DEFINE FIELD OVERWRITE a ON t TYPE int MIGRATE EXISTING ROWS AS v USING <int>$value FALLBACK -1;',
    );

    expect(outcome.status).toBe('OK');
    expect(await rowsOf(db)).toEqual([
      { id: 't:1', a: 12 },
      { id: 't:2', a: -1 },
      { id: 't:3', a: 7 },
    ]);
  });

  test('on option<int> the fallback may be NONE, which leaves the non-conforming row without the field', async () => {
    const db = await fresh('type_migrate_none');
    await run(db, SEED_STRINGS);

    await run(
      db,
      'DEFINE FIELD OVERWRITE a ON t TYPE option<int> MIGRATE EXISTING ROWS AS v USING <int>$value FALLBACK NONE;',
    );

    expect(await rowsOf(db)).toEqual([{ id: 't:1', a: 12 }, { id: 't:2' }, { id: 't:3', a: 7 }]);
  });

  test('the clause is refused when the transform can fail and no FALLBACK is given', async () => {
    const db = await fresh('type_no_fallback');
    await run(db, SEED_STRINGS);
    const before = await rowsOf(db);

    const { status: outcome, text } = await status(
      db,
      'DEFINE FIELD OVERWRITE a ON t TYPE int MIGRATE EXISTING ROWS AS v USING <int>$value;',
    );

    expect(outcome).toBe('ERR');
    expect(text).toContain('FALLBACK may be left out only when the transform cannot fail');
    expect(await rowsOf(db)).toEqual(before);
  });

  test('the transform may read only $value, and a FALLBACK must itself pass the new type', async () => {
    const db = await fresh('type_migrate_rules');
    await run(db, SEED_STRINGS);

    const reads = await status(
      db,
      'DEFINE FIELD OVERWRITE a ON t TYPE int MIGRATE EXISTING ROWS AS old USING <int>old;',
    );
    const badFallback = await status(
      db,
      'DEFINE FIELD OVERWRITE a ON t TYPE int MIGRATE EXISTING ROWS AS v USING <int>$value FALLBACK NONE;',
    );

    expect(reads.text).toContain('the transform reads only `$value`');
    expect(badFallback.text).toContain("the FALLBACK does not pass the field's definition");
  });

  test('opt out: at compatibility level 3 the change is accepted and the stored values are left as they were', async () => {
    const db = await fresh('type_compat3');
    await run(db, `ALTER DATABASE ${db.name} COMPATIBILITY 3;`);
    await run(db, SEED_STRINGS);

    expect((await status(db, 'DEFINE FIELD OVERWRITE a ON t TYPE int;')).status).toBe('OK');

    expect(await rowsOf(db)).toEqual([
      { id: 't:1', a: '12' },
      { id: 't:2', a: 'abc' },
      { id: 't:3', a: '7' },
    ]);
  });
});

describe('a new required field over rows, at compatibility level 4', () => {
  test('is refused for a type that does not accept NONE, even with a DEFAULT', async () => {
    const db = await fresh('new_required');
    await run(db, SEED_STRINGS);

    const plain = await status(db, 'DEFINE FIELD c ON t TYPE int;');
    const withDefault = await status(db, 'DEFINE FIELD c ON t TYPE int DEFAULT 0;');

    expect(plain.status).toBe('ERR');
    expect(plain.text).toContain("the field's TYPE does not accept NONE: add MIGRATE EXISTING ROWS");
    expect(withDefault.status).toBe('ERR');
    expect(await rowsOf(db)).toEqual([
      { id: 't:1', a: '12' },
      { id: 't:2', a: 'abc' },
      { id: 't:3', a: '7' },
    ]);
  });

  test('is accepted as option<T>, or with MIGRATE EXISTING ROWS filling the rows', async () => {
    const db = await fresh('new_accepted');
    await run(db, SEED_STRINGS);

    expect((await status(db, 'DEFINE FIELD d ON t TYPE option<int>;')).status).toBe('OK');
    expect((await status(db, 'DEFINE FIELD c ON t TYPE int MIGRATE EXISTING ROWS AS x USING 0;')).status).toBe('OK');

    expect(await rowsOf(db)).toEqual([
      { id: 't:1', a: '12', c: 0 },
      { id: 't:2', a: 'abc', c: 0 },
      { id: 't:3', a: '7', c: 0 },
    ]);
  });

  test('is accepted on a table with no rows', async () => {
    const db = await fresh('new_empty');
    await run(db, 'DEFINE TABLE t SCHEMAFULL;');

    expect((await status(db, 'DEFINE FIELD c ON t TYPE int;')).status).toBe('OK');
  });
});

describe('DEFINE INDEX after a write to the same table in one transaction', () => {
  test('is refused, and the whole transaction including the write is rolled back', async () => {
    const db = await fresh('idx_refused');
    await run(db, SEED_STRINGS);

    const results = await run(db, `BEGIN; CREATE t:9 SET a = 'z'; DEFINE INDEX ia ON t FIELDS a; COMMIT;`);
    const texts = results.map((r) => String(r.result));
    const [info] = await run(db, 'INFO FOR TABLE t;');

    expect(texts.some((t) => t.includes('this transaction has written records of `t`'))).toBe(true);
    expect(texts.some((t) => t.includes('Define the index CONCURRENTLY'))).toBe(true);
    expect((await rowsOf(db)).length).toBe(3);
    expect(Object.keys((info!.result as { indexes: object }).indexes)).toEqual([]);
  });

  test('a UPDATE to the table counts as a write too', async () => {
    const db = await fresh('idx_update');
    await run(db, SEED_STRINGS);

    const results = await run(db, `BEGIN; UPDATE t:1 SET a = 'k'; DEFINE INDEX ia ON t FIELDS a UNIQUE; COMMIT;`);

    expect(results.some((r) => String(r.result).includes('written records of `t`'))).toBe(true);
    expect(await rowsOf(db)).toContainEqual({ id: 't:1', a: '12' });
  });

  test('CONCURRENTLY is accepted after the write, and the write commits', async () => {
    const db = await fresh('idx_concurrently');
    await run(db, SEED_STRINGS);

    const results = await run(db, `BEGIN; CREATE t:9 SET a = 'z'; DEFINE INDEX ia ON t FIELDS a CONCURRENTLY; COMMIT;`);
    const [info] = await run(db, 'INFO FOR TABLE t;');

    expect(results.every((r) => r.status === 'OK')).toBe(true);
    expect(Object.keys((info!.result as { indexes: object }).indexes)).toEqual(['ia']);
    expect((await rowsOf(db)).length).toBe(4);
  });

  test('the index defined before the write, and an index on another table, are accepted', async () => {
    const db = await fresh('idx_ok');
    await run(db, `${SEED_STRINGS} DEFINE TABLE u SCHEMAFULL; DEFINE FIELD x ON u TYPE string;`);

    const before = await run(db, `BEGIN; DEFINE INDEX ia ON t FIELDS a; CREATE t:9 SET a = 'z'; COMMIT;`);
    const other = await run(db, `BEGIN; CREATE t:10 SET a = 'y'; DEFINE INDEX ix ON u FIELDS x; COMMIT;`);

    expect(before.every((r) => r.status === 'OK')).toBe(true);
    expect(other.every((r) => r.status === 'OK')).toBe(true);
  });

  test('a table defined and written in the same transaction cannot take a plain index either', async () => {
    const db = await fresh('idx_new_table');

    const results = await run(
      db,
      `BEGIN; DEFINE TABLE w SCHEMAFULL; DEFINE FIELD x ON w TYPE string; CREATE w:1 SET x = '1';
       DEFINE INDEX iw ON w FIELDS x; COMMIT;`,
    );

    expect(results.some((r) => String(r.result).includes('written records of `w`'))).toBe(true);
    expect(await tableExists(db, 'w')).toBe(false);
  });
});

describe('a DDL script that 4.0 refuses part-way', () => {
  test('rolls back the definitions before the refused one', async () => {
    const db = await fresh('ddl_refused_midway');
    await run(db, SEED_STRINGS);

    const results = await run(
      db,
      `BEGIN;
       DEFINE FIELD ok ON t TYPE option<int>;
       DEFINE TABLE u SCHEMAFULL;
       DEFINE FIELD bad ON t TYPE int;
       COMMIT;`,
    );

    expect(results.some((r) => String(r.result).includes('compatibility level 4 and has rows'))).toBe(true);
    expect(await fieldNames(db, 't')).toEqual(['a']);
    expect(await tableExists(db, 'u')).toBe(false);
  });

  test('without BEGIN the definitions before the refused one stay applied', async () => {
    const db = await fresh('ddl_refused_nobegin');
    await run(db, SEED_STRINGS);

    const results = await run(
      db,
      'DEFINE FIELD ok ON t TYPE option<int>; DEFINE TABLE u SCHEMAFULL; DEFINE FIELD bad ON t TYPE int;',
    );

    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'ERR']);
    expect((await fieldNames(db, 't')).sort()).toEqual(['a', 'ok']);
    expect(await tableExists(db, 'u')).toBe(true);
  });
});
