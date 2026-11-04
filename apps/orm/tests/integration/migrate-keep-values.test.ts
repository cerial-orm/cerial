/**
 * What `migrate` does to rows already stored, on SurrealDB 4.0 at compatibility level 4: a field removal deletes
 * its values, a type change converts them or falls back, a new required field is filled from its default, and an
 * index is built before the steps that rewrite rows. Each case runs in a scratch database of its own.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../src/errors';
import {
  applyPlan,
  bootstrapStateTables,
  buildMigrationPlan,
  diffSchema,
  indexDesiredStatements,
  readLiveSchema,
} from '../../src/migrations';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];

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
  const name = `kv_${label}_${process.pid}_${Date.now().toString(36)}`;
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

const TABLE = 'DEFINE TABLE OVERWRITE note SCHEMAFULL';

/** Plans the move from the live database to `desired` (the generated statements) and, unless told not to, applies it. */
async function migrate(db: Surreal, label: string, desired: readonly string[]) {
  const ref = await scratch(`ref_${label}`);
  await ref.query([TABLE, ...desired].join(';\n')).collect();
  const model = await readLiveSchema(ref);
  const live = await readLiveSchema(db);
  const plan = buildMigrationPlan(
    diffSchema(model, live, { managedTables: [] }),
    indexDesiredStatements([TABLE, ...desired].map((s) => `${s};`)),
    live,
  );

  return {
    plan,
    apply: () => applyPlan(db, plan, { schemaName: 'kv', cerialVersion: 'test', models: [] }),
    after: async () => diffSchema(model, await readLiveSchema(db), { managedTables: [] }),
  };
}

const rows = async (db: Surreal): Promise<Record<string, unknown>[]> => {
  const [found] = await db.query('SELECT * OMIT id FROM note ORDER BY id').collect<[Record<string, unknown>[]]>();

  return found;
};

const seed = (fields: string, creates: string) => `DEFINE TABLE note SCHEMAFULL; ${fields}; ${creates}`;

describe('a field removal', () => {
  test('deletes that field from every row, keeps the others and leaves the rows writable', async () => {
    const db = await scratch('remove');
    await db
      .query(
        seed(
          'DEFINE FIELD title ON note TYPE string; DEFINE FIELD legacy ON note TYPE option<string>',
          "CREATE note:1 SET title = 'a', legacy = 'gone'; CREATE note:2 SET title = 'b'",
        ),
      )
      .collect();
    const run = await migrate(db, 'remove', ['DEFINE FIELD OVERWRITE title ON TABLE note TYPE string']);

    expect(run.plan.map((i) => i.statement)).toEqual(['REMOVE FIELD `legacy` ON `note`;']);
    expect(run.plan[0]!.reason).toContain('deletes its stored values');
    await run.apply();

    expect(await rows(db)).toEqual([{ title: 'a' }, { title: 'b' }]);
    await db.query("UPDATE note:1 SET title = 'z'").collect();
    expect(await rows(db)).toEqual([{ title: 'z' }, { title: 'b' }]);
    expect(await run.after()).toEqual([]);
  });

  test('removing a field no row holds still applies', async () => {
    const db = await scratch('remove_unused');
    await db
      .query(
        seed(
          'DEFINE FIELD title ON note TYPE string; DEFINE FIELD legacy ON note TYPE option<string>',
          "CREATE note:1 SET title = 'a'",
        ),
      )
      .collect();
    const run = await migrate(db, 'remove_unused', ['DEFINE FIELD OVERWRITE title ON TABLE note TYPE string']);

    await run.apply();

    expect(await rows(db)).toEqual([{ title: 'a' }]);
    expect(await run.after()).toEqual([]);
  });
});

describe('a type change over rows', () => {
  const live = seed(
    'DEFINE FIELD title ON note TYPE string; DEFINE FIELD size ON note TYPE string',
    "CREATE note:1 SET title = 'a', size = '7'; CREATE note:2 SET title = 'b', size = 'large'",
  );

  test('on an optional field converts what casts and leaves the rest absent', async () => {
    const db = await scratch('opt');
    await db.query(live).collect();
    const run = await migrate(db, 'opt', [
      'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string',
      'DEFINE FIELD OVERWRITE size ON TABLE note TYPE option<int>',
    ]);

    expect(run.plan[0]!.class).toBe('data-loss');
    await run.apply();

    expect(await rows(db)).toEqual([{ title: 'a', size: 7 }, { title: 'b' }]);
    expect(await run.after()).toEqual([]);
  });

  test('with a default gives non-converting rows the default', async () => {
    const db = await scratch('default');
    await db.query(live).collect();
    const run = await migrate(db, 'default', [
      'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string',
      'DEFINE FIELD OVERWRITE size ON TABLE note TYPE int DEFAULT 1',
    ]);

    await run.apply();

    expect(await rows(db)).toEqual([
      { title: 'a', size: 7 },
      { title: 'b', size: 1 },
    ]);
  });

  test('with neither a default nor an optional type is a plan error naming the field, and nothing changes', async () => {
    const db = await scratch('neither');
    await db.query(live).collect();

    const error = await migrate(db, 'neither', [
      'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string',
      'DEFINE FIELD OVERWRITE size ON TABLE note TYPE int',
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as Error).message).toContain('field `size` on table `note`');
    expect((error as Error).message).toContain('Add a @default, make the field optional');
    expect(await rows(db)).toEqual([
      { title: 'a', size: '7' },
      { title: 'b', size: 'large' },
    ]);
  });

  test('on a table with no rows is the bare definition, with no data-loss class', async () => {
    const db = await scratch('empty');
    await db.query(live.split('CREATE')[0]!).collect();
    const run = await migrate(db, 'empty', [
      'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string',
      'DEFINE FIELD OVERWRITE size ON TABLE note TYPE int',
    ]);

    expect(run.plan[0]!.statement).not.toContain('MIGRATE');
    expect(run.plan[0]!.class).toBe('destructive');
    await run.apply();
    expect(await run.after()).toEqual([]);
  });
});

describe('a new required field over rows', () => {
  const live = seed(
    'DEFINE FIELD title ON note TYPE string',
    "CREATE note:1 SET title = 'a'; CREATE note:2 SET title = 'b'",
  );

  test('with a default fills every row with it', async () => {
    const db = await scratch('add');
    await db.query(live).collect();
    const run = await migrate(db, 'add', [
      'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string',
      'DEFINE FIELD OVERWRITE age ON TABLE note TYPE int DEFAULT 3',
    ]);

    expect(run.plan[0]!.class).toBe('additive');
    await run.apply();

    expect(await rows(db)).toEqual([
      { title: 'a', age: 3 },
      { title: 'b', age: 3 },
    ]);
    expect(await run.after()).toEqual([]);
  });

  test('without a default is a plan error naming the field, and the rows stay as they were', async () => {
    const db = await scratch('add_none');
    await db.query(live).collect();

    const error = await migrate(db, 'add_none', [
      'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string',
      'DEFINE FIELD OVERWRITE age ON TABLE note TYPE int',
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as Error).message).toContain('new required field `age` on table `note`');
    expect(await rows(db)).toEqual([{ title: 'a' }, { title: 'b' }]);
  });

  test('an optional field adds with no data step', async () => {
    const db = await scratch('add_opt');
    await db.query(live).collect();
    const run = await migrate(db, 'add_opt', [
      'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string',
      'DEFINE FIELD OVERWRITE age ON TABLE note TYPE option<int>',
    ]);

    expect(run.plan[0]!.statement).not.toContain('MIGRATE');
    await run.apply();
    expect(await rows(db)).toEqual([{ title: 'a' }, { title: 'b' }]);
  });
});

describe('an index in the same transaction as a data step', () => {
  const live = seed(
    'DEFINE FIELD title ON note TYPE string',
    "CREATE note:1 SET title = 'a'; CREATE note:2 SET title = 'b'",
  );
  const title = 'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string';

  test('over another field is built first, so the whole plan commits', async () => {
    const db = await scratch('index_ok');
    await db.query(live).collect();
    const run = await migrate(db, 'index_ok', [
      title,
      'DEFINE FIELD OVERWRITE age ON TABLE note TYPE int DEFAULT 3',
      'DEFINE INDEX OVERWRITE note_title_unique ON TABLE note COLUMNS title UNIQUE',
    ]);
    const statements = run.plan.map((i) => i.statement!);

    expect(statements.findIndex((s) => s.startsWith('DEFINE INDEX'))).toBeLessThan(
      statements.findIndex((s) => s.includes('MIGRATE')),
    );
    await run.apply();

    expect(await rows(db)).toEqual([
      { title: 'a', age: 3 },
      { title: 'b', age: 3 },
    ]);
    expect(await run.after()).toEqual([]);
  });

  test('over the field the step fills is a plan error that says to apply twice, before anything runs', async () => {
    const db = await scratch('index_bad');
    await db.query(live).collect();

    const error = await migrate(db, 'index_bad', [
      title,
      'DEFINE FIELD OVERWRITE age ON TABLE note TYPE int DEFAULT 3',
      'DEFINE INDEX OVERWRITE note_age_index ON TABLE note COLUMNS age',
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as Error).message).toContain('index `note_age_index`');
    expect((error as Error).message).toContain('Apply the schema twice');
    expect(await rows(db)).toEqual([{ title: 'a' }, { title: 'b' }]);
  });

  test('a removal and an index on the same table commit together', async () => {
    const db = await scratch('index_remove');
    await db
      .query(
        seed(
          'DEFINE FIELD title ON note TYPE string; DEFINE FIELD legacy ON note TYPE option<string>',
          "CREATE note:1 SET title = 'a', legacy = 'x'",
        ),
      )
      .collect();
    const run = await migrate(db, 'index_remove', [
      title,
      'DEFINE INDEX OVERWRITE note_title_unique ON TABLE note COLUMNS title UNIQUE',
    ]);

    await run.apply();

    expect(await rows(db)).toEqual([{ title: 'a' }]);
    expect(await run.after()).toEqual([]);
  });
});
