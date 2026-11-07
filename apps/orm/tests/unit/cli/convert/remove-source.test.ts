import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runCommand } from 'citty';
import { convertCommand } from '../../../../src/cli/commands/convert';
import { removeSources, runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions } from '../../../../src/cli/convert';
import { CerialError } from '../../../../src/errors';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const originalCwd = process.cwd();
const extras: string[] = [];

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-remove-source-')));
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(originalCwd);
  for (const dir of [root, ...extras.splice(0)]) {
    await chmod(dir, 0o755).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

const USER = 'model User {\n  id Record @id\n  name String\n}\n';
const POST = 'model Post {\n  id Record @id\n  title String\n}\n';

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
  return runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, schema: root, removeSource: true, ...options });
}

/** Runs and asserts the run was refused, the tree byte-identical afterwards. */
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

/** Lets the command, which has no import seam, resolve `cerial/schema` from the project. */
async function installCerial(): Promise<void> {
  await mkdir(join(root, 'node_modules/cerial'), { recursive: true });
  await symlink(SCHEMA_MODULE, join(root, 'node_modules/cerial/schema'), 'dir');
}

function config(schemas: Record<string, Record<string, unknown>>): string {
  const withOutput = Object.fromEntries(
    Object.entries(schemas).map(([name, entry]) => [name, { ...entry, output: `./client-${name}` }]),
  );

  return JSON.stringify({ schemas: withOutput });
}

describe('a converted source is removed', () => {
  it('removes every fully converted .cerial file, keeps the output and exits 0', async () => {
    await project({ 'user.cerial': USER, 'sub/post.cerial': POST });

    const result = await convert();

    expect(result.failures).toEqual([]);
    expect(existsSync(join(root, 'user.cerial'))).toBe(false);
    expect(existsSync(join(root, 'sub/post.cerial'))).toBe(false);
    expect(await readFile(join(root, 'user.schema.ts'), 'utf8')).toContain('model(');
    expect(existsSync(join(root, 'sub/post.schema.ts'))).toBe(true);
    expect(result.lines).toContain(`removed ${join(root, 'user.cerial')}`);
    expect(result.lines.join('\n')).not.toContain('left in place');
  });

  it('keeps a comment-only file, which declares nothing, and reports why', async () => {
    const note = '// Notes that exist nowhere else\n';
    await project({ 'user.cerial': USER, 'notes.cerial': note });

    const result = await convert();

    expect(await readFile(join(root, 'notes.cerial'), 'utf8')).toBe(note);
    expect(existsSync(join(root, 'user.cerial'))).toBe(false);
    expect(result.lines.join('\n')).toContain(`kept ${join(root, 'notes.cerial')}: it holds no declaration`);
  });

  it('keeps a file another config entry reads, compared by realpath', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { files: ['./a/user.cerial'] } }),
      'a/user.cerial': USER,
      'a/post.cerial': POST,
    });
    process.chdir(root);

    const result = await convert({ schema: undefined, name: 'a' });

    expect(existsSync(join(root, 'a/user.cerial'))).toBe(true);
    expect(existsSync(join(root, 'a/post.cerial'))).toBe(false);
    expect(result.lines.join('\n')).toContain(`kept ${join(root, 'a/user.cerial')}: another schema entry reads it`);
  });

  it('keeps a file another entry reaches through a symlinked directory', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' } }),
      'a/user.cerial': USER,
    });
    await symlink(join(root, 'a'), join(root, 'b'), 'dir');
    process.chdir(root);

    await convert({ schema: undefined, name: 'a' });

    expect(existsSync(join(root, 'a/user.cerial'))).toBe(true);
    expect(existsSync(join(root, 'a/user.schema.ts'))).toBe(true);
  });
});

describe('nothing is removed unless the output was committed', () => {
  it('a refusal at preflight', async () => {
    await project({ 'user.cerial': USER, 'user.schema.ts': '// mine\n' });

    const error = await refused();

    expect(error.message).toContain('user.schema.ts');
  });

  it('a refused declaration', async () => {
    await project({ 'user.cerial': USER, 'bad.cerial': 'model Broken {\n  id Record @id\n  x Nope\n}\n' });

    await refused();
  });

  it('a source with a parse error', async () => {
    await project({ 'user.cerial': USER, 'bad.cerial': 'model {' });

    await refused();
  });

  it('a gate failure', async () => {
    await project({
      'user.cerial': USER,
      'shim.ts': `import { model as real } from '${SCHEMA_MODULE}';\nexport * from '${SCHEMA_MODULE}';\nexport const model = (name: string, ...rest: unknown[]) => (real as (...a: unknown[]) => unknown)(name + 'Renamed', ...rest);\n`,
    });

    const error = await refused({ schemaImport: join(root, 'shim.ts'), schema: join(root, 'user.cerial') });

    expect(error.message).toContain('do not rebuild the source schema');
  });

  it('a commit that rolled back', async () => {
    await project({ 'user.cerial': USER, 'post.cerial': POST });
    let calls = 0;
    const { rename } = await import('node:fs/promises');

    const error = await refused({
      rename: async (from, to) => {
        if (++calls === 2) throw new Error('disk full');
        await rename(from, to);
      },
    });

    expect(error.message).toContain('disk full');
  });

  it('--dry-run, which prints what it would remove', async () => {
    await project({ 'user.cerial': USER });
    const before = await snapshot(root);

    const result = await convert({ dryRun: true });

    expect(await snapshot(root)).toEqual(before);
    expect(result.lines).toContain(`would remove ${join(root, 'user.cerial')}`);
    expect(result.lines.join('\n')).not.toContain('NOT removed');
  });

  it('a mixed entry refused on a duplicate name leaves no handles file and every source', async () => {
    await project({ 'user.cerial': USER, 'user.schema.ts': '// mine\n', 'dup.schema.ts': '// x\n' });

    await refused();
  });
});

describe('a removal failure', () => {
  it('continues with the other files, names each one not removed and keeps the output', async () => {
    await project({ 'a.cerial': USER, 'b.cerial': POST, 'c.cerial': 'model Tag {\n  id Record @id\n}\n' });
    const stuck = new Set([join(root, 'a.cerial'), join(root, 'c.cerial')]);

    const result = await convert({
      removeFile: async (path) => {
        if (stuck.has(path)) throw new Error('EACCES: permission denied');
        await unlink(path);
      },
    });

    expect([...result.failures].sort()).toEqual([...stuck].sort());
    expect(existsSync(join(root, 'b.cerial'))).toBe(false);
    expect(existsSync(join(root, 'a.cerial'))).toBe(true);
    expect(existsSync(join(root, 'c.cerial'))).toBe(true);
    for (const name of ['a', 'b', 'c']) expect(existsSync(join(root, `${name}.schema.ts`))).toBe(true);
    const lines = result.lines.join('\n');
    expect(lines).toContain(`NOT removed ${join(root, 'a.cerial')}: EACCES`);
    expect(lines).toContain(`NOT removed ${join(root, 'c.cerial')}: EACCES`);
  });

  it('exits 1 through the command and prints the files, with the output in place', async () => {
    if (process.getuid?.() === 0) return;
    await project({ 'src/locked/user.cerial': USER });
    await installCerial();
    const out = join(root, 'out');
    await chmod(join(root, 'src/locked'), 0o555);
    const exit = spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const log = spyOn(console, 'log').mockImplementation(() => undefined);
    const err = spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await runCommand(convertCommand, {
        rawArgs: ['--to', 'ts', '-s', join(root, 'src'), '-o', out, '--remove-source'],
      });
      const printed = log.mock.calls.flat().join('\n');
      expect(err.mock.calls).toEqual([]);

      expect(exit).toHaveBeenCalledWith(1);
      expect(printed).toContain(`NOT removed ${join(root, 'src/locked/user.cerial')}`);
    } finally {
      exit.mockRestore();
      log.mockRestore();
      err.mockRestore();
      await chmod(join(root, 'src/locked'), 0o755);
    }
    expect(existsSync(join(out, 'locked/user.schema.ts'))).toBe(true);
    expect(existsSync(join(root, 'src/locked/user.cerial'))).toBe(true);
  });

  it('exits 0 when every removal worked', async () => {
    await project({ 'user.cerial': USER });
    await installCerial();
    const exit = spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const log = spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runCommand(convertCommand, { rawArgs: ['--to', 'ts', '-s', root, '--remove-source'] });

      expect(exit.mock.calls).toEqual([]);
    } finally {
      exit.mockRestore();
      log.mockRestore();
    }
    expect(existsSync(join(root, 'user.cerial'))).toBe(false);
  });
});

describe('--force', () => {
  it('replaces an existing non-source target, then removes the source', async () => {
    await project({ 'user.cerial': USER, 'user.schema.ts': '// stale output\n' });
    // The stale file is not read by the entry when only the .cerial directory is named
    const result = await convert({ schema: join(root, 'user.cerial'), force: true });

    expect(result.failures).toEqual([]);
    expect(await readFile(join(root, 'user.schema.ts'), 'utf8')).toContain('model(');
    expect(existsSync(join(root, 'user.cerial'))).toBe(false);
  });

  it('without --force the same existing target refuses and the source stays', async () => {
    await project({ 'user.cerial': USER, 'user.schema.ts': '// stale output\n' });

    await refused({ schema: join(root, 'user.cerial') });
  });

  it('a target that is a source of the entry stays refused with both flags', async () => {
    await project({
      'cerial.config.json': config({ main: { path: './main' }, other: { files: ['./main/user.schema.ts'] } }),
      'main/user.cerial': USER,
      'main/user.schema.ts': '// a hand-written module\n',
    });
    process.chdir(root);

    const error = await refused({ schema: undefined, name: 'main', force: true });

    expect(error.message).toContain('is a schema source and is never overwritten');
  });

  it('does not widen removal: a kept comment-only file stays under --force', async () => {
    await project({ 'user.cerial': USER, 'notes.cerial': '// keep me\n' });

    await convert({ force: true });

    expect(existsSync(join(root, 'notes.cerial'))).toBe(true);
  });
});

describe('an input that is also an output', () => {
  const none = { claims: [] };

  it('is never removed, though a file that is only an input still goes', async () => {
    await project({ 'a.cerial': USER, 'b.cerial': POST });
    const removed: string[] = [];

    const report = await removeSources(
      {
        ...none,
        inputs: [join(root, 'a.cerial'), join(root, 'b.cerial')],
        outputs: [
          { source: join(root, 'a.cerial'), target: join(root, 'b.cerial') },
          { source: join(root, 'b.cerial'), target: join(root, 'b.schema.ts') },
        ],
        written: [join(root, 'b.cerial'), join(root, 'b.schema.ts')],
      },
      { remove: async (p) => void removed.push(p) },
    );

    expect(removed).toEqual([join(root, 'a.cerial')]);
    expect(report.kept).toEqual([join(root, 'b.cerial')]);
    expect(await readFile(join(root, 'b.cerial'), 'utf8')).toBe(POST);
  });

  it('is not removed when its converted module was not written', async () => {
    await project({ 'a.cerial': USER });
    const removed: string[] = [];

    const report = await removeSources(
      {
        ...none,
        inputs: [join(root, 'a.cerial')],
        outputs: [{ source: join(root, 'a.cerial'), target: join(root, 'a.schema.ts') }],
        written: [],
      },
      { remove: async (p) => void removed.push(p) },
    );

    expect(removed).toEqual([]);
    expect(report.lines.join('\n')).toContain('its converted module was not written');
  });

  it('a symlinked target resolves to the input and keeps it', async () => {
    await project({ 'a.cerial': USER });
    await symlink(join(root, 'a.cerial'), join(root, 'a.schema.ts'));
    const removed: string[] = [];

    await removeSources(
      {
        ...none,
        inputs: [join(root, 'a.cerial')],
        outputs: [{ source: join(root, 'a.cerial'), target: join(root, 'a.schema.ts') }],
        written: [join(root, 'a.schema.ts')],
      },
      { remove: async (p) => void removed.push(p) },
    );

    expect(removed).toEqual([]);
    expect(await readFile(join(root, 'a.cerial'), 'utf8')).toBe(USER);
  });
});

describe('a file the config names', () => {
  it('is removed and the run prints the config line to change', async () => {
    await project({
      'cerial.config.json': config({ main: { files: ['./user.cerial'] } }),
      'user.cerial': USER,
    });
    process.chdir(root);

    const result = await convert({ schema: undefined });

    expect(existsSync(join(root, 'user.cerial'))).toBe(false);
    const lines = result.lines.join('\n');
    expect(lines).toContain("change 'files' in schema 'main'");
    expect(lines).toContain(join(root, 'user.schema.ts'));
  });

  it('prints no config line for a file only discovery found, or with -s', async () => {
    await project({ 'user.cerial': USER });

    const result = await convert();

    expect(result.lines.join('\n')).not.toContain('change ');
  });

  it('does not follow a symlinked input that resolves outside the folder, and leaves its target alone', async () => {
    const elsewhere = await realpath(await mkdtemp(join(tmpdir(), 'cerial-remove-link-')));
    extras.push(elsewhere);
    await writeFile(join(elsewhere, 'real.cerial'), USER);
    await symlink(join(elsewhere, 'real.cerial'), join(root, 'user.cerial'));
    await writeFile(join(root, 'post.cerial'), POST);

    await convert();

    expect(existsSync(join(root, 'post.schema.ts'))).toBe(true);
    expect(existsSync(join(root, 'user.schema.ts'))).toBe(false);
    expect((await lstat(join(root, 'user.cerial'))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(elsewhere, 'real.cerial'), 'utf8')).toBe(USER);
  });
});

describe('the handles file', () => {
  const KEPT = "import { object, f } from 'cerial/schema';\nexport const Shared = object('Shared', { s: f.int() });\n";

  async function mixed(): Promise<void> {
    await project({ 'user.cerial': 'model User {\n  id Record @id\n  shared Shared\n}\n', 'shared.schema.ts': KEPT });
    await mkdir(join(root, 'node_modules/cerial'), { recursive: true });
    await symlink(SCHEMA_MODULE, join(root, 'node_modules/cerial/schema'), 'dir');
  }

  it('is never counted as a source: only the .cerial file goes, the kept module stays', async () => {
    await mixed();

    const result = await convert();

    expect(existsSync(join(root, 'user.cerial'))).toBe(false);
    expect(existsSync(join(root, 'shared.schema.ts'))).toBe(true);
    expect(result.lines.join('\n')).not.toContain('handles');
  });

  it('a refused run removes the handles file it created and every source stays', async () => {
    await mixed();
    await writeFile(join(root, 'user.schema.ts'), '// mine\n');
    const before = await snapshot(root);

    await convert().then(
      () => undefined,
      () => undefined,
    );

    expect(await snapshot(root)).toEqual(before);
    expect(existsSync(join(root, 'cerial/handles.ts'))).toBe(false);
  });
});

describe('without the flag nothing is deleted', () => {
  it('on success, which prints the next step', async () => {
    await project({ 'user.cerial': USER, 'notes.cerial': '// n\n' });

    const result = await convert({ removeSource: false });

    expect(existsSync(join(root, 'user.cerial'))).toBe(true);
    expect(await readFile(join(root, 'notes.cerial'), 'utf8')).toBe('// n\n');
    expect(result.failures).toEqual([]);
    expect(result.lines.at(-1)).toContain('--remove-source');
    expect(result.lines.at(-1)).toContain(join(root, 'user.cerial'));
  });

  it('never calls the removal seam', async () => {
    await project({ 'user.cerial': USER });
    const calls: string[] = [];

    await convert({ removeSource: false, removeFile: async (p) => void calls.push(p) });

    expect(calls).toEqual([]);
  });

  it('on --dry-run', async () => {
    await project({ 'user.cerial': USER });
    const before = await snapshot(root);

    const result = await convert({ removeSource: false, dryRun: true });

    expect(await snapshot(root)).toEqual(before);
    expect(result.lines.join('\n')).not.toContain('--remove-source');
  });

  it('on a refusal', async () => {
    await project({ 'user.cerial': USER, 'user.schema.ts': '// mine\n' });

    await refused({ removeSource: false });
  });
});
