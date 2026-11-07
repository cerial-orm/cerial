import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions } from '../../../../src/cli/convert';
import { CerialError } from '../../../../src/errors';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const originalCwd = process.cwd();

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-remove-ts-')));
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(root, { recursive: true, force: true });
});

const IMPORT = `import { defineSchema, f, model, object } from '${SCHEMA_MODULE}';\n`;
const mod = (body: string): string => `${IMPORT}${body}\n`;
const USER = mod("export const User = model('User', { id: f.record().id(), name: f.string() });");
const POST = mod("export const Post = model('Post', { id: f.record().id(), title: f.string() });");
const BAD = "f.record('a b')";
const CERIAL_POST = 'model Post {\n  id Record @id\n  title String\n}\n';

const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Hash and mtime of every entry, so a touched or rewritten file shows. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of (await readdir(dir, { recursive: true })).sort()) {
    const info = await lstat(join(dir, name));
    out[name] = info.isFile() ? `${hash(await readFile(join(dir, name)))}@${info.mtimeMs}` : 'dir';
  }

  return out;
}

async function project(files: Record<string, string>): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), text);
  }
}

const convert = (options: ConvertOptions = {}): ReturnType<typeof runConvert> =>
  runConvert({ to: 'cerial', schema: root, removeSource: true, ...options });

/** Asserts the run was refused and every source is byte and mtime identical afterwards. */
async function refused(options: ConvertOptions = {}): Promise<CerialError> {
  const before = await snapshot(root);
  const error = await convert(options).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CerialError);
  expect(await snapshot(root)).toEqual(before);

  return error as CerialError;
}

function config(entry: string): string {
  return JSON.stringify({ schemas: { main: { entry, output: './client-main' } } });
}

const exists = (name: string): boolean => existsSync(join(root, name));

describe('--remove-source with --to cerial', () => {
  it('removes every wholly converted module, keeps the .cerial and warns that comments are gone', async () => {
    await project({ 'user.schema.ts': USER, 'sub/post.schema.ts': POST });

    const result = await convert();

    expect(result.failures).toEqual([]);
    expect(exists('user.schema.ts')).toBe(false);
    expect(exists('sub/post.schema.ts')).toBe(false);
    expect(await readFile(join(root, 'user.cerial'), 'utf8')).toContain('model User {');
    expect(exists('sub/post.cerial')).toBe(true);
    expect(result.lines).toContain(`removed ${join(root, 'user.schema.ts')}`);
    expect(result.lines.join('\n')).not.toContain('left in place');
    expect(result.warnings.some((w) => w.includes('comments') && w.includes('gone'))).toBe(true);
  });

  it('leaves every module in place and prints the next step without the flag', async () => {
    await project({ 'user.schema.ts': USER });

    const result = await convert({ removeSource: false });

    expect(exists('user.schema.ts')).toBe(true);
    expect(result.lines.join('\n')).toContain('left in place');
    expect(result.warnings.some((w) => w.includes('gone'))).toBe(false);
  });
});

describe('nothing is removed unless the output was committed', () => {
  it('a refused construct', async () => {
    await project({
      'user.schema.ts': USER,
      'bad.schema.ts': mod(`export const Bad = model('Bad', { id: f.record().id(), ref: ${BAD} });`),
    });

    const error = await refused();

    expect(error.message).toContain('cannot be converted');
  });

  it('a preflight refusal over an existing target', async () => {
    await project({ 'user.schema.ts': USER, 'user.cerial': '// mine\n' });

    await refused();
  });

  it('a commit that rolled back', async () => {
    await project({ 'user.schema.ts': USER, 'post.schema.ts': POST });
    let calls = 0;

    const error = await refused({
      rename: async (from, to) => {
        if (++calls === 2) throw new Error('disk full');
        await rename(from, to);
      },
    });

    expect(error.message).toContain('disk full');
  });

  it('--dry-run prints what it would remove and touches nothing', async () => {
    await project({ 'user.schema.ts': USER });
    const before = await snapshot(root);

    const result = await convert({ dryRun: true });

    expect(await snapshot(root)).toEqual(before);
    expect(result.lines).toContain(`would remove ${join(root, 'user.schema.ts')}`);
    expect(result.lines.join('\n')).not.toContain('NOT removed');
  });
});

describe('a removal failure', () => {
  it('names the module, keeps the output, removes the rest and reports the failure', async () => {
    await project({ 'user.schema.ts': USER, 'post.schema.ts': POST });
    const stuck = join(root, 'user.schema.ts');

    const result = await convert({
      removeFile: async (path) => {
        if (path === stuck) throw new Error('EACCES: permission denied');
        await unlink(path);
      },
    });

    expect(result.failures).toEqual([stuck]);
    expect(exists('user.schema.ts')).toBe(true);
    expect(exists('post.schema.ts')).toBe(false);
    expect(exists('user.cerial')).toBe(true);
    expect(exists('post.cerial')).toBe(true);
    expect(result.lines.join('\n')).toContain(`NOT removed ${stuck}: EACCES`);
  });
});

describe('a module with no converted declaration', () => {
  it('keeps a comment-only module and reports why, while the converted one goes', async () => {
    const note = '// Notes that exist nowhere else\n';
    await project({ 'user.schema.ts': USER, 'notes.ts': note, 'index.ts': `import './notes';\n` });

    const result = await convert({ schema: join(root, 'user.schema.ts') });

    expect(await readFile(join(root, 'notes.ts'), 'utf8')).toBe(note);
    expect(exists('user.schema.ts')).toBe(false);
    expect(result.lines.join('\n')).not.toContain(`removed ${join(root, 'notes.ts')}`);
  });

  it('keeps a .cerial file of a mixed entry, even one holding only a comment', async () => {
    const note = '// only a comment\n';
    await project({ 'user.schema.ts': USER, 'notes.cerial': note });

    await convert();

    expect(exists('user.schema.ts')).toBe(false);
    expect(await readFile(join(root, 'notes.cerial'), 'utf8')).toBe(note);
  });
});

describe('a module with more than declarations', () => {
  it('is kept and reported, and a plain module beside it is removed', async () => {
    await project({
      'user.schema.ts': mod(
        "export const User = model('User', { id: f.record().id(), name: f.string() });\nexport function describeUser() {\n  return 'user';\n}",
      ),
      'post.schema.ts': POST,
    });

    const result = await convert();

    expect(exists('user.schema.ts')).toBe(true);
    expect(exists('post.schema.ts')).toBe(false);
    expect(result.lines.join('\n')).toContain(
      `kept ${join(root, 'user.schema.ts')}: it holds code other than imports and declarations`,
    );
    expect(result.lines.join('\n')).toContain(`Other exports and code in these modules are not converted`);
  });
});

describe('the modules a kept module imports', () => {
  it('keeps a module that a kept module imports', async () => {
    await project({
      'user.schema.ts': USER,
      'post.schema.ts': mod(
        "import { User } from './user.schema';\nexport const Post = model('Post', { id: f.record().id(), author: f.relation(() => User) });\nexport function helper() {\n  return 1;\n}",
      ),
    });

    const result = await convert();

    expect(exists('post.schema.ts')).toBe(true);
    expect(exists('user.schema.ts')).toBe(true);
    expect(result.lines.join('\n')).toContain(`kept ${join(root, 'user.schema.ts')}: ${join(root, 'post.schema.ts')}`);
  });

  it('removes a pure entry module with the modules it imports and prints the config line to change', async () => {
    await project({
      'cerial.config.json': config('./schema/index.ts'),
      'schema/user.schema.ts': USER,
      'schema/index.ts': mod("import { User } from './user.schema';\nexport default defineSchema({ models: [User] });"),
    });
    process.chdir(root);

    const result = await convert({ schema: undefined });

    expect(exists('schema/user.schema.ts')).toBe(false);
    expect(exists('schema/index.ts')).toBe(false);
    expect(exists('schema/user.cerial')).toBe(true);
    expect(result.lines.join('\n')).toContain("change 'entry' in schema 'main'");
  });

  it('keeps a pure entry module, and what it imports, while it imports a module that survives', async () => {
    await project({
      'cerial.config.json': config('./schema/index.ts'),
      'schema/user.schema.ts': USER,
      'schema/shared.ts': 'export const shared = 1;\n',
      'schema/index.ts': mod(
        "import { User } from './user.schema';\nimport './shared';\nexport default defineSchema({ models: [User] });",
      ),
    });
    process.chdir(root);

    const result = await convert({ schema: undefined });

    expect(exists('schema/index.ts')).toBe(true);
    expect(exists('schema/user.schema.ts')).toBe(true);
    expect(exists('schema/shared.ts')).toBe(true);
    expect(result.lines.join('\n')).toContain(`kept ${join(root, 'schema/index.ts')}: a module it imports stays`);
  });

  it('removes a chain of two barrels once everything below them is removed', async () => {
    await project({
      'cerial.config.json': config('./schema/zz-index.ts'),
      'schema/user.schema.ts': USER,
      'schema/post.schema.ts': POST,
      // Sorted after the declaring modules, which is where a re-exported declaration takes its origin
      'schema/zz-models.ts': "export * from './user.schema';\nexport * from './post.schema';\n",
      'schema/zz-index.ts': mod(
        "import { User, Post } from './zz-models';\nexport default defineSchema({ models: [User, Post] });",
      ),
    });
    process.chdir(root);

    await convert({ schema: undefined });

    for (const name of ['user.schema.ts', 'post.schema.ts', 'zz-models.ts', 'zz-index.ts'])
      expect(exists(`schema/${name}`)).toBe(false);
    expect(exists('schema/user.cerial')).toBe(true);
    expect(exists('schema/post.cerial')).toBe(true);
  });

  it('keeps both barrels when the lower one imports a module that stays', async () => {
    await project({
      'cerial.config.json': config('./schema/zz-index.ts'),
      'schema/user.schema.ts': USER,
      'schema/helper.ts': 'export const helper = 1;\n',
      'schema/zz-models.ts': "export * from './user.schema';\nexport * from './helper';\n",
      'schema/zz-index.ts': mod(
        "import { User } from './zz-models';\nexport default defineSchema({ models: [User] });",
      ),
    });
    process.chdir(root);

    await convert({ schema: undefined });

    for (const name of ['user.schema.ts', 'helper.ts', 'zz-models.ts', 'zz-index.ts'])
      expect(exists(`schema/${name}`)).toBe(true);
  });
});

describe('a mixed entry', () => {
  it('removes only the TypeScript module and leaves the .cerial file byte-identical', async () => {
    await project({ 'user.schema.ts': USER, 'post.cerial': CERIAL_POST });
    const post = await snapshot(root);

    await convert();

    expect(exists('user.schema.ts')).toBe(false);
    expect((await snapshot(root))['post.cerial']).toBe(post['post.cerial']);
  });

  it('--to ts over the same entry removes only the .cerial file', async () => {
    await project({
      'meta.schema.ts': mod("export const Meta = object('Meta', { tag: f.string() });"),
      'post.cerial': 'model Post {\n  id Record @id\n  meta Meta\n}\n',
    });
    const meta = (await snapshot(root))['meta.schema.ts'];

    await convert({ to: 'ts', schemaImport: SCHEMA_MODULE });

    expect(exists('post.cerial')).toBe(false);
    expect(exists('post.schema.ts')).toBe(true);
    expect((await snapshot(root))['meta.schema.ts']).toBe(meta);
  });
});
