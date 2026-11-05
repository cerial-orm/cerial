import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { renderUsage } from 'citty';
import { convertCommand } from '../../../../src/cli/commands/convert';
import { LOSSY_CASES, runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions } from '../../../../src/cli/convert';
import { nodeResolve, scanModules } from '../../../../src/cli/convert/scan-module';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { CerialError, CerialGenerationError, CerialValidationError } from '../../../../src/errors';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const SCAN_FIXTURES = resolve(import.meta.dir, '../../../fixtures/convert/scan');
const originalCwd = process.cwd();
const extras: string[] = [];

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-to-cerial-')));
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(root, { recursive: true, force: true });
  for (const dir of extras.splice(0)) await rm(dir, { recursive: true, force: true });
});

const IMPORT = `import { defineSchema, f, model, object, variant, literal } from '${SCHEMA_MODULE}';\n`;
const mod = (body: string): string => `${IMPORT}${body}\n`;

const USER = mod("export const User = model('User', { id: f.record().id(), name: f.string() });");
const POST = mod("export const Post = model('Post', { id: f.record().id(), title: f.string() });");

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

async function project(files: Record<string, string>, base = root): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(base, name)), { recursive: true });
    await writeFile(join(base, name), text);
  }
}

function convert(options: ConvertOptions = {}): ReturnType<typeof runConvert> {
  return runConvert({ to: 'cerial', schema: root, ...options });
}

/** Runs and asserts the run was refused with a Cerial error and the tree is byte- and mtime-identical. */
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

function config(schemas: Record<string, Record<string, unknown>>): string {
  const withOutput = Object.fromEntries(
    Object.entries(schemas).map(([name, entry]) => [name, { ...entry, output: `./client-${name}` }]),
  );

  return JSON.stringify({ schemas: withOutput });
}

/** A directory outside the project, inside a project that installs cerial so no warning is raised. */
async function outside(files: Record<string, string>): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-to-cerial-out-')));
  extras.push(dir);
  await mkdir(join(dir, 'node_modules/cerial'), { recursive: true });
  const out = join(dir, 'out');
  await project(files, out);

  return out;
}

const cerialFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { recursive: true })).filter((name) => name.endsWith('.cerial')).sort();

describe('a clean run', () => {
  it('writes .cerial that generate accepts once the modules are moved away, sources untouched', async () => {
    await project({ 'user.schema.ts': USER, 'post.schema.ts': POST });
    const before = await snapshot(root);

    const result = await convert();

    expect(result.written.map((p) => p.slice(root.length + 1)).sort()).toEqual(['post.cerial', 'user.cerial']);
    for (const [name, value] of Object.entries(before)) expect((await snapshot(root))[name]).toBe(value);
    expect(await readFile(join(root, 'user.cerial'), 'utf8')).toContain('model User {');

    await rename(join(root, 'user.schema.ts'), join(root, 'user.schema.ts.moved'));
    await rename(join(root, 'post.schema.ts'), join(root, 'post.schema.ts.moved'));
    const built = await buildResolvedSchemaAst({ schemaPath: root });
    expect(built.parseErrors).toEqual([]);
    expect(built.combinedAST.models.map((m) => m.name).sort()).toEqual(['Post', 'User']);
  });

  it('marks a derived foreign key through the command', async () => {
    await project({
      'author.schema.ts': mod("export const Author = model('Author', { id: f.record().id() });"),
      'post.schema.ts': mod(
        "import { Author } from './author.schema';\nexport const Post = model('Post', { id: f.record().id(), author: f.relation(() => Author) });",
      ),
    });

    await convert();

    const text = await readFile(join(root, 'post.cerial'), 'utf8');
    expect(text).toMatch(/\/\/ derived by cerial convert from the TypeScript relation 'author'[^\n]*\n\s+authorId /);
  });

  it('writes no file for an entry module that only holds defineSchema', async () => {
    await project({
      'cerial.config.json': config({ main: { entry: './schema/index.ts' } }),
      'schema/user.schema.ts': USER,
      'schema/index.ts': mod("import { User } from './user.schema';\nexport default defineSchema({ models: [User] });"),
    });
    process.chdir(root);

    const result = await convert({ schema: undefined });

    expect(result.written.map((p) => p.slice(root.length + 1))).toEqual(['schema/user.cerial']);
    expect(await cerialFiles(root)).toEqual(['schema/user.cerial']);
  });

  it('--dry-run lists the files and writes nothing', async () => {
    await project({ 'user.schema.ts': USER });
    const before = await snapshot(root);

    const result = await convert({ dryRun: true });

    expect(result.lines.join('\n')).toContain('would write');
    expect(result.written).toEqual([]);
    expect(await snapshot(root)).toEqual(before);
  });

  it('-o mirrors the layout under the output directory', async () => {
    await project({ 'a/user.schema.ts': USER, 'b/post.schema.ts': POST });
    const out = join(root, 'out');

    await convert({ output: out });

    expect(await cerialFiles(out)).toEqual(['a/user.cerial', 'b/post.cerial']);
    expect(await cerialFiles(join(root, 'a'))).toEqual([]);
  });
});

describe('every refusal in one report', () => {
  const BAD_DEFAULT = mod(
    "export const Clock = model('Clock', { id: f.record().id(), at: f.int().default(Date.now()) });",
  );
  const BAD_NAME = mod("export const Thing = model('Thing', { id: f.record().id(), value: f.string() });");

  it('lists refusals from several modules together, grouped by module, with nothing written', async () => {
    await project({ 'clock.schema.ts': BAD_DEFAULT, 'thing.schema.ts': BAD_NAME, 'user.schema.ts': USER });

    const error = await refused({});

    expect(error).toBeInstanceOf(CerialGenerationError);
    const lines = error.message.split('\n');
    const clock = lines.findIndex((l) => l.trim() === join(root, 'clock.schema.ts'));
    const thing = lines.findIndex((l) => l.trim() === join(root, 'thing.schema.ts'));
    expect(clock).toBeGreaterThan(0);
    expect(thing).toBeGreaterThan(clock);
    expect(error.message).toContain('computed-value');
    expect(error.message).toContain("in 'Clock'");
    expect(error.message).toContain("model 'Thing.value'");
    expect(error.message).toContain('2 construct(s)');
    expect(error.message).not.toContain('user.schema.ts');
    expect(await cerialFiles(root)).toEqual([]);
  });

  it('--force bypasses none of it', async () => {
    await project({ 'clock.schema.ts': BAD_DEFAULT });

    const error = await refused({ force: true });

    expect(error.message).toContain('computed-value');
  });

  it('an expand hit never refuses and puts its row comment in the output', async () => {
    await project({
      'loop.schema.ts': mod(
        "export const [Alpha, Beta] = ['Alpha', 'Beta'].map((n) => model(n, { id: f.record().id() }));",
      ),
    });

    await convert();

    const text = await readFile(join(root, 'loop.cerial'), 'utf8');
    expect(text).toMatch(/\/\/ expanded by cerial convert: built by a loop in TypeScript[^\n]*\nmodel Alpha \{/);
    expect(text).toMatch(/\/\/ expanded by cerial convert: built by a loop in TypeScript[^\n]*\nmodel Beta \{/);
  });

  it('names the helper and the shared field set in their comments', async () => {
    await project({
      'helper.schema.ts': mod(
        "const make = (name: string) => model(name, { id: f.record().id() });\nexport const Made = make('Made');",
      ),
      'shared.schema.ts': mod(
        "const stamp = f.string();\nexport const Shared = model('Shared', { id: f.record().id(), label: stamp });",
      ),
    });

    await convert();

    expect(await readFile(join(root, 'helper.cerial'), 'utf8')).toContain("built by the function 'make'");
    expect(await readFile(join(root, 'shared.cerial'), 'utf8')).toMatch(
      /fields shared in TypeScript \('stamp'\)[^\n]*\n\s+label /,
    );
  });

  it('reports a module that throws, naming its path, and writes nothing', async () => {
    await project({ 'user.schema.ts': USER, 'boom.schema.ts': "throw new Error('boom');\n" });

    const error = await refused({});

    expect(error.message).toContain('boom.schema.ts');
    expect(error.message).toContain('boom');
  });
});

describe('-v', () => {
  const LOOP = mod("export const [Alpha, Beta] = ['Alpha', 'Beta'].map((n) => model(n, { id: f.record().id() }));");

  it('prints each expanded case per declaration and the declarations per file', async () => {
    await project({ 'loop.schema.ts': LOOP });

    const { lines } = await convert({ verbose: true });
    const text = lines.join('\n');

    expect(text).toContain('expanded loop-built-model (Models built in a loop) in Alpha, Beta');
    expect(text).toContain(`${join(root, 'loop.schema.ts')}: 2 declaration(s)`);
  });

  it('prints neither without it', async () => {
    await project({ 'loop.schema.ts': LOOP });

    const text = (await convert()).lines.join('\n');

    expect(text).not.toContain('expanded loop-built-model');
    expect(text).not.toContain('declaration(s)');
  });
});

describe('--help', () => {
  it('states what is not preserved, from the rows rather than a copy', async () => {
    const usage = await renderUsage(convertCommand);

    expect(usage).toContain('does not preserve TypeScript comments');
    const named = LOSSY_CASES.filter(
      (entry) => entry.direction === 'to-cerial' && entry.action === 'expand' && entry.comment !== null,
    );
    expect(named.length).toBeGreaterThan(0);
    for (const entry of named) expect(usage).toContain(entry.id.replace(/-/g, ' '));
    expect(usage).toContain('--verbose');
  });
});

describe('flags', () => {
  it('validates --to before anything else', async () => {
    const error = await refused({ to: 'yaml', removeSource: true });

    expect(error).toBeInstanceOf(CerialValidationError);
    expect(error.message).toContain("--to 'yaml'");
  });

  it('accepts --remove-source under --to cerial and removes the converted module', async () => {
    await project({ 'user.schema.ts': USER });

    const result = await convert({ removeSource: true });

    expect(result.failures).toEqual([]);
    expect(await cerialFiles(root)).toEqual(['user.cerial']);
    expect(await readdir(root)).not.toContain('user.schema.ts');
  });
});

describe('destructive paths', () => {
  it('refuses an existing target outside the sources without --force, and replaces it with --force', async () => {
    await project({ 'user.schema.ts': USER });
    const out = await outside({ 'user.cerial': '// mine\n' });

    const error = await refused({ output: out }, out);
    expect(error.message).toContain('already exists');

    await convert({ output: out, force: true });
    expect(await readFile(join(out, 'user.cerial'), 'utf8')).toContain('model User {');
  });

  it('never replaces a schema source of another entry, with --force', async () => {
    await project({
      'cerial.config.json': config({ a: { path: './a' }, b: { path: './b' } }),
      'a/user.schema.ts': USER,
      'b/user.cerial': 'model Other {\n  id Record @id\n}\n',
    });
    process.chdir(root);

    const error = await refused({ schema: undefined, name: 'a', output: join(root, 'b'), force: true });

    expect(error.message).toContain('is a schema source and is never overwritten');
  });

  it('rolls the first file back when the second commit fails', async () => {
    await project({ 'user.schema.ts': USER, 'post.schema.ts': POST });
    let calls = 0;

    const error = await refused({
      rename: async (from, to) => {
        if (++calls === 2) throw new Error('disk full');
        await rename(from, to);
      },
    });

    expect(error.message).toContain('disk full');
    expect(await cerialFiles(root)).toEqual([]);
  });

  it('leaves a source byte- and mtime-identical on a refusal', async () => {
    await project({
      'user.schema.ts': USER,
      'clock.schema.ts': mod(
        "export const Clock = model('Clock', { id: f.record().id(), at: f.int().default(Date.now()) });",
      ),
    });
    const before = await snapshot(root);

    await convert().catch(() => undefined);

    expect(await snapshot(root)).toEqual(before);
  });
});

describe('Node resolution of a project import', () => {
  it('resolves a relative specifier to a TypeScript file without Bun', () => {
    const from = join(SCAN_FIXTURES, 'helper', 'entry.ts');

    expect(nodeResolve('./user', from)).toBe(join(SCAN_FIXTURES, 'helper', 'user.ts'));
    expect(nodeResolve('./user.js', from)).toBe(join(SCAN_FIXTURES, 'helper', 'user.ts'));
    expect(nodeResolve('./missing', from)).toBeUndefined();
  });

  it('resolves a true package under node_modules and leaves an unresolvable alias undefined', () => {
    const from = join(SCAN_FIXTURES, 'helper', 'entry.ts');

    expect(nodeResolve('typescript', from)).toContain(`${join('node_modules', 'typescript')}`);
    expect(nodeResolve('@app/not-a-package', from)).toBeUndefined();
  });

  it('scans the same hits through it as through the default', async () => {
    const entry = join(SCAN_FIXTURES, 'helper', 'stamped-entry.ts');

    const viaNode = await scanModules([entry], { resolve: nodeResolve });
    const viaDefault = await scanModules([entry]);

    expect(viaNode.map((hit) => [hit.id, hit.file, hit.line])).toEqual(
      viaDefault.map((hit) => [hit.id, hit.file, hit.line]),
    );
    expect(viaNode.length).toBeGreaterThan(0);
  });

  it('keeps an unresolvable non-relative import fail-closed as a package', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-to-cerial-alias-')));
    extras.push(dir);
    await project(
      {
        'entry.ts': mod(
          "import { shared } from '@app/shared';\nexport const A = model('A', { id: f.record().id(), ...shared });",
        ),
      },
      dir,
    );

    const hits = await scanModules([join(dir, 'entry.ts')], { resolve: nodeResolve });

    expect(hits.map((hit) => hit.id)).toContain('npm-field-set');
  });
});

describe('a source outside the entry root', () => {
  it('writes only the output beside it, leaves its neighbours and sources alone and leaves no stage', async () => {
    await project({
      'cerial.config.json': config({ main: { entry: './proj/schema/index.ts' } }),
      'proj/schema/index.ts': `${IMPORT}import { User } from '../../ext/user.schema';\nexport default defineSchema({ models: [User] });\n`,
      'ext/user.schema.ts': USER,
      'ext/notes.txt': 'mine',
      'ext/user.cerial': 'VICTIM\n',
    });
    process.chdir(root);
    const before = await snapshot(root);

    const error = await convert({ schema: undefined }).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect((error as Error).message).toContain('already exists');
    expect(await snapshot(root)).toEqual(before);

    await rm(join(root, 'ext/user.cerial'));
    const result = await convert({ schema: undefined });

    expect(result.written).toEqual([join(root, 'ext/user.cerial')]);
    const after = await snapshot(root);
    const { 'ext/user.cerial': created, ...rest } = after;
    const { 'ext/user.cerial': _victim, ...beforeRest } = before;

    expect(created).toBeDefined();
    expect(rest).toEqual(beforeRest);
    expect(await readFile(join(root, 'ext/user.cerial'), 'utf8')).toContain('model User {');
    expect(await readFile(join(root, 'ext/notes.txt'), 'utf8')).toBe('mine');
    expect(await readFile(join(root, 'ext/user.schema.ts'), 'utf8')).toBe(USER);
    expect((await readdir(root, { recursive: true })).filter((n) => n.includes('.cerial-convert-'))).toEqual([]);
  });
});
