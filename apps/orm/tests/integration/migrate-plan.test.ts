/**
 * `cerial migrate plan` against the shared instance, each case in a scratch database of its own.
 * Plan files are written under a temporary directory, never into the repository.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { loadDesired } from '../../src/cli/migrate/load';
import { fileSafe, migratePlan, renderPlanFile } from '../../src/cli/migrate/plan-file';
import type { PlanResult } from '../../src/cli/migrate/plan-file';
import { buildSchemaMetadata } from '../../src/cli/schema-metadata';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { generateRegistryDefineStatements } from '../../src/generators/migrations';
import { bootstrapStateTables, liveFingerprint, readLiveSchema, writeSchemaState } from '../../src/migrations';
import { LF, quote, TERMINATORS } from './surrealdb-facts/hostile-names';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];
const tempDirs: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });
  opened.push(db);

  return db;
}

async function scratch(label: string): Promise<{ db: Surreal; name: string }> {
  const name = `plan_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await admin();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  names.push(name);

  return { db, name };
}

async function outDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-plan-out-'));
  tempDirs.push(dir);

  return dir;
}

afterAll(async () => {
  const root = await admin();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  await removeMixedProjects();
});

const envFor = (database: string) => ({
  CERIAL_DB_URL: URL,
  CERIAL_DB_NAMESPACE: 'main',
  CERIAL_DB_DATABASE: database,
  CERIAL_DB_USERNAME: 'root',
  CERIAL_DB_PASSWORD: 'root',
});

const CERIAL_ONLY = 'model Note {\n  id Record(int) @id\n  title String @index\n  body String?\n}\n';

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

async function syncedNote(label: string) {
  const dir = await mixedProject({ 'app/schema.cerial': CERIAL_ONLY });
  const target = await scratch(label);
  await applySchema(dir, target.db);
  const out = await outDir();

  return { dir, out, ...target };
}

const plan = (
  dir: string,
  database: string,
  out: string,
  extra: string[] = [],
  now?: () => Date,
): Promise<PlanResult> => migratePlan({ argv: ['--out', out, ...extra], env: envFor(database), cwd: dir, now });

const dbInfo = async (db: Surreal) => (await db.query('INFO FOR DB').collect<[unknown]>())[0];
const read = (path: string): Promise<string> => readFile(path, 'utf8');
const isRemove = (line: string): boolean => /^-- REMOVE /.test(line);

describe('what the file holds', () => {
  test('an additive statement is live, a type change is commented under its class annotation', async () => {
    const { dir, db, name, out } = await syncedNote('layout');
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    await db.query('DEFINE FIELD OVERWRITE title ON TABLE note TYPE int').collect();
    const result = await plan(dir, name, out);

    expect(result.exitCode).toBe(0);
    expect(result.files).toHaveLength(1);
    const text = await read(result.files[0]!);
    const lines = text.split('\n');
    const live = lines.filter((l) => l.startsWith('DEFINE '));
    const index = lines.findIndex((l) => l.startsWith('-- cerial:destructive '));

    expect(live.some((l) => l.includes('body'))).toBe(true);
    expect(index).toBeGreaterThan(-1);
    expect(lines[index + 1]).toMatch(/^-- DEFINE FIELD .*title/);
    expect(live.some((l) => l.includes('title'))).toBe(false);
    expect(lines.slice(0, 8).join('\n')).toContain('--allow-destructive');
    expect(lines.slice(0, 8).join('\n')).not.toContain('--allow-data-loss');
  });

  test('the header carries the desired and the live fingerprint', async () => {
    const { dir, db, name, out } = await syncedNote('header');
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    const live = liveFingerprint(await readLiveSchema(db));
    const [target] = await loadDesired({ flags: {}, env: envFor(name), cwd: dir });
    const text = await read((await plan(dir, name, out)).files[0]!);

    expect(text).toContain(`-- desired fingerprint: ${target!.schemaFingerprint}`);
    expect(text).toContain(`-- live fingerprint: ${live}`);
  });

  test('a removed managed table is commented as data-loss and the header names both flags', async () => {
    const { dir, db, name, out } = await syncedNote('dataloss');
    await bootstrapStateTables(db);
    const [target] = await loadDesired({ flags: {}, env: envFor(name), cwd: dir });
    await db.query('DEFINE TABLE gone SCHEMALESS').collect();
    await db.query('CREATE gone:1').collect();
    await writeSchemaState(db, {
      schemaName: target!.entryModels[0]!.schemaName,
      fingerprint: 'x',
      statements: [],
      managedTables: ['note', 'gone'],
    });
    const text = await read((await plan(dir, name, out)).files[0]!);

    expect(text).toContain('-- cerial:data-loss ');
    expect(text).toMatch(/^-- REMOVE TABLE .*gone/m);
    expect(text).not.toMatch(/^REMOVE /m);
    expect(text).toContain('--allow-destructive and --allow-data-loss');
  });
});

describe('hostile names stay inside their comment', () => {
  test.each(TERMINATORS)('%s in a live field and a managed table', async (_label, raw) => {
    const { dir, db, name, out } = await syncedNote('hostile');
    await bootstrapStateTables(db);
    const [target] = await loadDesired({ flags: {}, env: envFor(name), cwd: dir });
    await db.query('CREATE victim:1 SET keep = true').collect();
    const field = quote(`x${raw}; REMOVE TABLE victim; --`);
    const table = quote(`t${raw}REMOVE TABLE victim;`);
    await db.query(`DEFINE FIELD ${field} ON TABLE note TYPE string`).collect();
    await db.query(`DEFINE TABLE ${table} SCHEMALESS`).collect();
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    await writeSchemaState(db, {
      schemaName: target!.entryModels[0]!.schemaName,
      fingerprint: 'x',
      statements: [],
      managedTables: ['note', `t${raw}REMOVE TABLE victim;`],
    });

    const text = await read((await plan(dir, name, out)).files[0]!);

    expect(text).toContain('-- cerial:destructive ');
    expect(text).toContain('-- cerial:data-loss ');
    for (const [, other] of TERMINATORS) if (other !== LF) expect(text).not.toContain(other);
    for (const line of text.split(LF)) {
      expect(line === '' || line.startsWith('--') || line.startsWith('DEFINE ')).toBe(true);
    }
    expect(text).not.toMatch(/^REMOVE /m);

    const responses = await db.query(text).responses();
    expect(responses.every((r) => r.success)).toBe(true);
    const [rows] = await db.query('SELECT * FROM victim').collect<[{ keep: boolean }[]]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.keep).toBe(true);
  });

  test.each(TERMINATORS)('%s in the header fields', (_label, raw) => {
    const text = renderPlanFile(
      {
        connection: { url: URL, namespace: `n${raw}x`, database: `d${raw}y` },
        entries: [`e${raw}z`],
        schemaFingerprint: 'abc',
      },
      [{ statement: 'REMOVE TABLE a;', class: 'data-loss', reason: `r${raw}s`, construct: 'table' }],
      'def',
    );

    for (const line of text.split(LF)) expect(line === '' || line.startsWith('--')).toBe(true);
    for (const [, other] of TERMINATORS) if (other !== LF) expect(text).not.toContain(other);
    expect(text.split(LF).filter((l) => isRemove(l))).toHaveLength(1);
  });
});

describe('where the file goes', () => {
  test('two runs in the same second write two files and never overwrite', async () => {
    const { dir, db, name, out } = await syncedNote('twice');
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    const now = () => new Date('2026-11-03T10:20:30.456Z');
    const first = await plan(dir, name, out, [], now);
    const firstText = await read(first.files[0]!);
    const second = await plan(dir, name, out, [], now);

    expect(first.files[0]).not.toBe(second.files[0]);
    expect(first.files[0]).toMatch(/20261103T102030Z-[\w+.-]+\.surql$/);
    expect(await read(first.files[0]!)).toBe(firstText);
    expect(await readdir(out)).toHaveLength(2);
  });

  test('the default directory is cerial/migrations under the working directory', async () => {
    const { dir, db, name } = await syncedNote('default');
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    const result = await migratePlan({ argv: [], env: envFor(name), cwd: dir });

    expect(result.files[0]!.startsWith(join(dir, 'cerial', 'migrations'))).toBe(true);
  });

  test('--out naming a file is refused naming --out, and nothing is written', async () => {
    const { dir, db, name, out } = await syncedNote('outfile');
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    const file = join(out, 'taken');
    await writeFile(file, 'keep');
    const result = await plan(dir, name, file);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--out');
    expect(await read(file)).toBe('keep');
  });

  test('an empty --out is refused naming --out', async () => {
    const { dir, name } = await syncedNote('outempty');
    const result = await migratePlan({ argv: ['--out='], env: envFor(name), cwd: dir });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--out');
  });

  test('a schema name becomes one safe file name part', () => {
    expect(fileSafe('../../etc/passwd')).not.toMatch(/[/\\]/);
    expect(fileSafe('.hidden')).not.toMatch(/^\./);
    expect(fileSafe('..')).not.toMatch(/^\./);
    expect(fileSafe(`a${LF}b`)).toBe('a_b');
    expect(fileSafe('')).toBe('schema');
    expect(fileSafe('x'.repeat(200))).toHaveLength(64);
  });
});

describe('writes nothing to the database', () => {
  test('INFO FOR DB is equal before and after, and rows stay', async () => {
    const { dir, db, name, out } = await syncedNote('readonly');
    await db.query("CREATE note:1 SET title = 'kept'").collect();
    await db.query('DEFINE FIELD OVERWRITE title ON TABLE note TYPE int').collect();
    await db.query('REMOVE FIELD body ON TABLE note').collect();
    const before = await dbInfo(db);
    const result = await plan(dir, name, out);

    expect(result.files).toHaveLength(1);
    expect(await dbInfo(db)).toEqual(before);
    const [rows] = await db.query('SELECT * FROM note').collect<[unknown[]]>();
    expect(rows).toHaveLength(1);
  });
});

describe('nothing to do', () => {
  test('writes no file, creates no directory and says so', async () => {
    const { dir, name } = await syncedNote('nothing');
    const out = join(await outDir(), 'fresh');
    const result = await plan(dir, name, out);

    expect(result.exitCode).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.stdout).toContain('Nothing to do');
    expect(await stat(out).catch(() => undefined)).toBeUndefined();
  });
});
