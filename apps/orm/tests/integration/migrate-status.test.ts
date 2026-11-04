/**
 * `cerial migrate status` against the shared instance, each case in a scratch database of its own.
 * The command function is called in-process; the process wrapper that exits is not under test here.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { migrateStatus } from '../../src/cli/migrate/status';
import type { StatusResult, TargetStatus } from '../../src/cli/migrate/status';
import { buildSchemaMetadata } from '../../src/cli/schema-metadata';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { generateRegistryDefineStatements } from '../../src/generators/migrations';
import { mixedProject, ORDERS_MODULE, removeMixedProjects, SHOP_CERIAL } from './mixed-merge-project';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });
  opened.push(db);

  return db;
}

interface Scratch {
  readonly db: Surreal;
  readonly name: string;
}

async function scratch(label: string): Promise<Scratch> {
  const name = `status_${label}_${process.pid}_${Date.now().toString(36)}`;
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

const envFor = (database: string, extra: Record<string, string> = {}) => ({
  CERIAL_DB_URL: URL,
  CERIAL_DB_NAMESPACE: 'main',
  CERIAL_DB_DATABASE: database,
  CERIAL_DB_USERNAME: 'root',
  CERIAL_DB_PASSWORD: 'root',
  ...extra,
});

const status = (dir: string, database: string, argv: string[] = [], extra: Record<string, string> = {}) =>
  migrateStatus({ argv, env: envFor(database, extra), cwd: dir });

const CERIAL_ONLY = 'model Note {\n  id Record(int) @id\n  title String @index\n  body String?\n}\n';
const TS_ONLY = [
  "import { f, model } from 'cerial/schema';",
  "export const Note = model('Note', { id: f.record('int').id(), title: f.string(), body: f.string().optional() });",
  '',
].join('\n');

/** Defines the project's schema in the database, the way a successful migration would leave it */
async function applySchema(dir: string, db: Surreal): Promise<void> {
  const built = await buildResolvedSchemaAst({ schemaPath: `${dir}/app`, preserveHandles: true });
  const meta = buildSchemaMetadata(built.resolvedAST!);
  const statements = generateRegistryDefineStatements(
    meta.modelRegistry,
    undefined,
    undefined,
    meta.objectRegistry ?? {},
    meta.tupleRegistry ?? {},
    meta.literalRegistry ?? {},
  );
  const responses = await db.query(statements.join(';\n')).responses();
  const failed = responses.find((response) => !response.success);
  if (failed && !failed.success) throw new Error(`could not define the schema: ${failed.error.message}`);
}

async function syncedNote(label: string, files: Record<string, string> = { 'app/schema.cerial': CERIAL_ONLY }) {
  const dir = await mixedProject(files);
  const target = await scratch(label);
  await applySchema(dir, target.db);

  return { dir, ...target };
}

const dbInfo = async (db: Surreal) => (await db.query('INFO FOR DB').collect<[unknown]>())[0];
const parse = (result: StatusResult): { inSync: boolean; targets: TargetStatus[] } => JSON.parse(result.stdout);

describe('in sync, for each authoring form', () => {
  test.each([
    ['cerial only', { 'app/schema.cerial': CERIAL_ONLY }],
    ['typescript only', { 'app/note.schema.ts': TS_ONLY }],
    ['mixed', { 'app/schema.cerial': SHOP_CERIAL, 'app/orders.schema.ts': ORDERS_MODULE }],
  ])('%s exits 0 and says so', async (label, files) => {
    const { dir, name } = await syncedNote(`sync_${label.replace(/\W/g, '')}`, files);
    const result = await status(dir, name);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('In sync.');
    expect(result.stdout).not.toContain('Pending');
    expect(result.stdout).not.toContain('Drift');
  });
});

describe('drift and pending changes', () => {
  test('a hand-added field exits 1 and names the table and the field', async () => {
    const { dir, db, name } = await syncedNote('handfield');
    await db.query('DEFINE FIELD secret ON TABLE note TYPE option<string>').collect();
    const result = await status(dir, name);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Drift (1):');
    expect(result.stdout).toContain('[live only]');
    expect(result.stdout).toContain('field `secret` on table `note`');
    expect(result.stdout).toContain('Not in sync.');
  });

  test('a changed definition is worded as the definition differing, whoever changed it', async () => {
    const { dir, db, name } = await syncedNote('changed');
    await db.query('DEFINE FIELD OVERWRITE title ON TABLE note TYPE int').collect();
    const result = await status(dir, name);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('[definition differs]');
    expect(result.stdout).toContain('field `title` on table `note`');
  });

  test('a missing optional field is pending, labelled additive, and exits 1', async () => {
    const { dir, db, name } = await syncedNote('pendingfield');
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    const result = await status(dir, name);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Pending (1):');
    expect(result.stdout).toContain('[additive]');
    expect(result.stdout).toContain('field `body` on table `note`');
    expect(result.stdout).not.toContain('Drift');
  });

  test('a missing table is pending', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });
    const { name } = await scratch('pendingtable');
    const result = await status(dir, name);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('table `note` is not live yet');
  });

  test('a missing index is pending', async () => {
    const { dir, db, name } = await syncedNote('pendingindex');
    const [info] = await db.query('INFO FOR TABLE note').collect<[{ indexes: Record<string, string> }]>();
    const [index] = Object.keys(info.indexes);
    await db.query(`REMOVE INDEX ${index} ON TABLE note`).collect();
    const result = await status(dir, name);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Pending (1):');
    expect(result.stdout).toContain(`index \`${index}\` on table \`note\``);
  });
});

describe('unmanaged constructs', () => {
  test('an event and a foreign table are listed and exit 0', async () => {
    const { dir, db, name } = await syncedNote('unmanaged');
    await db.query('DEFINE EVENT audit ON TABLE note WHEN true THEN (RETURN 1)').collect();
    await db.query('DEFINE TABLE foreign_log SCHEMALESS').collect();
    const result = await status(dir, name);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unmanaged (');
    expect(result.stdout).toContain('[unmanaged]');
    expect(result.stdout).toContain('table `foreign_log`');
    expect(result.stdout.toLowerCase()).toContain('audit');
    expect(result.stdout).toContain('In sync.');
  });
});

describe('writes nothing', () => {
  test('INFO FOR DB is equal before and after, no state table appears, and rows stay', async () => {
    const { dir, db, name } = await syncedNote('readonly');
    await db.query("CREATE note:1 SET title = 'kept'").collect();
    await db.query('DEFINE FIELD secret ON TABLE note TYPE option<string>').collect();
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    const before = await dbInfo(db);

    const result = await status(dir, name);
    const after = await dbInfo(db);

    expect(result.exitCode).toBe(1);
    expect(after).toEqual(before);
    expect(
      Object.keys((after as { tables: Record<string, unknown> }).tables).filter((t) => t.startsWith('_cerial_')),
    ).toEqual([]);
    const [rows] = await db.query('SELECT title FROM note').collect<[Array<{ title: string }>]>();
    expect(rows).toEqual([{ title: 'kept' }]);
  });
});

describe('--json', () => {
  test('prints one object with the classes as keys', async () => {
    const { dir, db, name } = await syncedNote('json');
    await db.query('DEFINE FIELD secret ON TABLE note TYPE option<string>').collect();
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    await db.query('DEFINE EVENT audit ON TABLE note WHEN true THEN (RETURN 1)').collect();
    const result = await status(dir, name, ['--json']);
    const report = parse(result);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim().split('\n').length).toBeGreaterThan(1);
    expect(report.inSync).toBe(false);
    expect(report.targets).toHaveLength(1);
    const [target] = report.targets;
    expect(Object.keys(target!)).toEqual(expect.arrayContaining(['pending', 'drift', 'unmanaged']));
    expect(target!.pending.map((i) => i.field)).toEqual([['body']]);
    expect(target!.drift.map((i) => i.field)).toEqual([['secret']]);
    expect(target!.unmanaged.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain('password');
  });

  test('writes nothing to stdout besides the object, whatever the schema loader logs', async () => {
    const { dir, name } = await syncedNote('jsonquiet');
    const log = spyOn(console, 'log');
    const error = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await status(dir, name, ['--json']);

      expect(log).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
      expect(parse(result).inSync).toBe(true);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  test('an in-sync database reports empty classes and exits 0', async () => {
    const { dir, name } = await syncedNote('jsonsync');
    const result = await status(dir, name, ['--json']);
    const report = parse(result);

    expect(result.exitCode).toBe(0);
    expect(report.inSync).toBe(true);
    expect(report.targets[0]).toMatchObject({ pending: [], drift: [], unmanaged: [] });
  });
});

describe('failures exit 2', () => {
  const SENTINEL = 'sentinel-pw-7f3a91';

  test('an unreachable url prints the connection error and never the password', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });
    const result = await migrateStatus({
      argv: ['--url', 'http://127.0.0.1:1'],
      env: envFor('nope', { CERIAL_DB_PASSWORD: SENTINEL }),
      cwd: dir,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Could not connect to http://127.0.0.1:1');
    expect(result.stdout + result.stderr).not.toContain(SENTINEL);
    expect(result.stderr).not.toContain('    at ');
  });

  test('a wrong password exits 2 and the password appears nowhere', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });
    const { name } = await scratch('wrongpw');
    const result = await status(dir, name, [], { CERIAL_DB_PASSWORD: SENTINEL });

    expect(result.exitCode).toBe(2);
    expect(result.stdout + result.stderr).not.toContain(SENTINEL);
  });

  test('no url anywhere exits 2 naming what to set', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });
    const result = await migrateStatus({ argv: [], env: {}, cwd: dir });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('CERIAL_DB_URL');
  });

  test('an unknown flag exits 2 naming it', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });
    const result = await status(dir, 'x', ['--allow-destrucive']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--allow-destrucive');
  });

  test('a schema that does not load exits 2', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': 'model Note {\n  id Record(int) @id\n  title Bogus\n}\n' });
    const { name } = await scratch('badschema');
    const result = await status(dir, name);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('cerial migrate status');
  });
});

describe('a database that was never defined', () => {
  /** A name nothing has defined; cleanup removes it in case a later step creates it */
  function neverDefined(label: string): string {
    const name = `status_${label}_${process.pid}_${Date.now().toString(36)}`;
    names.push(name);

    return name;
  }

  test('reads as an empty live schema: everything pending, exit 1, not a failure', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });
    const name = neverDefined('missing');

    const result = await status(dir, name, ['--json']);
    const report = JSON.parse(result.stdout) as { inSync: boolean; targets: TargetStatus[] };

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(1);
    expect(report.inSync).toBe(false);
    expect(report.targets[0]!.pending.some((item) => item.construct === 'table' && item.table === 'note')).toBe(true);
    expect(report.targets[0]!.drift).toEqual([]);
    const [info] = await (await admin()).query('INFO FOR NS').collect<[{ databases: Record<string, string> }]>();
    expect(Object.keys(info.databases)).not.toContain(name);
  });

  test('any other read failure is still exit 2', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });

    const result = await migrateStatus({
      argv: [],
      env: envFor('whatever', { CERIAL_DB_NAMESPACE: `no_such_ns_${process.pid}` }),
      cwd: dir,
    });

    expect(result.exitCode).toBe(2);
  });
});
