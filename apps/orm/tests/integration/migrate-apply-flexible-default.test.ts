/**
 * Declaring a key that rows already hold under a `@flexible` object, with a `@default`: the step can overwrite a
 * stored value, so it is classed data-loss, refused without both flags, and keeps every value that casts.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { migratePlan } from '../../src/cli/migrate/plan-file';
import { migrateApply } from '../../src/cli/migrate/apply';
import type { ApplyResult } from '../../src/cli/migrate/apply';
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
  const name = `flexdef_${label}_${process.pid}_${Date.now().toString(36)}`;
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

const run = (dir: string, database: string, argv: string[]): Promise<ApplyResult> =>
  migrateApply({ argv, env: envFor(database), cwd: dir, isTTY: false, prompt: new PassThrough() });

const BEFORE = (flex: boolean) =>
  `object Meta {\n  label String?\n}\n\nmodel Account {\n  id Record(int) @id\n  meta Meta ${flex ? '@flexible' : ''}\n}\n`;
const AFTER = (flex: boolean) =>
  `object Meta {\n  label String?\n  balance Int @default(0)\n}\n\nmodel Account {\n  id Record(int) @id\n  meta Meta ${flex ? '@flexible' : ''}\n}\n`;

async function seeded(label: string, flex: boolean) {
  const dir = await mixedProject({ 'app/schema.cerial': BEFORE(flex) });
  const target = await scratch(label);
  const first = await run(dir, target.name, ['--from-schema']);
  expect(first.exitCode).toBe(0);
  // A strict object rejects the undeclared key, so only the flexible one can hold rows that carry it.
  const stored = (n: number) => (flex ? `, balance: ${n === 1 ? '4200' : "'junk'"}` : '');
  await target.db
    .query(
      `CREATE account:1 SET meta = { label: 'a'${stored(1)} }; CREATE account:2 SET meta = { label: 'b' }; CREATE account:3 SET meta = { label: 'c'${stored(3)} }`,
    )
    .collect();
  await writeFile(join(dir, 'app/schema.cerial'), AFTER(flex));

  return { dir, ...target };
}

const balances = async (db: Surreal): Promise<unknown[]> =>
  (await db.query('SELECT meta.balance AS b FROM account ORDER BY id').collect<[Array<{ b: unknown }>]>())[0].map(
    (r) => r.b,
  );

describe('a defaulted key declared under a flexible object over stored rows', () => {
  test('the plan file shows a cast with the default as fallback, under the data-loss treatment', async () => {
    const { dir, name } = await seeded('plan', true);

    const result = await migratePlan({ argv: ['--out', join(dir, 'plans')], env: envFor(name), cwd: dir });

    expect(result.exitCode).toBe(0);
    const text = await readFile(result.files[0]!, 'utf8');
    expect(text).toContain('USING <int>$value FALLBACK 0');
    expect(text).toContain('data-loss');
  });

  test('without a flag the apply is refused naming both flags and every row is intact', async () => {
    const { dir, db, name } = await seeded('refuse', true);

    const result = await run(dir, name, ['--from-schema']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--allow-destructive and --allow-data-loss');
    expect(await balances(db)).toEqual([4200, undefined, 'junk']);
  });

  test('with --allow-destructive alone it is still refused and rows are intact', async () => {
    const { dir, db, name } = await seeded('half', true);

    const result = await run(dir, name, ['--from-schema', '--allow-destructive']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--allow-data-loss');
    expect(await balances(db)).toEqual([4200, undefined, 'junk']);
  });

  test('with both flags a stored 4200 is kept and rows without a usable value get the default', async () => {
    const { dir, db, name } = await seeded('both', true);

    const result = await run(dir, name, ['--from-schema', '--allow-destructive', '--allow-data-loss']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await balances(db)).toEqual([4200, 0, 0]);
  });

  test('a strict object keeps its additive class: no flag, rows without the key get the default', async () => {
    const { dir, db, name } = await seeded('strict', false);

    const result = await run(dir, name, ['--from-schema']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await balances(db)).toEqual([0, 0, 0]);
  });
});

describe('a flexible object that is made strict in the same change', () => {
  const stricten = async (label: string) => {
    const seed = await seeded(label, true);
    await writeFile(join(seed.dir, 'app/schema.cerial'), AFTER(false));

    return seed;
  };

  test('without flags the apply is refused and the stored values are intact', async () => {
    const { dir, db, name } = await stricten('dropref');

    const result = await run(dir, name, ['--from-schema']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--allow-destructive and --allow-data-loss');
    expect(await balances(db)).toEqual([4200, undefined, 'junk']);
  });

  test('with both flags the server still refuses to narrow the object, and the rollback keeps every row', async () => {
    const { dir, db, name } = await stricten('dropboth');

    const result = await run(dir, name, ['--from-schema', '--allow-destructive', '--allow-data-loss']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('rolled back');
    expect(await balances(db)).toEqual([4200, undefined, 'junk']);
  });
});

describe('a defaulted string key declared under a flexible object over stored rows', () => {
  const SCHEMA = (key: string) =>
    `object Meta {\n  label String?\n${key}}\n\nmodel Account {\n  id Record(int) @id\n  meta Meta @flexible\n}\n`;
  const BASE = SCHEMA('');

  const tagged = async (label: string, key: string) => {
    const dir = await mixedProject({ 'app/schema.cerial': BASE });
    const target = await scratch(label);
    expect((await run(dir, target.name, ['--from-schema'])).exitCode).toBe(0);
    await target.db
      .query(
        `CREATE account:1 SET meta = { label: 'a', tag: 'kept' }; CREATE account:2 SET meta = { label: 'b' }; CREATE account:3 SET meta = { label: 'c', tag: NULL }`,
      )
      .collect();
    await writeFile(join(dir, 'app/schema.cerial'), SCHEMA(key));
    const result = await run(dir, target.name, ['--from-schema', '--allow-destructive', '--allow-data-loss']);

    return { ...target, result };
  };

  const tags = async (db: Surreal): Promise<unknown[]> =>
    (await db.query('SELECT meta.tag AS t FROM account ORDER BY id').collect<[Array<{ t: unknown }>]>())[0].map(
      (r) => r.t,
    );

  test('rows without the key or holding null get the default, never the text NONE or NULL', async () => {
    const { db, result } = await tagged('strkey', "  tag String @default('x')\n");

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await tags(db)).toEqual(['kept', 'x', 'x']);
  });

  test('a nullable string key keeps a stored null and fills only the missing key', async () => {
    const { db, result } = await tagged('nullkey', "  tag String @nullable @default('x')\n");

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await tags(db)).toEqual(['kept', 'x', null]);
  });
});
