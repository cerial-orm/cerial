import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runConvert } from '../../../../src/cli/convert';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const USER = 'model User {\n  id Record @id\n  name String\n}\n';
const DEP = 'model Dep {\n  id Record @id\n}\n';

let base: string;
let root: string;
const originalCwd = process.cwd();

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'cerial-convert-confine-')));
  root = join(base, 'project');
  await mkdir(root);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(base, { recursive: true, force: true });
});

async function put(files: Record<string, string>, at: string = root): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(at, name)), { recursive: true });
    await writeFile(join(at, name), text);
  }
}

describe('convert stays inside the project root', () => {
  it('neither converts nor deletes a dependency .cerial under node_modules', async () => {
    await put({ 'user.cerial': USER, 'node_modules/dep/dep.cerial': DEP });
    process.chdir(root);

    await runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, schema: root, removeSource: true });

    expect(existsSync(join(root, 'user.schema.ts'))).toBe(true);
    expect(existsSync(join(root, 'user.cerial'))).toBe(false);
    expect(await readFile(join(root, 'node_modules/dep/dep.cerial'), 'utf-8')).toBe(DEP);
    expect(existsSync(join(root, 'node_modules/dep/dep.schema.ts'))).toBe(false);
  });

  it('refuses to write or delete through a symlinked folder that leaves the root, naming it', async () => {
    await put({ 'a.cerial': USER }, join(base, 'outside'));
    await symlink(join(base, 'outside'), join(root, 'linked'), 'dir');
    await put({
      'cerial.config.json': JSON.stringify({ schemas: { main: { path: './linked', output: './client' } } }),
    });
    process.chdir(root);

    const error = await runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, removeSource: true }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toContain('outside the project root');
    expect(error?.message).toContain(join(root, 'linked'));
    expect(await readFile(join(base, 'outside/a.cerial'), 'utf-8')).toBe(USER);
    expect(existsSync(join(base, 'outside/a.schema.ts'))).toBe(false);
  });

  it('still converts a folder that sits inside the root', async () => {
    await put({ 'schemas/a.cerial': USER });
    process.chdir(root);

    await runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, schema: join(root, 'schemas'), removeSource: true });

    expect(existsSync(join(root, 'schemas/a.schema.ts'))).toBe(true);
    expect(existsSync(join(root, 'schemas/a.cerial'))).toBe(false);
  });

  it('refuses a config file outside the root under --remove-source, and leaves it intact', async () => {
    await put({ 'outside.cerial': USER }, base);
    await put({
      'cerial.config.json': JSON.stringify({ schemas: { main: { files: ['../outside.cerial'], output: './client' } } }),
    });
    process.chdir(root);

    const error = await runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, removeSource: true }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toContain('outside the project root');
    expect(error?.message).toContain(join(base, 'outside.cerial'));
    expect(await readFile(join(base, 'outside.cerial'), 'utf-8')).toBe(USER);
    expect(existsSync(join(base, 'outside.schema.ts'))).toBe(false);
  });

  it('refuses -s outside the root and writes nothing there', async () => {
    await put({ 'other/a.cerial': USER }, base);
    process.chdir(root);

    const error = await runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, schema: join(base, 'other') }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toContain('outside the project root');
    expect(existsSync(join(base, 'other/a.schema.ts'))).toBe(false);
  });
});
