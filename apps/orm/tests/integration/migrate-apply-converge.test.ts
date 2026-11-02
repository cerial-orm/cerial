/**
 * What an apply judges after it commits, and how several schema entries share one transaction. Each case runs in a
 * scratch database of its own.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../src/errors';
import {
  applyPlan,
  applyUnmatched,
  bootstrapStateTables,
  buildMigrationPlan,
  diffSchema,
  fingerprint,
  indexDesiredStatements,
  readLiveSchema,
  readState,
  type ApplyModel,
  type MigrationPlan,
  type SchemaModel,
  type TableModel,
} from '../../src/migrations';
import { verifySchema } from '../../src/migrations/verify';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];
const FAST = { leaseMs: 5000, waitMs: 30_000, pollMs: 20 };

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
  const name = `cv_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await connect();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  names.push(name);
  await bootstrapStateTables(db);

  return db;
}

afterAll(async () => {
  const root = await connect();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
});

/** The schema as the live reader reports it after `statements` ran in a throwaway database. */
async function schemaAfter(label: string, statements: readonly string[]): Promise<SchemaModel> {
  const ref = await scratch(`ref_${label}`);
  await ref.query(statements.join(';\n')).collect();

  return readLiveSchema(ref);
}

async function tableAfter(label: string, table: string, statements: readonly string[]): Promise<TableModel> {
  return (await schemaAfter(label, statements)).tables.find((t) => t.name === table)!;
}

const step = (statement: string, table?: string): MigrationPlan[number] => ({
  statement,
  class: 'additive',
  reason: 'test',
  construct: 'table',
  ...(table !== undefined && { table }),
});

async function modelOf(label: string, modelName: string, table: string, statements: readonly string[]) {
  const desired = await tableAfter(`${label}_${modelName}`, table, statements);

  return { modelName, table, fingerprint: fingerprint(desired), desired } satisfies ApplyModel;
}

async function status(db: Surreal, schemaName: string, modelName: string): Promise<string | undefined> {
  const [rows] = await db
    .query('SELECT status FROM _cerial_migrations WHERE id[0] = $s AND id[1] = $m', { s: schemaName, m: modelName })
    .collect<[{ status: string }[]]>();

  return rows[0]?.status;
}

async function tableNames(db: Surreal): Promise<string[]> {
  const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, unknown> }]>();

  return Object.keys(info.tables);
}

const USER = ['DEFINE TABLE OVERWRITE user SCHEMAFULL', 'DEFINE FIELD OVERWRITE name ON TABLE user TYPE string'];
const POST = ['DEFINE TABLE OVERWRITE post SCHEMAFULL', 'DEFINE FIELD OVERWRITE title ON TABLE post TYPE string'];
const LIVE_EXTRAS =
  'DEFINE TABLE user SCHEMAFULL; DEFINE FIELD name ON TABLE user TYPE string; DEFINE FIELD legacy ON TABLE user TYPE option<string>; DEFINE INDEX legacy_idx ON TABLE user FIELDS legacy;';

describe('the lazy apply judges what the schema declares', () => {
  test('a live-only field and index do not fail a committed apply', async () => {
    const db = await scratch('lazy_extra');
    await db.query(LIVE_EXTRAS).collect();
    const schema = await schemaAfter('lazy_extra', USER);
    const user = schema.tables.find((t) => t.name === 'user')!;
    const context = {
      schemaName: 'app',
      cerialVersion: 'x',
      models: { User: { table: 'user', statements: USER, fingerprint: fingerprint(user) } },
    };

    const done = await applyUnmatched(db, context, ['User'], { manifest: schema });

    expect(done).toEqual(['User']);
    expect(await status(db, 'app', 'User')).toBe('applied');
    const live = (await readLiveSchema(db)).tables.find((t) => t.name === 'user')!;
    expect(live.fields.some((f) => f.path[0] === 'legacy')).toBe(true);
    expect(live.indexes.map((i) => i.name)).toContain('legacy_idx');
  });

  test('a declared field whose live type differs after the commit still fails and stays pending', async () => {
    const db = await scratch('lazy_wrong');
    const schema = await schemaAfter('lazy_wrong', USER);
    const user = schema.tables.find((t) => t.name === 'user')!;
    const wrong = ['DEFINE TABLE OVERWRITE user SCHEMAFULL', 'DEFINE FIELD OVERWRITE name ON TABLE user TYPE int'];
    const context = {
      schemaName: 'app',
      cerialVersion: 'x',
      models: { User: { table: 'user', statements: wrong, fingerprint: fingerprint(user) } },
    };

    const error = await applyUnmatched(db, context, ['User'], { manifest: schema }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as Error).message).toContain('do not match the schema');
    expect(await status(db, 'app', 'User')).toBe('pending');
  });
});

describe('a field moved off an index the schema keeps', () => {
  const DESIRED = [
    'DEFINE TABLE OVERWRITE user SCHEMAFULL',
    'DEFINE FIELD OVERWRITE email ON TABLE user TYPE string',
    'DEFINE INDEX OVERWRITE idx ON TABLE user COLUMNS email UNIQUE',
  ];

  test('renaming the column commits and the index ends on the new column', async () => {
    const db = await scratch('rename');
    await db
      .query(
        'DEFINE TABLE user SCHEMAFULL; DEFINE FIELD oldEmail ON TABLE user TYPE string; DEFINE INDEX idx ON TABLE user COLUMNS oldEmail UNIQUE;',
      )
      .collect();
    const desired = await schemaAfter('rename', DESIRED);
    const live = await readLiveSchema(db);
    const plan = buildMigrationPlan(
      diffSchema(desired, live, { managedTables: [] }),
      indexDesiredStatements(DESIRED),
      live,
    );

    await applyPlan(db, plan, {
      schemaName: 'app',
      cerialVersion: 'x',
      leaseOptions: FAST,
      models: [await modelOf('rename', 'User', 'user', DESIRED)],
    });

    const after = (await readLiveSchema(db)).tables.find((t) => t.name === 'user')!;
    expect(after.indexes.find((i) => i.name === 'idx')?.columns).toEqual([['email']]);
    expect(after.fields.map((f) => f.path[0])).not.toContain('oldEmail');
    expect(diffSchema(desired, await readLiveSchema(db), { managedTables: [] })).toEqual([]);
  });
});

describe('a declared table turned SCHEMALESS', () => {
  test('the reader, the differ, verify and the fingerprint all see it, and the plan restores it', async () => {
    const db = await scratch('mode');
    const desired = await schemaAfter('mode', USER);
    await db.query(USER.join(';\n')).collect();
    const before = (await readLiveSchema(db)).tables.find((t) => t.name === 'user')!;
    await db.query('DEFINE TABLE OVERWRITE user SCHEMALESS').collect();
    const live = await readLiveSchema(db);
    const table = live.tables.find((t) => t.name === 'user')!;

    expect(table.mode).toBeDefined();
    expect(fingerprint(table)).not.toBe(fingerprint(before));
    const differences = diffSchema(desired, live, { managedTables: [] }).filter((d) => d.class !== 'unmanaged');
    expect(differences.map((d) => d.kind)).toEqual(['table-mode-changed']);
    await expect(verifySchema(db, { schemaName: 'app', manifest: desired, statements: USER })).rejects.toThrow(/user/);

    const plan = buildMigrationPlan(differences, indexDesiredStatements(USER), live);
    await applyPlan(db, plan, {
      schemaName: 'app',
      cerialVersion: 'x',
      leaseOptions: FAST,
      models: [await modelOf('mode', 'User', 'user', USER)],
    });
    expect(diffSchema(desired, await readLiveSchema(db), { managedTables: [] })).toEqual([]);
  });
});

describe('a skipped statement', () => {
  test('on a table that is no model still keeps the schema row unwritten, while the models converge', async () => {
    const db = await scratch('skip');
    const plan = [...USER.map((s) => step(s, 'user')), step('-- REMOVE TABLE `old`;', 'old')];

    const result = await applyPlan(db, plan, {
      schemaName: 'app',
      cerialVersion: 'x',
      leaseOptions: FAST,
      models: [await modelOf('skip', 'User', 'user', USER)],
      schema: { schemaName: 'app', fingerprint: 'fp', managedTables: ['user'] },
    });

    expect(result.applied).toEqual(['User']);
    expect((await readState(db, 'app')).schema).toBeUndefined();
  });

  test('a commented step with no table does the same', async () => {
    const db = await scratch('skip_none');

    await applyPlan(db, [...USER.map((s) => step(s, 'user')), step('-- note')], {
      schemaName: 'app',
      cerialVersion: 'x',
      leaseOptions: FAST,
      models: [await modelOf('skip_none', 'User', 'user', USER)],
      schema: { schemaName: 'app', fingerprint: 'fp', managedTables: ['user'] },
    });

    expect((await readState(db, 'app')).schema).toBeUndefined();
  });

  test('near miss: with nothing skipped the schema row is written', async () => {
    const db = await scratch('skip_off');

    await applyPlan(
      db,
      USER.map((s) => step(s, 'user')),
      {
        schemaName: 'app',
        cerialVersion: 'x',
        leaseOptions: FAST,
        models: [await modelOf('skip_off', 'User', 'user', USER)],
        schema: { schemaName: 'app', fingerprint: 'fp', managedTables: ['user'] },
      },
    );

    expect((await readState(db, 'app')).schema?.fingerprint).toBe('fp');
  });
});

describe('several entries in one transaction', () => {
  const plan = (...lists: [readonly string[], string][]) =>
    lists.flatMap(([statements, table]) => statements.map((s) => step(s, table)));

  test('both entries land together, each with its own models and schema row', async () => {
    const db = await scratch('multi_ok');
    const entries = [
      {
        schemaName: 'one',
        models: [await modelOf('multi_ok', 'User', 'user', USER)],
        schema: { schemaName: 'one', fingerprint: 'fp-one', managedTables: ['user'] },
      },
      {
        schemaName: 'two',
        models: [await modelOf('multi_ok', 'Post', 'post', POST)],
        schema: { schemaName: 'two', fingerprint: 'fp-two', managedTables: ['post'] },
      },
    ];

    const result = await applyPlan(db, plan([USER, 'user'], [POST, 'post']), {
      cerialVersion: 'x',
      leaseOptions: FAST,
      entries,
    });

    expect(result.entries.map((e) => [e.schemaName, e.applied])).toEqual([
      ['one', ['User']],
      ['two', ['Post']],
    ]);
    expect((await readState(db, 'one')).schema?.managedTables).toEqual(['user']);
    expect((await readState(db, 'two')).schema?.fingerprint).toBe('fp-two');
    expect((await readState(db, 'two')).models.has('Post')).toBe(true);
  });

  test('a failure in the second entry leaves the first entry unwritten', async () => {
    const db = await scratch('multi_fail');
    const entries = [
      {
        schemaName: 'one',
        models: [await modelOf('multi_fail', 'User', 'user', USER)],
        schema: { schemaName: 'one', fingerprint: 'fp-one', managedTables: ['user'] },
      },
      {
        schemaName: 'two',
        models: [await modelOf('multi_fail', 'Post', 'post', POST)],
        schema: { schemaName: 'two', fingerprint: 'fp-two', managedTables: ['post'] },
      },
    ];
    const broken = [...POST, 'DEFINE FIELD OVERWRITE broken ON TABLE post TYPE nonsense<'];

    const error = await applyPlan(db, plan([USER, 'user'], [broken, 'post']), {
      cerialVersion: 'x',
      leaseOptions: FAST,
      entries,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect(await tableNames(db)).not.toContain('user');
    expect(await tableNames(db)).not.toContain('post');
    for (const schemaName of ['one', 'two']) {
      const state = await readState(db, schemaName);
      expect(state.models.size).toBe(0);
      expect(state.schema).toBeUndefined();
    }
  });
});
