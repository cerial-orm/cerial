/**
 * `cerial migrate apply --from-schema` against the shared instance, each case in a scratch database of its own.
 * Every refusal asserts the rows are still there, by count and by value, not only that the exit code is non-zero.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { PassThrough, Readable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { migrateApply } from '../../src/cli/migrate/apply';
import type { ApplyResult } from '../../src/cli/migrate/apply';
import { loadDesired } from '../../src/cli/migrate/load';
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
  const name = `apply_${label}_${process.pid}_${Date.now().toString(36)}`;
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
const NOTE_WITHOUT_BODY_PLUS_TAG = 'model Note {\n  id Record(int) @id\n  title String @index\n  tag String?\n}\n';
const NOTE_UNIQUE_BODY =
  'model Note {\n  id Record(int) @id\n  title String @index\n  body String? @unique\n  tag String?\n}\n';
const EXTRA = 'model Extra {\n  id Record(int) @id\n  label String\n}\n';
const TS_ONLY = [
  "import { f, model } from 'cerial/schema';",
  "export const Note = model('Note', { id: f.record('int').id(), title: f.string(), body: f.string().optional() });",
  '',
].join('\n');

const FLAGS = ['--from-schema'];
const BOTH = ['--from-schema', '--allow-destructive', '--allow-data-loss'];

const apply = (
  dir: string,
  database: string,
  argv: string[] = FLAGS,
  extra: { isTTY?: boolean; input?: Readable } = {},
): Promise<ApplyResult> =>
  migrateApply({
    argv,
    env: envFor(database),
    cwd: dir,
    isTTY: extra.isTTY ?? false,
    input: extra.input,
    prompt: new PassThrough(),
  });

const rows = async (db: Surreal, table: string) =>
  (await db.query(`SELECT * FROM ${table} ORDER BY id`).collect<[Array<Record<string, unknown>>]>())[0];
const fieldsOf = async (db: Surreal, table: string): Promise<string[]> => {
  const [info] = await db.query(`INFO FOR TABLE ${table}`).collect<[{ fields: Record<string, string> }]>();

  return Object.keys(info.fields);
};
const tablesOf = async (db: Surreal): Promise<string[]> => {
  const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();

  return Object.keys(info.tables);
};
const dbInfo = async (db: Surreal) => (await db.query('INFO FOR DB').collect<[unknown]>())[0];
const schemaNameOf = async (dir: string, database: string): Promise<string> =>
  (await loadDesired({ flags: {}, env: envFor(database), cwd: dir }))[0]!.entryModels[0]!.schemaName;

/** Applies the starting schema through the command itself, then seeds the rows a refusal must leave alone */
async function applied(label: string, files: Record<string, string> = { 'app/schema.cerial': NOTE }) {
  const dir = await mixedProject(files);
  const target = await scratch(label);
  const first = await apply(dir, target.name);
  expect(first.stderr).toBe('');
  expect(first.exitCode).toBe(0);
  await target.db
    .query("CREATE note:1 SET title = 'first', body = 'keep me'; CREATE note:2 SET title = 'second', body = 'and me'")
    .collect();

  return { dir, ...target };
}

async function expectNoteRowsIntact(db: Surreal): Promise<void> {
  const found = await rows(db, 'note');

  expect(found).toHaveLength(2);
  expect(found.map((r) => [r.title, r.body])).toEqual([
    ['first', 'keep me'],
    ['second', 'and me'],
  ]);
}

describe('additive changes', () => {
  test('apply with no flag creates the table and records state', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': NOTE });
    const { db, name } = await scratch('additive');
    const result = await apply(dir, name);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Applied');
    expect(await tablesOf(db)).toContain('note');
    expect(await fieldsOf(db, 'note')).toEqual(expect.arrayContaining(['title', 'body']));

    const state = await readState(db, await schemaNameOf(dir, name));
    expect(state.schema?.managedTables).toEqual(['note']);
    expect(state.models.get('Note')?.fingerprint).toBeTruthy();
  });

  test('a new field is added and managedTables grows with a new table', async () => {
    const { dir, db, name } = await applied('grow');
    await writeFile(join(dir, 'app/schema.cerial'), NOTE.replace('body String?', 'body String?\n  tag String?'));
    await writeFile(join(dir, 'app/extra.cerial'), EXTRA);
    const result = await apply(dir, name);

    expect(result.exitCode).toBe(0);
    expect(await fieldsOf(db, 'note')).toContain('tag');
    expect(await tablesOf(db)).toContain('extra');
    await expectNoteRowsIntact(db);

    const state = await readState(db, await schemaNameOf(dir, name));
    expect([...(state.schema?.managedTables ?? [])].sort()).toEqual(['extra', 'note']);
  });

  test('applying twice: the second run reports nothing to do and changes nothing', async () => {
    const { dir, db, name } = await applied('twice');
    const before = await dbInfo(db);
    const second = await apply(dir, name);

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('Nothing to do');
    expect(second.stdout).not.toContain('Applied');
    expect(await dbInfo(db)).toEqual(before);
    await expectNoteRowsIntact(db);
  });
});

describe('the flags', () => {
  test('a destructive change without --allow-destructive refuses the whole plan, additive part included', async () => {
    const { dir, db, name } = await applied('destructive');
    const schema = await schemaNameOf(dir, name);
    const stateBefore = await readState(db, schema);
    await writeFile(join(dir, 'app/schema.cerial'), NOTE_WITHOUT_BODY_PLUS_TAG);
    const infoBefore = await dbInfo(db);
    const result = await apply(dir, name);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--allow-destructive');
    expect(result.stderr).toContain('field');
    expect(result.stderr).toContain('`note`');
    expect(result.stderr).not.toContain('--allow-data-loss');
    expect(result.stdout).not.toContain('Applied');
    expect(await fieldsOf(db, 'note')).not.toContain('tag');
    expect(await fieldsOf(db, 'note')).toContain('body');
    expect(await dbInfo(db)).toEqual(infoBefore);
    await expectNoteRowsIntact(db);
    expect(await readState(db, schema)).toEqual(stateBefore);
  });

  test('with --allow-destructive a removed field is dropped and its values with it, other rows stay', async () => {
    const { dir, db, name } = await applied('fieldgone');
    await writeFile(join(dir, 'app/schema.cerial'), NOTE_WITHOUT_BODY_PLUS_TAG);
    const result = await apply(dir, name, ['--from-schema', '--allow-destructive']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await fieldsOf(db, 'note')).not.toContain('body');
    expect(await fieldsOf(db, 'note')).toContain('tag');
    const found = await rows(db, 'note');
    expect(found.map((r) => r.title)).toEqual(['first', 'second']);
    expect(found.every((r) => r.body === undefined)).toBe(true);
  });

  test('REMOVE TABLE with --allow-destructive alone is refused and the table and rows are intact', async () => {
    const { dir, db, name } = await applied('removeone', { 'app/schema.cerial': NOTE, 'app/extra.cerial': EXTRA });
    await db.query("CREATE extra:1 SET label = 'precious'; CREATE extra:2 SET label = 'also precious'").collect();
    const schema = await schemaNameOf(dir, name);
    const stateBefore = await readState(db, schema);
    await writeFile(join(dir, 'app/extra.cerial'), '');
    const infoBefore = await dbInfo(db);
    const result = await apply(dir, name, ['--from-schema', '--allow-destructive']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--allow-data-loss');
    expect(result.stderr).toContain('`extra`');
    expect(await tablesOf(db)).toContain('extra');
    expect((await rows(db, 'extra')).map((r) => r.label)).toEqual(['precious', 'also precious']);
    expect(await dbInfo(db)).toEqual(infoBefore);
    await expectNoteRowsIntact(db);
    expect(await readState(db, schema)).toEqual(stateBefore);
  });

  test('REMOVE TABLE with no flag names both flags', async () => {
    const { dir, db, name } = await applied('removenone', { 'app/schema.cerial': NOTE, 'app/extra.cerial': EXTRA });
    await db.query("CREATE extra:1 SET label = 'precious'").collect();
    await writeFile(join(dir, 'app/extra.cerial'), '');
    const result = await apply(dir, name);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--allow-destructive and --allow-data-loss');
    expect(await rows(db, 'extra')).toHaveLength(1);
  });

  test('both flags remove the table and the state row records it', async () => {
    const { dir, db, name } = await applied('removeboth', { 'app/schema.cerial': NOTE, 'app/extra.cerial': EXTRA });
    const schema = await schemaNameOf(dir, name);
    expect([...((await readState(db, schema)).schema?.managedTables ?? [])].sort()).toEqual(['extra', 'note']);
    await writeFile(join(dir, 'app/extra.cerial'), '');
    const result = await apply(dir, name, BOTH);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await tablesOf(db)).not.toContain('extra');
    expect(await tablesOf(db)).toContain('note');
    await expectNoteRowsIntact(db);
    expect((await readState(db, schema)).schema?.managedTables).toEqual(['note']);

    const again = await apply(dir, name, BOTH);
    expect(again.stdout).toContain('Nothing to do');
  });

  test('an unknown flag is refused by name', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': NOTE });
    const { db, name } = await scratch('unknownflag');
    const result = await apply(dir, name, ['--from-schema', '--allow-destrucive']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--allow-destrucive');
    expect(await tablesOf(db)).not.toContain('note');
  });

  test('without --from-schema nothing is applied', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': NOTE });
    const { db, name } = await scratch('nofrom');
    const result = await apply(dir, name, []);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--from-schema');
    expect(await tablesOf(db)).not.toContain('note');
  });
});

describe('the terminal confirmation', () => {
  const removeBody = (dir: string) => writeFile(join(dir, 'app/schema.cerial'), NOTE_WITHOUT_BODY_PLUS_TAG);

  test('yes applies the destructive plan', async () => {
    const { dir, db, name } = await applied('ttyyes');
    await removeBody(dir);
    const result = await apply(dir, name, ['--from-schema', '--allow-destructive'], {
      isTTY: true,
      input: Readable.from(['y\n']),
    });

    expect(result.exitCode).toBe(0);
    expect(await fieldsOf(db, 'note')).not.toContain('body');
  });

  test('no applies nothing and the rows and schema are as they were', async () => {
    const { dir, db, name } = await applied('ttyno');
    const schema = await schemaNameOf(dir, name);
    const stateBefore = await readState(db, schema);
    await removeBody(dir);
    const infoBefore = await dbInfo(db);
    const result = await apply(dir, name, ['--from-schema', '--allow-destructive'], {
      isTTY: true,
      input: Readable.from(['n\n']),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not confirmed');
    expect(await dbInfo(db)).toEqual(infoBefore);
    await expectNoteRowsIntact(db);
    expect(await readState(db, schema)).toEqual(stateBefore);
  });

  test('a closed input stream counts as no', async () => {
    const { dir, db, name } = await applied('ttyeof');
    await removeBody(dir);
    const result = await apply(dir, name, ['--from-schema', '--allow-destructive'], {
      isTTY: true,
      input: Readable.from([]),
    });

    expect(result.exitCode).toBe(1);
    expect(await fieldsOf(db, 'note')).toContain('body');
  });

  test('off a terminal there is no prompt: the flags authorise', async () => {
    const { dir, db, name } = await applied('nottty');
    await removeBody(dir);
    const input = Readable.from(['n\n']);
    const result = await apply(dir, name, ['--from-schema', '--allow-destructive'], { isTTY: false, input });

    expect(result.exitCode).toBe(0);
    expect(await fieldsOf(db, 'note')).not.toContain('body');
    expect(input.readableDidRead).toBe(false);
  });

  test('an additive plan on a terminal is not asked about', async () => {
    const { dir, db, name } = await applied('ttyadd');
    await writeFile(join(dir, 'app/schema.cerial'), NOTE.replace('body String?', 'body String?\n  tag String?'));
    const input = Readable.from(['n\n']);
    const result = await apply(dir, name, FLAGS, { isTTY: true, input });

    expect(result.exitCode).toBe(0);
    expect(await fieldsOf(db, 'note')).toContain('tag');
    expect(input.readableDidRead).toBe(false);
  });

  test('a refused plan on a terminal is refused before any question', async () => {
    const { dir, db, name } = await applied('ttyrefuse');
    await removeBody(dir);
    const input = Readable.from(['y\n']);
    const result = await apply(dir, name, FLAGS, { isTTY: true, input });

    expect(result.exitCode).toBe(1);
    expect(input.readableDidRead).toBe(false);
    expect(await fieldsOf(db, 'note')).toContain('body');
  });
});

describe('a failure mid-apply', () => {
  test('a UNIQUE index over duplicate values leaves the schema and rows as they were and the state unmatched', async () => {
    const { dir, db, name } = await applied('failure');
    await db.query("CREATE note:3 SET title = 'third', body = 'keep me'").collect();
    const schema = await schemaNameOf(dir, name);
    expect((await readState(db, schema)).models.get('Note')).toBeDefined();
    await writeFile(join(dir, 'app/schema.cerial'), NOTE_UNIQUE_BODY);
    const fieldsBefore = await fieldsOf(db, 'note');
    const [infoBefore] = await db.query('INFO FOR TABLE note').collect<[unknown]>();
    const result = await apply(dir, name);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('rolled back');
    expect(await fieldsOf(db, 'note')).toEqual(fieldsBefore);
    expect(await fieldsOf(db, 'note')).not.toContain('tag');
    const [infoAfter] = await db.query('INFO FOR TABLE note').collect<[unknown]>();
    expect(infoAfter).toEqual(infoBefore);
    const found = await rows(db, 'note');
    expect(found.map((r) => r.title)).toEqual(['first', 'second', 'third']);

    const state = await readState(db, schema);
    expect(state.models.get('Note')).toBeUndefined();
    expect(state.schema?.managedTables).toEqual(['note']);

    // Fix the data and the same model applies again
    await db.query("UPDATE note:3 SET body = 'now unique'").collect();
    const retry = await apply(dir, name);
    expect(retry.stderr).toBe('');
    expect(retry.exitCode).toBe(0);
    expect(await fieldsOf(db, 'note')).toContain('tag');
    expect((await readState(db, schema)).models.get('Note')).toBeDefined();
  });
});

describe('authoring forms', () => {
  test('a .schema.ts-only project applies, then has nothing to do', async () => {
    const dir = await mixedProject({ 'app/note.schema.ts': TS_ONLY });
    const { db, name } = await scratch('tsonly');
    const result = await apply(dir, name);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await fieldsOf(db, 'note')).toEqual(expect.arrayContaining(['title', 'body']));
    expect((await readState(db, await schemaNameOf(dir, name))).schema?.managedTables).toEqual(['note']);
    expect((await apply(dir, name)).stdout).toContain('Nothing to do');
  });
});

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

const AUDIT = 'model AuditEntry {\n  id Record(int) @id\n  action String\n}\n';

describe('the state rows are the ones the generated client reads', () => {
  test('a single-schema config: client class name, model-name keys, generated fingerprints', async () => {
    const dir = await mixedProject({
      'cerial.config.ts': "export default { schema: './app' };\n",
      'app/schema.cerial': NOTE + EXTRA,
    });
    const { db, name } = await scratch('stateone');
    const result = await apply(dir, name);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);

    const expected = await generatedFingerprints(join(dir, 'app'));
    const state = await readState(db, 'CerialClient');
    expect(Object.keys(expected).sort()).toEqual(['Extra', 'Note']);
    expect([...state.models.keys()].sort()).toEqual(['Extra', 'Note']);
    for (const [model, fp] of Object.entries(expected)) expect(state.models.get(model)?.fingerprint).toBe(fp);
    // The table is `note`, the model `Note`: the row is keyed by the model
    expect(state.schema?.managedTables?.slice().sort()).toEqual(['extra', 'note']);
  });

  test('a two-entry config: one schema row set per client class name', async () => {
    const dir = await mixedProject({
      'cerial.config.ts':
        "export default { schemas: { alpha: { path: './alpha', output: './out/a' }, beta_two: { path: './beta', output: './out/b' } } };\n",
      'alpha/schema.cerial': NOTE,
      'beta/schema.cerial': AUDIT,
    });
    const { db, name } = await scratch('statetwo');
    const result = await apply(dir, name);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);

    for (const [schema, folder, model, table] of [
      ['AlphaCerialClient', 'alpha', 'Note', 'note'],
      ['BetaTwoCerialClient', 'beta', 'AuditEntry', 'audit_entry'],
    ] as const) {
      const expected = await generatedFingerprints(join(dir, folder));
      const state = await readState(db, schema);
      expect([...state.models.keys()]).toEqual([model]);
      expect(state.models.get(model)?.fingerprint).toBe(expected[model]!);
      expect(state.schema?.managedTables).toEqual([table]);
    }
    expect((await apply(dir, name)).stdout).toContain('Nothing to do');
  });
});
