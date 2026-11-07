import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions } from '../../../../src/cli/convert';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { CerialError } from '../../../../src/errors';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const originalCwd = process.cwd();
const extras: string[] = [];

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-remove-partial-')));
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

async function outDir(files: Record<string, string> = {}): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-remove-partial-out-')));
  extras.push(dir);
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);

  return dir;
}

const toTs = (options: ConvertOptions = {}): ReturnType<typeof runConvert> =>
  runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, schema: root, partial: true, removeSource: true, ...options });
const toCerial = (options: ConvertOptions = {}): ReturnType<typeof runConvert> =>
  runConvert({ to: 'cerial', schema: root, partial: true, removeSource: true, ...options });

/** Asserts the run was refused and every source is byte and mtime identical afterwards. */
async function refused(run: () => Promise<unknown>): Promise<CerialError> {
  const before = await snapshot(root);
  const error = await run().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CerialError);
  expect(await snapshot(root)).toEqual(before);

  return error as CerialError;
}

const exists = (name: string): boolean => existsSync(join(root, name));
const model = (name: string, extra = ''): string => `model ${name} {\n  id Record @id\n${extra}}\n`;

// Parent and Base convert; Child and Other are refused (a cross-file extends cycle); what reaches them is held back
const CYCLE_A = 'object Parent {\n  p Int\n}\n\nobject Child extends Base {\n  c Int\n}\n';
const CYCLE_B = 'object Base {\n  b Int\n}\n\nobject Other extends Parent {\n  o Int\n}\n';
const PROJECT = {
  // one of each outcome: converted (Parent, Solo), refused (Child), held back (Holder)
  'a.cerial': `${CYCLE_A}\n${model('Holder', '  child Child\n  shared Shared\n')}\n${model('Solo')}`,
  // converted (Base) and refused (Other)
  'b.cerial': CYCLE_B,
  // held back (Item) and converted (Extra)
  'c.cerial': `${model('Item', '  child Child\n')}\n${model('Extra')}`,
  // wholly converted
  'd.cerial': model('Tag'),
  // wholly converted, and named by the kept Holder
  'x.cerial': 'object Shared {\n  s Int\n}\n',
};

const reasonOf = (lines: readonly string[], file: string): string | undefined =>
  lines.find((line) => line.startsWith(`kept ${join(root, file)}:`));

describe('--partial --remove-source to ts', () => {
  it('removes a wholly converted source and keeps the output', async () => {
    await project(PROJECT);
    const out = await outDir();

    const result = await toTs({ output: out });

    expect(result.failures).toEqual([]);
    expect(exists('d.cerial')).toBe(false);
    expect(result.lines).toContain(`removed ${join(root, 'd.cerial')}`);
    expect(await readFile(join(out, 'd.schema.ts'), 'utf8')).toContain("model('Tag'");
  });

  it('keeps a file with a refused declaration beside a converted one', async () => {
    await project(PROJECT);

    const result = await toTs({ output: await outDir() });

    expect(exists('b.cerial')).toBe(true);
    expect(reasonOf(result.lines, 'b.cerial')).toContain('refused or held back');
  });

  it('keeps a file with a held-back declaration beside a converted one', async () => {
    await project(PROJECT);

    const result = await toTs({ output: await outDir() });

    expect(exists('c.cerial')).toBe(true);
    expect(reasonOf(result.lines, 'c.cerial')).toContain('refused or held back');
  });

  it('keeps a file with one converted, one refused and one held-back declaration', async () => {
    await project(PROJECT);

    const result = await toTs({ output: await outDir() });

    expect(exists('a.cerial')).toBe(true);
    expect(reasonOf(result.lines, 'a.cerial')).toContain('refused or held back');
    expect(result.refused).toBe(4);
  });

  it('keeps a source whose declaration a kept one names when the output is outside the entry', async () => {
    await project(PROJECT);

    const result = await toTs({ output: await outDir() });

    expect(exists('x.cerial')).toBe(true);
    expect(reasonOf(result.lines, 'x.cerial')).toContain('Holder, which stays, refers to Shared');
  });

  it('removes that source when the output is inside the entry, where the name still resolves', async () => {
    await project(PROJECT);

    const result = await toTs();

    expect(exists('x.cerial')).toBe(false);
    expect(exists('d.cerial')).toBe(false);
    expect(exists('x.schema.ts')).toBe(true);
    expect(result.lines).toContain(`removed ${join(root, 'x.cerial')}`);
  });

  it('keeps a comment-only .cerial file and every untouched source byte-identical', async () => {
    const note = '// notes that exist nowhere else\n';
    await project({ ...PROJECT, 'notes.cerial': note });
    const before = await snapshot(root);

    const result = await toTs({ output: await outDir() });

    const after = await snapshot(root);
    for (const name of ['a.cerial', 'b.cerial', 'c.cerial', 'notes.cerial', 'x.cerial'])
      expect(after[name]).toBe(before[name]);
    expect(reasonOf(result.lines, 'notes.cerial')).toContain('it holds no declaration');
  });

  it('keeps every source under --dry-run and prints what it would remove', async () => {
    await project(PROJECT);
    const before = await snapshot(root);

    const result = await toTs({ output: await outDir(), dryRun: true });

    expect(await snapshot(root)).toEqual(before);
    expect(result.lines).toContain(`would remove ${join(root, 'd.cerial')}`);
    expect(result.lines.join('\n')).not.toContain('NOT removed');
  });

  it('reports a removal failure, keeps the output and still removes the others', async () => {
    await project(PROJECT);
    const out = await outDir();
    const stuck = join(root, 'd.cerial');

    const result = await toTs({
      output: out,
      removeFile: async (path) => {
        if (path === stuck) throw new Error('EACCES: permission denied');
        await unlink(path);
      },
    });

    expect(result.failures).toEqual([stuck]);
    expect(exists('d.cerial')).toBe(true);
    expect(await readFile(join(out, 'd.schema.ts'), 'utf8')).toContain("model('Tag'");
    expect(result.lines.join('\n')).toContain(`NOT removed ${stuck}: EACCES`);
  });

  it('removes nothing when the commit rolls back', async () => {
    await project(PROJECT);
    const out = await outDir();
    let calls = 0;

    const error = await refused(() =>
      toTs({
        output: out,
        rename: async (from, to) => {
          if (++calls === 2) throw new Error('disk full');
          await rename(from, to);
        },
      }),
    );

    expect(error.message).toContain('disk full');
    expect(await readdir(out)).toEqual([]);
  });

  it('removes nothing when every declaration is refused or held back', async () => {
    await project({
      'a.cerial': 'object Parent {\n  p Int\n  child Child?\n}\n\nobject Child extends Base {\n  c Int\n}\n',
      'b.cerial': 'object Base {\n  b Int\n  other Other?\n}\n\nobject Other extends Parent {\n  o Int\n}\n',
    });
    const out = await outDir();

    const error = await refused(() => toTs({ output: out }));

    expect(error.message).toContain('Every declaration is refused or held back');
  });
});

const IMPORT = `import { defineSchema, f, model, object } from '${SCHEMA_MODULE}';\n`;
const mod = (body: string): string => `${IMPORT}${body}\n`;
const BAD = "f.record('a b')";
const TAG = mod("export const Tag = model('Tag', { id: f.record().id(), label: f.string() });");

describe('--partial --remove-source to cerial', () => {
  it('removes a wholly converted module and keeps the ones holding a refused or held-back declaration', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'post.schema.ts': mod(
        "import { User } from './user.schema';\nexport const Post = model('Post', { id: f.record().id(), author: f.relation(() => User) });",
      ),
      // one converted and one refused declaration in a single module
      'mixed.schema.ts': mod(
        `export const Fine = model('Fine', { id: f.record().id() });\nexport const Broken = model('Broken', { id: f.record().id(), ref: ${BAD} });`,
      ),
      'tag.schema.ts': TAG,
      'notes.schema.ts': '// notes that exist nowhere else\n',
    });
    const before = await snapshot(root);

    const result = await toCerial({ output: await outDir() });

    expect(exists('tag.schema.ts')).toBe(false);
    const after = await snapshot(root);
    for (const name of ['user.schema.ts', 'post.schema.ts', 'mixed.schema.ts', 'notes.schema.ts'])
      expect(after[name]).toBe(before[name]);
    expect(reasonOf(result.lines, 'mixed.schema.ts')).toContain('refused or held back');
    expect(reasonOf(result.lines, 'post.schema.ts')).toContain('refused or held back');
    expect(reasonOf(result.lines, 'notes.schema.ts')).toContain('it holds no declaration');
    expect(result.warnings.some((w) => w.includes('gone'))).toBe(true);
  });

  it('removes nothing under --dry-run or when every declaration is refused', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });
    const before = await snapshot(root);

    const result = await toCerial({ output: await outDir(), dryRun: true });

    expect(await snapshot(root)).toEqual(before);
    expect(result.lines).toContain(`would remove ${join(root, 'tag.schema.ts')}`);

    await rm(join(root, 'tag.schema.ts'));
    const error = await refused(() => toCerial({ output: undefined }));
    expect(error.message).toContain('Every declaration is refused or held back');
  });
});

describe('the closing line after a removal', () => {
  it('is measured: a config that lists a removed module no longer generates, though the plan said it did', async () => {
    await project({
      'cerial.config.json': JSON.stringify({
        schemas: { main: { files: ['./tag.schema.ts', './user.schema.ts'], output: './client-main' } },
      }),
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });
    process.chdir(root);

    const result = await toCerial({ schema: undefined, output: await outDir() });

    expect(exists('tag.schema.ts')).toBe(false);
    expect(result.lines.join('\n')).toContain("change 'files' in schema 'main'");
    expect(result.lines.at(-1)).toStartWith('The project does not generate as it stands:');
  });

  it('reports that it generates once removal has taken out the duplicates', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });

    const result = await toCerial();

    expect(exists('tag.schema.ts')).toBe(false);
    expect(exists('tag.cerial')).toBe(true);
    expect(result.lines.at(-1)).toBe('The project generates as it stands.');
    const built = await buildResolvedSchemaAst({ schemaPath: root });
    expect(built.parseErrors).toEqual([]);
    expect(built.extendsErrors).toEqual([]);
  });

  it('keeps the plan when nothing was removed', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });

    const result = await toCerial({ dryRun: true });

    expect(result.lines.at(-1)).toStartWith('The project does not generate as it stands:');
  });
});

describe('--force --partial --remove-source together', () => {
  it('replaces a stale output, removes only the wholly converted source and never overwrites a source', async () => {
    await project(PROJECT);
    const out = await outDir({ 'd.schema.ts': '// stale output\n' });
    const before = await snapshot(root);

    const result = await toTs({ output: out, force: true });

    expect(await readFile(join(out, 'd.schema.ts'), 'utf8')).toContain("model('Tag'");
    expect(exists('d.cerial')).toBe(false);
    expect(exists('x.cerial')).toBe(true);
    const after = await snapshot(root);
    for (const name of ['a.cerial', 'b.cerial', 'c.cerial', 'x.cerial']) expect(after[name]).toBe(before[name]);
    expect(result.failures).toEqual([]);
    expect(result.refused).toBe(4);
  });

  it('still refuses to replace a source with --force, and removes nothing', async () => {
    await project({ ...PROJECT, 'd.schema.ts': '// mine\n' });

    const error = await refused(() => toTs({ force: true, schema: root }));

    expect(error.message).toContain('d.schema.ts');
  });
});
