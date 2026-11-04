/**
 * Applying a plan under the migration lease against the shared instance, each case in a scratch database of its own.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../src/errors';
import {
  acquireLease,
  applyPlan,
  bootstrapStateTables,
  fingerprint,
  MIGRATION_LEASE_TABLE,
  MIGRATIONS_TABLE,
  readLiveSchema,
  readState,
  type ApplyModel,
  type MigrationPlan,
  type TableModel,
} from '../../src/migrations';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];
const FAST = { leaseMs: 5000, waitMs: 30_000, pollMs: 20 };
const SCHEMA = 'app';

async function connect(database?: string): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, {
    namespace: 'main',
    ...(database ? { database } : {}),
    authentication: { username: 'root', password: 'root' },
  });
  opened.push(db);

  return db;
}

async function scratch(label: string): Promise<Surreal> {
  const name = `ap_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await connect();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  names.push(name);
  await bootstrapStateTables(db);

  return db;
}

// The test plans are written by hand, so the table is named by a fixed lookup rather than parsed from the text.
const tableOfTest = (statement: string): string => (/\b(user|post|person|big)\b/.exec(statement) ?? [])[1] ?? '';

const plan = (...statements: string[]): MigrationPlan =>
  statements.map((statement) => ({
    statement,
    class: 'additive',
    reason: 'test',
    construct: 'table',
    table: tableOfTest(statement),
  }));

/** The table as the live reader reports it after `statements` ran in a throwaway database. */
async function tableAfter(label: string, table: string, statements: string[]): Promise<TableModel> {
  const ref = await scratch(`ref_${label}`);
  await ref.query(statements.join(';\n')).collect();
  const found = (await readLiveSchema(ref)).tables.find((t) => t.name === table);

  return found!;
}

async function model(label: string, modelName: string, table: string, statements: string[]): Promise<ApplyModel> {
  const desired = await tableAfter(`${label}_${modelName}`, table, statements);

  return { modelName, table, fingerprint: fingerprint(desired), desired };
}

const options = (models: ApplyModel[]) => ({
  schemaName: SCHEMA,
  cerialVersion: '0.3.0-test',
  models,
  leaseOptions: FAST,
});

async function leaseRows(db: Surreal): Promise<unknown[]> {
  const [rows] = await db.query(`SELECT holder FROM ${MIGRATION_LEASE_TABLE}`).collect<[unknown[]]>();

  return rows;
}

async function tableNames(db: Surreal): Promise<string[]> {
  const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, unknown> }]>();

  return Object.keys(info.tables);
}

async function rowStatus(db: Surreal, modelName: string): Promise<string | undefined> {
  const [rows] = await db
    .query(`SELECT status FROM ${MIGRATIONS_TABLE} WHERE id[0] = $s AND id[1] = $m`, { s: SCHEMA, m: modelName })
    .collect<[{ status: string }[]]>();

  return rows[0]?.status;
}

afterAll(async () => {
  const root = await connect();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
});

const USER = ['DEFINE TABLE OVERWRITE user SCHEMAFULL', 'DEFINE FIELD OVERWRITE name ON TABLE user TYPE string'];

describe('applyPlan', () => {
  test('statements land and the model row reads applied; the lease is released', async () => {
    const db = await scratch('ok');
    const user = await model('ok', 'User', 'user', USER);

    const result = await applyPlan(db, plan(...USER), {
      ...options([user]),
      schema: { schemaName: SCHEMA, fingerprint: 'schema-fp', managedTables: ['user'] },
    });

    expect(result.applied).toEqual(['User']);
    expect(await tableNames(db)).toContain('user');
    const state = await readState(db, SCHEMA);
    expect(state.models.get('User')?.fingerprint).toBe(user.fingerprint);
    expect(state.schema?.managedTables).toEqual(['user']);
    expect(state.schema?.statements).toEqual(USER);
    expect(await leaseRows(db)).toEqual([]);
  });

  test('accepts a lease the caller holds and leaves it held', async () => {
    const db = await scratch('held');
    const user = await model('held', 'User', 'user', USER);
    const lease = await acquireLease(db, FAST);

    await applyPlan(db, plan(...USER), { ...options([user]), lease });

    expect((await readState(db, SCHEMA)).models.has('User')).toBe(true);
    expect(await leaseRows(db)).toHaveLength(1);
    await lease.release();
    expect(await leaseRows(db)).toEqual([]);
  });

  test('a failing UNIQUE index rolls the whole script back and reports its DDL', async () => {
    const db = await scratch('uniq');
    await db
      .query(`DEFINE TABLE person SCHEMAFULL; DEFINE FIELD email ON TABLE person TYPE string;
      CREATE person:a SET email = 'x'; CREATE person:b SET email = 'x';`)
      .collect();
    const ddl = [
      'DEFINE FIELD OVERWRITE age ON TABLE person TYPE int DEFAULT 0',
      'DEFINE INDEX uq_email ON TABLE person FIELDS email UNIQUE',
    ];
    const person = await model('uniq', 'Person', 'person', [
      'DEFINE TABLE OVERWRITE person SCHEMAFULL',
      'DEFINE FIELD email ON TABLE person TYPE string',
      ...ddl,
    ]);

    const error = await applyPlan(db, plan(...ddl), options([person])).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as CerialMigrationError).statement?.text).toBe(ddl[1]!);
    expect((error as CerialMigrationError).message).not.toMatch(/failed transaction$/);
    const live = (await readLiveSchema(db)).tables.find((t) => t.name === 'person')!;
    expect(live.fields.map((f) => f.path)).toEqual([['email']]);
    expect(live.indexes).toEqual([]);
    const [rows] = await db.query('SELECT * FROM person').collect<[unknown[]]>();
    expect(rows).toHaveLength(2);
    expect((await readState(db, SCHEMA)).models.has('Person')).toBe(false);
    expect(await rowStatus(db, 'Person')).toBe('pending');
    expect(await leaseRows(db)).toEqual([]);
  });

  describe('a failing statement mid-script', () => {
    const PERSON = [
      'DEFINE TABLE OVERWRITE person SCHEMAFULL',
      'DEFINE FIELD OVERWRITE email ON TABLE person TYPE string',
    ];
    const NOTE = 'DEFINE FIELD OVERWRITE note ON TABLE person TYPE option<string>';
    const UNIQUE = 'DEFINE INDEX uq_email ON TABLE person FIELDS email UNIQUE';

    async function seeded(label: string, second: string): Promise<{ db: Surreal; person: ApplyModel }> {
      const db = await scratch(label);
      await db
        .query(`${PERSON.join(';')}; CREATE person:a SET email = 'x'; CREATE person:b SET email = '${second}';`)
        .collect();
      const person = await model(label, 'Person', 'person', [...PERSON, NOTE, UNIQUE]);

      return { db, person };
    }

    test('negative: a statement after a harmless one fails and the harmless one is rolled back', async () => {
      const { db, person } = await seeded('mid_fail', 'x');

      const error = await applyPlan(db, plan(NOTE, UNIQUE), options([person])).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CerialMigrationError);
      expect((error as CerialMigrationError).statement?.text).toBe(UNIQUE);
      const live = (await readLiveSchema(db)).tables.find((t) => t.name === 'person')!;
      expect(live.fields.map((f) => f.path)).toEqual([['email']]);
      expect(live.indexes).toEqual([]);
      expect((await readState(db, SCHEMA)).models.has('Person')).toBe(false);
    });

    test('positive: the same plan over rows that do not clash commits both statements and the state', async () => {
      const { db, person } = await seeded('mid_ok', 'y');

      const result = await applyPlan(db, plan(NOTE, UNIQUE), options([person]));

      expect(result.executed).toEqual([NOTE, UNIQUE]);
      const live = (await readLiveSchema(db)).tables.find((t) => t.name === 'person')!;
      expect(live.fields.map((f) => f.path)).toEqual([['email'], ['note']]);
      expect(live.indexes.map((i) => i.name)).toEqual(['uq_email']);
      expect((await readState(db, SCHEMA)).models.get('Person')?.fingerprint).toBe(person.fingerprint);
    });

    test('a RETURN among the statements does not end the transaction: later ones run and commit', async () => {
      const { db, person } = await seeded('mid_return', 'y');

      const result = await applyPlan(db, plan(NOTE, 'RETURN 1', UNIQUE), options([person]));

      expect(result.applied).toEqual(['Person']);
      const live = (await readLiveSchema(db)).tables.find((t) => t.name === 'person')!;
      expect(live.indexes.map((i) => i.name)).toEqual(['uq_email']);
      expect(await rowStatus(db, 'Person')).toBe('applied');
    });

    test('a failure after a RETURN still rolls back the statements before it', async () => {
      const { db, person } = await seeded('mid_return_fail', 'x');

      const error = await applyPlan(db, plan(NOTE, 'RETURN 1', UNIQUE), options([person])).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CerialMigrationError);
      expect((error as CerialMigrationError).statement?.text).toBe(UNIQUE);
      const live = (await readLiveSchema(db)).tables.find((t) => t.name === 'person')!;
      expect(live.fields.map((f) => f.path)).toEqual([['email']]);
    });
  });

  test('a re-read that disagrees throws naming the table and the row stays pending', async () => {
    const db = await scratch('mismatch');
    const user = await model('mismatch', 'User', 'user', [
      ...USER,
      'DEFINE FIELD OVERWRITE age ON TABLE user TYPE int',
    ]);

    const error = await applyPlan(db, plan(...USER), options([user])).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as CerialMigrationError).message).toContain('"user"');
    expect((await readState(db, SCHEMA)).models.has('User')).toBe(false);
    expect(await rowStatus(db, 'User')).toBe('pending');
    expect(await tableNames(db)).toContain('user');
    expect(await leaseRows(db)).toEqual([]);
  });

  test('UPDATE ... UNSET over 10000 rows runs in the same transaction', async () => {
    const db = await scratch('unset');
    await db
      .query(
        'DEFINE TABLE big SCHEMAFULL; DEFINE FIELD n ON TABLE big TYPE int; DEFINE FIELD old ON TABLE big TYPE option<string>',
      )
      .collect();
    await db.query("FOR $i IN 0..10000 { CREATE big SET n = $i, old = 'x' }").collect();
    const statements = ['REMOVE FIELD old ON `big`', 'UPDATE `big` UNSET `old`'];
    const big = await model('unset', 'Big', 'big', [
      'DEFINE TABLE OVERWRITE big SCHEMAFULL',
      'DEFINE FIELD n ON TABLE big TYPE int',
    ]);

    await applyPlan(db, plan(...statements), options([big]));

    const [left] = await db.query('SELECT * FROM big WHERE old != NONE').collect<[unknown[]]>();
    expect(left).toHaveLength(0);
    const [[total]] = await db.query('SELECT count() AS c FROM big GROUP ALL').collect<[{ c: number }[]]>();
    expect(total!.c).toBe(10000);
    expect(await rowStatus(db, 'Big')).toBe('applied');
  });

  test('a partial plan marks only the models whose statements all ran', async () => {
    const db = await scratch('partial');
    const user = await model('partial', 'User', 'user', USER);
    const post = await model('partial', 'Post', 'post', ['DEFINE TABLE OVERWRITE post SCHEMAFULL']);

    const result = await applyPlan(db, plan(...USER, '-- DEFINE TABLE OVERWRITE post SCHEMAFULL'), {
      ...options([user, post]),
      schema: { schemaName: SCHEMA, fingerprint: 'schema-fp', managedTables: ['user', 'post'] },
    });

    expect(result.applied).toEqual(['User']);
    expect(result.skipped).toEqual(['Post']);
    const state = await readState(db, SCHEMA);
    expect([...state.models.keys()]).toEqual(['User']);
    expect(state.schema).toBeUndefined();
    expect(await tableNames(db)).not.toContain('post');
  });

  test('a holder whose lease was reclaimed cannot commit', async () => {
    const db = await scratch('lost');
    const user = await model('lost', 'User', 'user', USER);
    const stale = await acquireLease(db, { ...FAST, leaseMs: 300 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const successor = await acquireLease(db, FAST);

    const error = await applyPlan(db, plan(...USER), { ...options([user]), lease: stale }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as CerialMigrationError).message).toContain('lease was lost');
    expect(await tableNames(db)).not.toContain('user');
    expect((await readState(db, SCHEMA)).models.has('User')).toBe(false);
    expect(await leaseRows(db)).toHaveLength(1);
    await successor.release();
  });
});
