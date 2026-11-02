/**
 * `cerial migrate` spawned as a process: help text, exit codes, and what reaches stdout and stderr.
 * The in-process tests call the command functions and cannot see any of this.
 *
 * Needs SurrealDB on 127.0.0.1:8000 for the exit-code cases; each runs in a scratch database of its own.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Surreal } from 'surrealdb';
import { migrateCommand } from '../../../src/cli/commands/migrate';

const CLI = resolve(import.meta.dir, '../../../bin/cerial.ts');
const ARGS_SOURCE = resolve(import.meta.dir, '../../../src/cli/migrate/args.ts');
const URL = 'http://127.0.0.1:8000';
const UNREACHABLE = 'http://127.0.0.1:1';
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const SUBCOMMANDS = ['status', 'plan', 'apply', 'baseline'] as const;

const NOTE = 'model Note {\n  id Record(int) @id\n  title String\n}\n';
const NOTE_PLUS_EXTRA = `${NOTE}\nmodel Extra {\n  id Record(int) @id\n  label String\n}\n`;

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const fn of cleanups.reverse()) await fn().catch(() => {});
});

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(cwd: string, env: Record<string, string>, ...args: string[]): Promise<CliResult> {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CERIAL_DB_')));
  const proc = Bun.spawn(['bun', CLI, ...args], { cwd, env: { ...clean, ...env }, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { code, stdout: stdout.replace(ANSI, ''), stderr: stderr.replace(ANSI, '') };
}

async function project(schema: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-migrate-subprocess-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await Bun.write(join(dir, 'schemas', 'schema.cerial'), schema);

  return dir;
}

async function scratch(label: string): Promise<{ db: Surreal; env: Record<string, string> }> {
  const name = `subproc_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  cleanups.push(async () => {
    await db.use({ namespace: 'main' });
    await db.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
    await db.close();
  });

  return {
    db,
    env: {
      CERIAL_DB_URL: URL,
      CERIAL_DB_NAMESPACE: 'main',
      CERIAL_DB_DATABASE: name,
      CERIAL_DB_USERNAME: 'root',
      CERIAL_DB_PASSWORD: 'root',
    },
  };
}

/** Flags a subcommand registers, as citty prints them: `--name` and any `-X` alias */
function registeredFlags(command: string): string[] {
  const sub = (
    migrateCommand.subCommands as Record<string, { args?: Record<string, { type: string; alias?: string }> }>
  )[command];

  return Object.entries(sub?.args ?? {})
    .filter(([, def]) => def.type !== 'positional')
    .flatMap(([flag, def]) => [`--${flag}`, ...(def.alias ? [`-${def.alias}`] : [])]);
}

describe('cerial migrate --help (subprocess)', () => {
  it('lists status, plan, apply and baseline', async () => {
    const result = await runCli(tmpdir(), {}, 'migrate', '--help');

    expect(result.code).toBe(0);
    for (const sub of SUBCOMMANDS) expect(result.stdout).toMatch(new RegExp(`^\\s*${sub}\\s`, 'm'));
  });

  for (const sub of SUBCOMMANDS) {
    it(`migrate ${sub} --help lists every flag the subcommand registers`, async () => {
      const result = await runCli(tmpdir(), {}, 'migrate', sub, '--help');

      expect(result.code).toBe(0);
      expect(registeredFlags(sub).length).toBeGreaterThan(0);
      for (const flag of registeredFlags(sub)) expect(result.stdout).toContain(flag);
    });
  }

  it('documents every flag the argument parser accepts in some subcommand help', async () => {
    const source = await readFile(ARGS_SOURCE, 'utf8');
    const schema = source.slice(source.indexOf('v.object({'), source.indexOf('});', source.indexOf('v.object({')));
    const accepted = [...schema.matchAll(/^\s*'?([a-z-]+)'?: v\.optional/gm)].map((m) => `--${m[1]}`);
    const helps = (await Promise.all(SUBCOMMANDS.map((sub) => runCli(tmpdir(), {}, 'migrate', sub, '--help')))).map(
      (r) => r.stdout,
    );

    expect(accepted.length).toBeGreaterThanOrEqual(12);
    for (const flag of accepted) expect(helps.some((text) => text.includes(flag))).toBe(true);
  });

  it('never mentions the password as a flag', async () => {
    for (const sub of SUBCOMMANDS) {
      const result = await runCli(tmpdir(), {}, 'migrate', sub, '--help');

      expect(result.stdout).not.toContain('--password');
    }
  });
});

describe('cerial migrate offers no down or rollback (subprocess)', () => {
  it('migrate down is an unknown command that exits 2', async () => {
    const result = await runCli(tmpdir(), {}, 'migrate', 'down');

    expect(result.code).toBe(2);
    expect(result.stdout + result.stderr).toContain('Unknown command');
  });

  it('migrate rollback is an unknown command that exits 2', async () => {
    const result = await runCli(tmpdir(), {}, 'migrate', 'rollback');

    expect(result.code).toBe(2);
  });

  it('no help text names down or rollback as a command or flag', async () => {
    const texts = await Promise.all(
      [[], ...SUBCOMMANDS.map((sub) => [sub])].map((sub) => runCli(tmpdir(), {}, 'migrate', ...sub, '--help')),
    );

    for (const result of texts) {
      expect(result.stdout).not.toMatch(/\b(down|rollback)\b/i);
      expect(result.stdout).not.toMatch(/--(down|rollback|revert)\b/);
    }
  });
});

describe('cerial migrate exit codes (subprocess)', () => {
  it('status exits 0 when the database matches the schema', async () => {
    const dir = await project(NOTE);
    const { env } = await scratch('sync');
    const applied = await runCli(dir, env, 'migrate', 'apply', '--from-schema');
    expect(applied.code).toBe(0);

    const result = await runCli(dir, env, 'migrate', 'status');

    expect(result.code).toBe(0);
  });

  it('status exits 1 when the schema holds a model the database lacks', async () => {
    const dir = await project(NOTE);
    const { env } = await scratch('pending');
    expect((await runCli(dir, env, 'migrate', 'apply', '--from-schema')).code).toBe(0);
    await Bun.write(join(dir, 'schemas', 'schema.cerial'), NOTE_PLUS_EXTRA);

    const result = await runCli(dir, env, 'migrate', 'status');

    expect(result.code).toBe(1);
  });

  it('status exits 1 when the live table carries a field the schema does not', async () => {
    const dir = await project(NOTE);
    const { db, env } = await scratch('drift');
    expect((await runCli(dir, env, 'migrate', 'apply', '--from-schema')).code).toBe(0);
    await db.query('DEFINE FIELD stray ON note TYPE string').collect();

    const result = await runCli(dir, env, 'migrate', 'status');

    expect(result.code).toBe(1);
  });

  it('exits 2 for an unknown flag and names it', async () => {
    const dir = await project(NOTE);

    const result = await runCli(dir, {}, 'migrate', 'status', '--bogus');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--bogus');
  });

  it('exits 2 for a malformed url flag', async () => {
    const dir = await project(NOTE);

    const result = await runCli(dir, {}, 'migrate', 'status', '--url', 'nonsense');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--url');
  });

  it('exits 2 when no connection is configured anywhere', async () => {
    const dir = await project(NOTE);

    const result = await runCli(dir, {}, 'migrate', 'status');

    expect(result.code).toBe(2);
  });

  it('exits 2 when the database cannot be reached', async () => {
    const dir = await project(NOTE);

    const result = await runCli(
      dir,
      {},
      'migrate',
      'status',
      '--url',
      UNREACHABLE,
      '--namespace',
      'main',
      '--database',
      'x',
    );

    expect(result.code).toBe(2);
  });
});

describe('cerial migrate keeps credentials out of the output (subprocess)', () => {
  const PASSWORD = 'sentinel-pw-7f3a91c2';
  const USERNAME = 'sentinel-user-5d08be44';
  const unreachable = ['--url', UNREACHABLE, '--namespace', 'main', '--database', 'x'];

  for (const sub of SUBCOMMANDS) {
    it(`${sub} prints neither CERIAL_DB_PASSWORD nor CERIAL_DB_USERNAME when the connection fails`, async () => {
      const dir = await project(NOTE);

      const result = await runCli(
        dir,
        { CERIAL_DB_PASSWORD: PASSWORD, CERIAL_DB_USERNAME: USERNAME },
        'migrate',
        sub,
        ...(sub === 'apply' ? ['--from-schema'] : []),
        ...unreachable,
      );

      expect(result.code).toBe(2);
      expect(result.stdout + result.stderr).not.toContain(PASSWORD);
      expect(result.stdout + result.stderr).not.toContain(USERNAME);
    });
  }

  it('prints the password nowhere when the server rejects the credentials', async () => {
    const dir = await project(NOTE);
    const { env } = await scratch('badauth');

    const result = await runCli(
      dir,
      { ...env, CERIAL_DB_USERNAME: USERNAME, CERIAL_DB_PASSWORD: PASSWORD },
      'migrate',
      'status',
    );

    expect(result.code).toBe(2);
    expect(result.stdout + result.stderr).not.toContain(PASSWORD);
    expect(result.stdout + result.stderr).not.toContain(USERNAME);
  });

  it('prints the password nowhere when only the password is set and the run is refused', async () => {
    const dir = await project(NOTE);

    const result = await runCli(
      dir,
      {
        CERIAL_DB_PASSWORD: PASSWORD,
        CERIAL_DB_URL: UNREACHABLE,
        CERIAL_DB_NAMESPACE: 'main',
        CERIAL_DB_DATABASE: 'x',
      },
      'migrate',
      'status',
    );

    expect(result.code).toBe(2);
    expect(result.stdout + result.stderr).not.toContain(PASSWORD);
  });
});

describe('cerial migrate connection failure output (subprocess)', () => {
  it('prints a one-line message with no stack frames and exits non-zero', async () => {
    const dir = await project(NOTE);

    const result = await runCli(
      dir,
      {},
      'migrate',
      'status',
      '--url',
      UNREACHABLE,
      '--namespace',
      'main',
      '--database',
      'x',
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Could not connect');
    expect(result.stdout + result.stderr).not.toMatch(/^\s+at /m);
    expect(result.stdout + result.stderr).not.toContain('CerialConnectionError:');
  });
});

describe('cerial migrate with no subcommand (subprocess)', () => {
  it('prints usage to stderr and exits 2', async () => {
    const result = await runCli(tmpdir(), {}, 'migrate');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('No command specified');
    expect(result.stderr).toContain('status');
  });
});

describe('cerial migrate flag placement (subprocess)', () => {
  it('finds the subcommand after a flag with a value, in either order', async () => {
    const dir = await project(NOTE);
    const { env } = await scratch('order');
    expect((await runCli(dir, env, 'migrate', 'apply', '--from-schema')).code).toBe(0);

    const after = await runCli(dir, env, 'migrate', 'status', '--name', 'schemas');
    const before = await runCli(dir, env, 'migrate', '--name', 'schemas', 'status');

    expect(after.code).toBe(0);
    expect(before.code).toBe(0);
    expect(before.stdout).toBe(after.stdout);
    expect(before.stderr).not.toContain('Unknown command');
  });

  it('reads the value of -C and --config before the subcommand as a value', async () => {
    const dir = await project(NOTE);
    const { env } = await scratch('config');
    await Bun.write(join(dir, 'cerial.config.json'), '{ "schema": "./schemas" }\n');
    expect((await runCli(dir, env, 'migrate', 'apply', '--from-schema')).code).toBe(0);

    for (const args of [
      ['migrate', '-C', 'cerial.config.json', 'status'],
      ['migrate', '--config', 'cerial.config.json', 'status'],
      ['migrate', '--config=cerial.config.json', 'status'],
      ['migrate', 'status', '-C', 'cerial.config.json'],
    ]) {
      const result = await runCli(dir, env, ...args);

      expect(result.stderr).not.toContain('Unknown command');
      expect(result.code).toBe(0);
    }
  });

  it('still reports an unknown subcommand after a flag with a value, exit 2', async () => {
    const dir = await project(NOTE);

    const result = await runCli(dir, {}, 'migrate', '--name', 'schemas', 'nonsense');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Unknown command nonsense');
  });

  it('refuses a flag or argument the subcommand does not take, exit 2, without writing', async () => {
    const dir = await project(NOTE);
    const { env } = await scratch('foreign');

    const plan = await runCli(dir, env, 'migrate', 'plan', './out');
    const drift = await runCli(dir, env, 'migrate', 'apply', '--from-schema', '--accept-drift');

    expect(plan.code).toBe(2);
    expect(plan.stderr).toContain('migrate plan takes no arguments');
    expect(drift.code).toBe(2);
    expect(drift.stderr).toContain('migrate apply does not take --accept-drift');
    expect(await Bun.file(join(dir, 'cerial', 'migrations')).exists()).toBe(false);
  });
});
