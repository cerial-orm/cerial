/**
 * `cerial migrate baseline` against the shared instance, each case in a scratch database of its own.
 * The database starts out as one that already holds the schema's tables and rows but no migration state.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { migrateApply } from '../../src/cli/migrate/apply';
import { migrateBaseline } from '../../src/cli/migrate/baseline';
import { migratePlan } from '../../src/cli/migrate/plan-file';
import { migrateStatus } from '../../src/cli/migrate/status';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { buildSchemaMetadata } from '../../src/cli/schema-metadata';
import { generatePerModelMigrationCode } from '../../src/generators/migrations/define-generator';
import { readState } from '../../src/migrations';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });
  opened.push(db);

  return db;
}

async function scratch(label: string): Promise<{ db: Surreal; name: string }> {
  const name = `baseline_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await admin();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  names.push(name);

  return { db, name };
}

afterAll(async () => {
  const root = await admin();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
  await removeMixedProjects();
});

const envFor = (database: string) => ({
  CERIAL_DB_URL: URL,
  CERIAL_DB_NAMESPACE: 'main',
  CERIAL_DB_DATABASE: database,
  CERIAL_DB_USERNAME: 'root',
  CERIAL_DB_PASSWORD: 'root',
});

const NOTE = 'model Note {\n  id Record(int) @id\n  title String @index\n  body String?\n}\n';
const NOTE_DIFFERENT = 'model Note {\n  id Record(int) @id\n  title String @index\n  tag String?\n}\n';

const baseline = (dir: string, database: string, argv: string[] = []) =>
  migrateBaseline({ argv, env: envFor(database), cwd: dir });
const status = (dir: string, database: string) => migrateStatus({ argv: [], env: envFor(database), cwd: dir });

/** What the generated client's `modelFingerprints` holds for the schema folder, read from the generator's own output */
async function generatedFingerprints(folder: string): Promise<Record<string, string>> {
  const built = await buildResolvedSchemaAst({ schemaPath: folder, preserveHandles: true });
  const meta = buildSchemaMetadata(built.resolvedAST!);
  const code = generatePerModelMigrationCode(
    Object.values(meta.modelRegistry),
    meta.objectRegistry,
    meta.tupleRegistry,
    meta.literalRegistry,
  );
  const block = /modelFingerprints[^{]*\{([^}]*)\}/.exec(code)![1]!;

  return Object.fromEntries([...block.matchAll(/(\w+): '([0-9a-f]+)'/g)].map((m) => [m[1]!, m[2]!]));
}

const tablesOf = async (db: Surreal): Promise<string[]> => {
  const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();

  return Object.keys(info.tables).sort();
};

/** `INFO FOR TABLE` and the row count of each given table */
async function snapshot(db: Surreal, tables: readonly string[]) {
  const out: Record<string, { info: unknown; rows: unknown[] }> = {};
  for (const table of tables) {
    const [info] = await db.query(`INFO FOR TABLE ${table}`).collect<[unknown]>();
    const [rows] = await db.query(`SELECT * FROM ${table} ORDER BY id`).collect<[unknown[]]>();
    out[table] = { info, rows };
  }

  return out;
}

/**
 * A database that holds the schema's table with rows and a foreign table with rows, and has no migration state:
 * the schema is applied through the command, then the state tables are dropped.
 */
async function adopted(label: string, schema: string = NOTE) {
  const dir = await mixedProject({
    'cerial.config.ts': "export default { schema: './app' };\n",
    'app/schema.cerial': NOTE,
  });
  const target = await scratch(label);
  const first = await migrateApply({ argv: ['--from-schema'], env: envFor(target.name), cwd: dir, isTTY: false });
  expect(first.exitCode).toBe(0);
  await target.db
    .query(
      "CREATE note:1 SET title = 'first', body = 'keep me'; CREATE note:2 SET title = 'second'; DEFINE TABLE legacy SCHEMALESS; CREATE legacy:1 SET v = 1; CREATE legacy:2 SET v = 2",
    )
    .collect();
  await target.db.query('REMOVE TABLE _cerial_migrations; REMOVE TABLE _cerial_migration_lease').collect();
  if (schema !== NOTE) await writeFile(join(dir, 'app/schema.cerial'), schema);

  return { dir, ...target };
}

describe('a matching schema', () => {
  test('is recorded: status exits 0 and the rows are the ones the generated client reads', async () => {
    const { dir, db, name } = await adopted('match');
    expect(await tablesOf(db)).toEqual(['legacy', 'note']);

    const result = await baseline(dir, name);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Recorded 1 model(s)');

    const after = await status(dir, name);
    expect(after.stderr).toBe('');
    expect(after.exitCode).toBe(0);

    const expected = await generatedFingerprints(join(dir, 'app'));
    const state = await readState(db, 'CerialClient');
    expect([...state.models.keys()]).toEqual(['Note']);
    expect(state.models.get('Note')?.fingerprint).toBe(expected.Note!);
    expect(state.schema?.managedTables).toEqual(['note']);
    expect(state.schema?.statements).toEqual([]);
  });

  test('issues no DDL: INFO FOR TABLE and the rows of every table are identical before and after', async () => {
    const { dir, db, name } = await adopted('noddl');
    const before = await snapshot(db, ['legacy', 'note']);

    const result = await baseline(dir, name);
    expect(result.exitCode).toBe(0);

    expect(await snapshot(db, ['legacy', 'note'])).toEqual(before);
    expect(before.note!.rows).toHaveLength(2);
    expect(before.legacy!.rows).toHaveLength(2);
    expect(await tablesOf(db)).toEqual(['_cerial_migration_lease', '_cerial_migrations', 'legacy', 'note']);
  });

  test('a second baseline records the same state and releases the lease', async () => {
    const { dir, db, name } = await adopted('twice');
    expect((await baseline(dir, name)).exitCode).toBe(0);
    const first = await readState(db, 'CerialClient');

    expect((await baseline(dir, name)).exitCode).toBe(0);
    const second = await readState(db, 'CerialClient');
    expect(second.schema).toEqual(first.schema);
    expect(second.models.get('Note')?.fingerprint).toBe(first.models.get('Note')?.fingerprint);
    const [leases] = await db.query('SELECT * FROM _cerial_migration_lease').collect<[unknown[]]>();
    expect(leases).toHaveLength(0);
  });
});

describe('a foreign table', () => {
  test('is never recorded as managed and no later plan or apply proposes removing it', async () => {
    const { dir, db, name } = await adopted('foreign');
    expect((await baseline(dir, name)).exitCode).toBe(0);

    const state = await readState(db, 'CerialClient');
    expect(state.schema?.managedTables).not.toContain('legacy');

    const out = await mkdtemp(join(tmpdir(), 'baseline-plan-'));
    const plan = await migratePlan({ argv: ['--out', out], env: envFor(name), cwd: dir });
    expect(plan.exitCode).toBe(0);
    expect(plan.files).toEqual([]);
    expect(plan.stdout).toContain('Nothing to do');

    const both = ['--from-schema', '--allow-destructive', '--allow-data-loss'];
    const applied = await migrateApply({ argv: both, env: envFor(name), cwd: dir, isTTY: false });
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout).toContain('Nothing to do');

    expect(await tablesOf(db)).toContain('legacy');
    const [rows] = await db.query('SELECT v FROM legacy ORDER BY v').collect<[Array<{ v: number }>]>();
    expect(rows.map((r) => r.v)).toEqual([1, 2]);
  });
});

describe('a live schema that differs', () => {
  test('refuses, lists the differences, writes nothing and leaves no state rows', async () => {
    const { dir, db, name } = await adopted('differs', NOTE_DIFFERENT);
    const before = await snapshot(db, ['legacy', 'note']);

    const result = await baseline(dir, name);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('nothing was recorded');
    expect(result.stderr).toContain('--accept-drift');
    expect(result.stderr).toContain('body');
    expect(result.stderr).toContain('tag');

    expect(await tablesOf(db)).toEqual(['legacy', 'note']);
    expect(await snapshot(db, ['legacy', 'note'])).toEqual(before);
    expect((await readState(db, 'CerialClient')).models.size).toBe(0);
  });

  test('with --accept-drift records the schema fingerprints, issues no DDL, and status keeps reporting the drift', async () => {
    const { dir, db, name } = await adopted('accept', NOTE_DIFFERENT);
    const before = await snapshot(db, ['legacy', 'note']);

    const result = await baseline(dir, name, ['--accept-drift']);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Accepted');
    expect(result.stdout).toContain('Recorded 1 model(s)');

    expect(await snapshot(db, ['legacy', 'note'])).toEqual(before);
    const expected = await generatedFingerprints(join(dir, 'app'));
    const state = await readState(db, 'CerialClient');
    expect(state.models.get('Note')?.fingerprint).toBe(expected.Note!);
    expect(state.schema?.managedTables).toEqual(['note']);
    expect((await status(dir, name)).exitCode).toBe(1);
  });

  test('a declared table that is not live is not recorded, so the client still creates it', async () => {
    const { dir, db, name } = await adopted('missing');
    await db.query('REMOVE TABLE note').collect();

    expect((await baseline(dir, name)).exitCode).toBe(1);
    expect((await readState(db, 'CerialClient')).models.size).toBe(0);

    const result = await baseline(dir, name, ['--accept-drift']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Recorded 0 model(s)');
    const state = await readState(db, 'CerialClient');
    expect(state.models.size).toBe(0);
    expect(state.schema?.managedTables).toEqual([]);
  });
});

describe('a database that was never defined', () => {
  for (const argv of [[], ['--accept-drift']]) {
    test(`is refused with exit 1 and created nowhere (${argv.join(' ') || 'no flag'})`, async () => {
      const dir = await mixedProject({
        'cerial.config.ts': "export default { schema: './app' };\n",
        'app/schema.cerial': NOTE,
      });
      const name = `baseline_missing_${process.pid}_${Date.now().toString(36)}`;
      names.push(name);

      const result = await baseline(dir, name, argv);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('does not exist');
      expect(result.stdout).toBe('');
      const [info] = await (await admin()).query('INFO FOR NS').collect<[{ databases: Record<string, string> }]>();
      expect(Object.keys(info.databases)).not.toContain(name);
    });
  }
});

describe('several schema entries on one database', () => {
  test('are recorded in one transaction: a failure on the second leaves the first unrecorded', async () => {
    const dir = await mixedProject({
      'cerial.config.ts':
        "export default { schemas: { alpha: { path: './alpha', output: './out/a' }, beta: { path: './beta', output: './out/b' } } };\n",
      'alpha/schema.cerial': NOTE,
      'beta/schema.cerial': 'model Audit {\n  id Record(int) @id\n  action String\n}\n',
    });
    const { db, name } = await scratch('twoentries');
    expect((await migrateApply({ argv: ['--from-schema'], env: envFor(name), cwd: dir, isTTY: false })).exitCode).toBe(
      0,
    );
    await db
      .query(
        "DELETE FROM _cerial_migrations; DEFINE EVENT refuse_beta ON _cerial_migrations WHEN $after.id[0] = 'BetaCerialClient' THEN { THROW 'refused' }",
      )
      .collect();

    const result = await baseline(dir, name);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('rolled back');
    const [rows] = await db.query('SELECT * FROM _cerial_migrations').collect<[unknown[]]>();
    expect(rows).toEqual([]);

    await db.query('REMOVE EVENT refuse_beta ON _cerial_migrations').collect();
    const retry = await baseline(dir, name);
    expect(retry.exitCode).toBe(0);
    expect((await readState(db, 'AlphaCerialClient')).models.has('Note')).toBe(true);
    expect((await readState(db, 'BetaCerialClient')).models.has('Audit')).toBe(true);
  });
});
