/**
 * The CLI spawned as a process: exit codes, stdout and stderr, and the files left on disk.
 * The in-process tests call the command functions and cannot see any of this.
 *
 * Needs no database. Runs this tree's `bin/cerial.ts`, not a globally resolved binary.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../../bin/cerial.ts');

const USER_MODEL = 'model User {\n  id Record @id\n  name String\n}\n';
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

async function makeDir(schemaFiles: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-cli-subprocess-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(schemaFiles)) {
    await Bun.write(join(dir, 'schemas', name), content);
  }

  return dir;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(cwd: string, ...args: string[]): Promise<CliResult> {
  const proc = Bun.spawn(['bun', CLI, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { code, stdout: stdout.replace(ANSI, ''), stderr: stderr.replace(ANSI, '') };
}

describe('cerial generate (subprocess)', () => {
  it('exits 0, reports success and writes the client files', async () => {
    const dir = await makeDir({ 'user.cerial': USER_MODEL });

    const result = await runCli(dir, 'generate', '-s', 'schemas', '-o', 'out');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Found 1 model(s)');
    expect(result.stdout).toContain('Generated 7 files');
    for (const file of ['client.ts', 'index.ts', 'models/user.ts', 'internal/model-registry.ts']) {
      expect(existsSync(join(dir, 'out', file))).toBe(true);
    }
  });

  it('exits non-zero naming the problem for a schema that fails validation, and writes nothing', async () => {
    const dir = await makeDir({ 'a.cerial': USER_MODEL, 'b.cerial': USER_MODEL });

    const result = await runCli(dir, 'generate', '-s', 'schemas', '-o', 'out');

    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Duplicate model name: User');
    expect(existsSync(join(dir, 'out', 'client.ts'))).toBe(false);
  });
});

describe('cerial format --check (subprocess)', () => {
  it('exits 0 on a file the formatter has already written', async () => {
    const dir = await makeDir({ 'user.cerial': 'model   User{\nid Record @id\n  name    String\n}' });
    const write = await runCli(dir, 'format', '-s', 'schemas');
    expect(write.code).toBe(0);

    const result = await runCli(dir, 'format', '--check', '-s', 'schemas');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('All files are formatted');
  });

  it('exits non-zero on an unformatted file, says so, and leaves the file untouched', async () => {
    const messy = 'model   User{\nid Record @id\n  name    String\n}';
    const dir = await makeDir({ 'user.cerial': messy });

    const result = await runCli(dir, 'format', '--check', '-s', 'schemas');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('1 file needs formatting');
    expect(await readFile(join(dir, 'schemas', 'user.cerial'), 'utf8')).toBe(messy);
  });
});

describe('cerial init --yes (subprocess)', () => {
  it('exits 0 and scaffolds a config that parses and points at the detected schema folder', async () => {
    const dir = await makeDir({ 'user.cerial': USER_MODEL });

    const result = await runCli(dir, 'init', '--yes');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Created cerial.config.ts');
    const source = await readFile(join(dir, 'cerial.config.ts'), 'utf8');
    // Transpiling throws on a syntax error, so this proves the file parses
    const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
    expect(js).toContain('defineConfig');
    expect(js).toContain('schema: "./schemas"');
  });

  it('exits non-zero with a message when a config already exists, keeping the old file', async () => {
    const dir = await makeDir({ 'user.cerial': USER_MODEL });
    await writeFile(join(dir, 'cerial.config.json'), '{}', 'utf8');

    const result = await runCli(dir, 'init', '--yes');

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('A config file already exists: cerial.config.json');
    expect(existsSync(join(dir, 'cerial.config.ts'))).toBe(false);
  });
});
