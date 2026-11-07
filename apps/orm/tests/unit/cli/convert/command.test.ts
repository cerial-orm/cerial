import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions } from '../../../../src/cli/convert';
import { CerialError, CerialGenerationError, CerialValidationError } from '../../../../src/errors';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const EXTENDS_ORDER = resolve(import.meta.dir, '../../../fixtures/convert/extends-order');
const originalCwd = process.cwd();

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-convert-cmd-')));
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(root, { recursive: true, force: true });
  for (const dir of extras.splice(0)) await rm(dir, { recursive: true, force: true });
});

const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Hash and mtime of every entry, so a touched or rewritten file shows. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of (await readdir(dir, { recursive: true })).sort()) {
    const info = await lstat(join(dir, name));
    out[name] = info.isFile()
      ? `${hash(await readFile(join(dir, name)))}@${info.mtimeMs}`
      : info.isDirectory()
        ? 'dir'
        : 'link';
  }

  return out;
}

async function project(files: Record<string, string>): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), text);
  }
}

function convert(options: ConvertOptions = {}): ReturnType<typeof runConvert> {
  return runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, schema: root, ...options });
}

/** Runs and asserts the run was refused with a Cerial error, the tree untouched. */
async function refused(options: ConvertOptions, dir = root): Promise<CerialError> {
  const before = await snapshot(dir);
  const error = await convert(options).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CerialError);
  expect(await snapshot(dir)).toEqual(before);

  return error as CerialError;
}

/** A config whose schemas each get an output of their own, which the validator requires. */
function config(schemas: Record<string, Record<string, unknown>>): string {
  const withOutput = Object.fromEntries(
    Object.entries(schemas).map(([name, entry]) => [name, { ...entry, output: `./client-${name}` }]),
  );

  return JSON.stringify({ schemas: withOutput });
}

const extras: string[] = [];

/** A directory beside the project, inside a project that installs cerial so no warning is raised. */
async function outside(files: Record<string, string>): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-convert-out-')));
  extras.push(dir);
  await mkdir(join(dir, 'node_modules/cerial'), { recursive: true });
  const out = join(dir, 'out');
  await mkdir(out);
  for (const [name, text] of Object.entries(files)) await writeFile(join(out, name), text);

  return out;
}

const USER = 'model User {\n  id Record @id\n  name String\n}\n';

describe('flag validation, before anything is read', () => {
  it('refuses a missing --to naming the flag and the choices', async () => {
    const error = await refused({ to: undefined, schema: join(root, 'does-not-exist') });

    expect(error).toBeInstanceOf(CerialValidationError);
    expect(error.message).toContain('--to is required');
    expect(error.message).toContain('ts');
  });

  it('refuses a blank and an unknown --to', async () => {
    expect((await refused({ to: '  ' })).message).toContain('--to');
    const unknown = await refused({ to: 'yaml', schema: join(root, 'does-not-exist') });

    expect(unknown).toBeInstanceOf(CerialValidationError);
    expect(unknown.message).toContain("--to 'yaml'");
  });

  it('refuses a blank -n, -o, -s and -C naming the flag', async () => {
    await project({ 'user.cerial': USER });

    expect((await refused({ name: '' })).message).toContain('-n');
    expect((await refused({ output: ' ' })).message).toContain('-o');
    expect((await refused({ schema: '' })).message).toContain('-s');
    expect((await refused({ config: '' })).message).toContain('-C');
  });

  it('refuses an -o that is a file', async () => {
    await project({ 'user.cerial': USER, 'out.txt': 'file' });

    const error = await refused({ output: join(root, 'out.txt') });

    expect(error).toBeInstanceOf(CerialValidationError);
    expect(error.message).toContain('-o');
  });

  it('refuses an unknown -n, naming the schemas there are', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' } }),
      'a/user.cerial': USER,
      'b/post.cerial': 'model Post {\n  id Record @id\n}\n',
    });
    process.chdir(root);

    const error = await refused({ schema: undefined, name: 'nope' });

    expect(error.message).toContain("-n 'nope'");
    expect(error.message).toContain('a, b');
  });
});

describe('refusals write nothing', () => {
  it('a source that does not parse names its file and line', async () => {
    await project({ 'good.cerial': USER, 'bad.cerial': 'model Bad {\n  id Record @id\n  x Wat\n' });

    const error = await refused({});

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect(error.message).toContain('bad.cerial:');
  });

  it('a source that fails extends validation is refused', async () => {
    await project({ 'a.cerial': 'object Child extends Missing {\n  c Int\n}\n' });

    const error = await refused({});

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect(error.message).toContain('Missing');
  });

  it('an extends cycle across modules names the declaration and module', async () => {
    await project({
      'a.cerial': await readFile(join(EXTENDS_ORDER, 'cycle/a.cerial'), 'utf8'),
      'b.cerial': await readFile(join(EXTENDS_ORDER, 'cycle/b.cerial'), 'utf8'),
    });

    const error = await refused({});

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect(error.message).toContain('extends-cross-file-cycle');
    expect(error.message).toMatch(/Child|Other/);
    expect(error.message).toMatch(/[ab]\.schema\.ts/);
  });

  it('an emitter difference found by the gate names the declaration and writes nothing', async () => {
    await project({
      'user.cerial': USER,
      // Renames every model it builds, so the rebuilt schema differs from the source
      'shim.ts': `import { model as real } from '${SCHEMA_MODULE}';\nexport * from '${SCHEMA_MODULE}';\nexport const model = (name: string, ...rest: unknown[]) => (real as (...a: unknown[]) => unknown)(name + 'Renamed', ...rest);\n`,
    });

    const error = await refused({ schemaImport: join(root, 'shim.ts'), schema: join(root, 'user.cerial') });

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect(error.message).toContain('do not rebuild the source schema');
    expect(error.message).toContain('User');
  });

  it('an entry with no sources is refused, not a silent success', async () => {
    await mkdir(join(root, 'empty'));

    const error = await refused({ schema: join(root, 'empty') });

    expect(error).toBeInstanceOf(CerialError);
  });

  it('an existing target outside the entry is refused without --force and left untouched', async () => {
    await project({ 'user.cerial': USER });
    const out = await outside({ 'user.schema.ts': '// mine\n' });

    const error = await refused({ output: out }, out);

    expect(error.message).toContain('already exists');
  });

  it('an existing target beside the source is itself a schema source and is refused', async () => {
    await project({ 'user.cerial': USER, 'user.schema.ts': '// mine\n' });

    const error = await refused({});

    expect(error.message).toContain('is a schema source and is never overwritten');
  });

  it('a source is never replaced, with or without --force', async () => {
    await project({
      'main/user.cerial': USER,
      'main/user.schema.ts': '// a hand-written module\n',
      'cerial.config.json': config({ main: { path: './main' }, other: { files: ['./main/user.schema.ts'] } }),
    });
    process.chdir(root);

    const error = await refused({ schema: undefined, name: 'main', force: true });

    expect(error.message).toContain('is a schema source and is never overwritten');
  });

  it('a symlinked target is refused under --force', async () => {
    await project({ 'user.cerial': USER, 'elsewhere.ts': '// elsewhere\n' });
    await symlink(join(root, 'elsewhere.ts'), join(root, 'user.schema.ts'));

    const error = await refused({ force: true });

    expect(error.message).toContain('symbolic link');
  });

  it('a refusal in the second schema leaves the first unwritten', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' } }),
      'a/user.cerial': USER,
      'b/post.cerial': 'model Post {\n  id Record @id\n}\n',
      'b/post.schema.ts': '// mine\n',
    });
    process.chdir(root);

    const error = await refused({ schema: undefined });

    expect(error.message).toContain('post.schema.ts');
  });

  it('a commit failure on the second of two schemas rolls the first back', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' } }),
      'a/user.cerial': USER,
      'b/post.cerial': 'model Post {\n  id Record @id\n}\n',
    });
    process.chdir(root);
    let calls = 0;

    const error = await refused({
      schema: undefined,
      rename: async (from, to) => {
        if (++calls === 2) throw new Error('disk full');
        const { rename } = await import('node:fs/promises');
        await rename(from, to);
      },
    });

    expect(error.message).toContain('disk full');
    expect((await readdir(root, { recursive: true })).filter((n) => n.endsWith('.schema.ts'))).toEqual([]);
  });
});

describe('a clean run', () => {
  it('writes beside the sources, leaves them untouched and prints the next step', async () => {
    await project({ 'user.cerial': USER });
    const source = await snapshot(root);

    const result = await convert();

    expect(result.dryRun).toBe(false);
    expect(result.written).toEqual([join(root, 'user.schema.ts')]);
    expect(await readFile(join(root, 'user.schema.ts'), 'utf8')).toContain('model(');
    expect((await snapshot(root))['user.cerial']).toBe(source['user.cerial']);
    expect(result.lines[0]).toContain('user.cerial');
    expect(result.lines.at(-1)).toContain('left in place');
    expect((await readdir(root)).filter((n) => n.startsWith('.cerial-convert-'))).toEqual([]);
  });

  it('--dry-run lists the files and writes nothing', async () => {
    await project({ 'user.cerial': USER });
    const before = await snapshot(root);

    const result = await convert({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.written).toEqual([]);
    expect(result.lines[0]).toContain('would write');
    expect(await snapshot(root)).toEqual(before);
  });

  it('--force replaces an existing non-source file', async () => {
    await project({ 'user.cerial': USER });
    const out = await outside({ 'user.schema.ts': '// old\n' });

    await convert({ output: out, force: true });

    expect(await readFile(join(out, 'user.schema.ts'), 'utf8')).toContain('model(');
  });

  it('-o mirrors the layout under the output directory', async () => {
    await project({ 'sub/user.cerial': USER, 'node_modules/cerial/package.json': '{}' });

    const result = await convert({ output: join(root, 'out') });

    expect(result.written).toEqual([join(root, 'out/sub/user.schema.ts')]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps comments in the output', async () => {
    await project({ 'user.cerial': `// who signs in\n${USER}` });

    await convert();

    expect(await readFile(join(root, 'user.schema.ts'), 'utf8')).toContain('who signs in');
  });

  it('warns once when -o is outside any project and still writes', async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'cerial-convert-out-')));
    try {
      await project({ 'user.cerial': USER });

      const result = await convert({ output: join(outside, 'o') });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('cerial/schema');
      expect(await readFile(join(outside, 'o/user.schema.ts'), 'utf8')).toContain('model(');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('converts a layout of several files with an extends across them', async () => {
    await project({
      'a.cerial': 'object Base {\n  b Int\n}\n',
      'b.cerial': 'object Child extends Base {\n  c Int\n}\n',
    });

    const result = await convert();

    expect(result.written).toHaveLength(2);
  });
});

describe('discovery and filters', () => {
  it('does not convert a .cerialignore d file', async () => {
    await project({
      'user.cerial': USER,
      'skip.cerial': 'model Skip {\n  id Record @id\n}\n',
      '.cerialignore': 'skip.cerial\n',
    });
    process.chdir(root);

    const result = await convert();

    expect(result.written).toEqual([join(root, 'user.schema.ts')]);
    expect(await lstat(join(root, 'skip.schema.ts')).catch(() => undefined)).toBeUndefined();
  });

  it('-n converts one schema and the other stays unwritten', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' } }),
      'a/user.cerial': USER,
      'b/post.cerial': 'model Post {\n  id Record @id\n}\n',
    });
    process.chdir(root);

    const result = await convert({ schema: undefined, name: 'b' });

    expect(result.written).toEqual([join(root, 'b/post.schema.ts')]);
    expect(await lstat(join(root, 'a/user.schema.ts')).catch(() => undefined)).toBeUndefined();
  });

  it('two schemas commit together', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' } }),
      'a/user.cerial': USER,
      'b/post.cerial': 'model Post {\n  id Record @id\n}\n',
    });
    process.chdir(root);

    const result = await convert({ schema: undefined });

    expect([...result.written].sort()).toEqual([join(root, 'a/user.schema.ts'), join(root, 'b/post.schema.ts')]);
  });

  it('-n protects the sources of the other entries: a target another entry lists is refused', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' }, c: { files: ['./a/user.schema.ts'] } }),
      'a/user.cerial': USER,
      'a/user.schema.ts': '// listed by c\n',
      'b/post.cerial': 'model Post {\n  id Record @id\n}\n',
    });
    process.chdir(root);

    const error = await refused({ schema: undefined, name: 'a', force: true });

    expect(error.message).toContain('is a schema source and is never overwritten');
  });
});

describe('a kept TypeScript module', () => {
  const KEPT = "import { object, f } from 'cerial/schema';\nexport const Shared = object('Shared', { s: f.int() });\n";
  const USES = 'model User {\n  id Record @id\n  shared Shared\n}\n';

  async function mixed(): Promise<void> {
    await project({ 'user.cerial': USES, 'shared.schema.ts': KEPT });
    await mkdir(join(root, 'node_modules/cerial'), { recursive: true });
    await symlink(SCHEMA_MODULE, join(root, 'node_modules/cerial/schema'), 'dir');
  }

  it('verifies a staged module that imports it through the symlink', async () => {
    await mixed();

    const result = await convert();

    expect(result.written).toEqual([join(root, 'user.schema.ts')]);
    expect(await readFile(join(root, 'user.schema.ts'), 'utf8')).toContain('./shared.schema');
  });

  it('refuses an -o outside the entry, naming the cause, and writes nothing', async () => {
    await mixed();
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'cerial-convert-out-')));
    try {
      const error = await refused({ output: join(outside, 'o') });

      expect(error.message).toContain('-o is outside the entry');
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
