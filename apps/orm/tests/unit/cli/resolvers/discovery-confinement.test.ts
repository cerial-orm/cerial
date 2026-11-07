import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { formatSchema } from '../../../../src/cli/format';
import {
  discoverSchemas,
  findSchemaRoots,
  findSchemasInDir,
  resolveSchemas,
} from '../../../../src/cli/resolvers/schema-resolver';

const USER = 'model User {\n  id Record @id\n}\n';
const MESSY = 'model   Dep{\nid Record   @id\n}\n';
const TS = "import { model } from 'cerial/schema';\nexport const Dep = model('Dep', {});\n";

let base: string;
let root: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'cerial-confine-')));
  root = join(base, 'project');
  await mkdir(root);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(files: Record<string, string>, at: string = root): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(at, name)), { recursive: true });
    await writeFile(join(at, name), text);
  }
}

describe('discovery without a config stays in the project root', () => {
  it('uses the documented schemas folder', async () => {
    await put({ 'schemas/user.cerial': USER });

    expect(await resolveSchemas({ cwd: root })).toEqual([join(root, 'schemas/user.cerial')]);
  });

  it('ignores a dependency that ships its own schemas folder', async () => {
    await put({
      'schemas/user.cerial': USER,
      'node_modules/dep/schemas/dep.cerial': MESSY,
      'node_modules/dep/schemas/dep.schema.ts': TS,
    });

    expect(await resolveSchemas({ cwd: root })).toEqual([join(root, 'schemas/user.cerial')]);
    expect((await discoverSchemas(root)).flatMap((s) => s.files)).toEqual([join(root, 'schemas/user.cerial')]);
  });

  it('finds nothing when only a dependency has a schemas folder', async () => {
    await put({ 'node_modules/dep/schemas/dep.cerial': MESSY });

    expect(await resolveSchemas({ cwd: root })).toEqual([]);
  });

  it('ignores .cerial files and marker files under node_modules at any depth', async () => {
    await put({
      'main.cerial': USER,
      'node_modules/dep/x.cerial': MESSY,
      'node_modules/dep/deep/er/main.cerial': MESSY,
      'sub/node_modules/other/x.cerial': MESSY,
    });

    const roots = await findSchemaRoots(root);

    expect(roots.map((r) => r.path)).toEqual([root]);
    expect(roots[0]!.files).toEqual([join(root, 'main.cerial')]);
    expect(await findSchemasInDir(root, ['**/*.cerial'])).toEqual([join(root, 'main.cerial')]);
  });

  it('never looks in a parent folder or a sibling folder', async () => {
    await put({ 'schemas/up.cerial': USER, 'sibling/schemas/side.cerial': USER, 'sibling/main.cerial': USER }, base);

    expect(await resolveSchemas({ cwd: root })).toEqual([]);
    expect(await findSchemaRoots(root)).toEqual([]);
    expect(await discoverSchemas(root)).toEqual([]);
  });

  it('does not follow a symlinked folder or file that resolves outside the root', async () => {
    await put({ 'schemas/ok.cerial': USER });
    await put({ 'out/schemas/evil.cerial': USER, 'out/main.cerial': USER, 'out/f.cerial': USER }, base);
    await symlink(join(base, 'out'), join(root, 'linked'), 'dir');
    await symlink(join(base, 'out/f.cerial'), join(root, 'schemas/f.cerial'));

    expect(await resolveSchemas({ cwd: root })).toEqual([join(root, 'schemas/ok.cerial')]);
    expect(await findSchemaRoots(root)).toEqual([]);
  });

  it('does not take a schemas folder that is itself a link to outside the root', async () => {
    await put({ 'evil/x.cerial': USER }, base);
    await symlink(join(base, 'evil'), join(root, 'schemas'), 'dir');

    expect(await resolveSchemas({ cwd: root })).toEqual([]);
  });

  it('refuses several schemas folders and lists each one', async () => {
    await put({ 'a/schemas/a.cerial': USER, 'b/schemas/b.cerial': USER });

    const error = await resolveSchemas({ cwd: root }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toContain('a/schemas');
    expect(error?.message).toContain('b/schemas');
    expect(error?.message).toContain('cerial.config.ts');
    expect(error?.message).toContain('-s');
  });

  it('counts a schemas folder nested in another one once, and an empty one not at all', async () => {
    await put({ 'schemas/a.cerial': USER, 'schemas/inner/schemas/b.cerial': USER, 'other/schema/.keep': '' });

    expect(await resolveSchemas({ cwd: root })).toEqual([
      join(root, 'schemas/a.cerial'),
      join(root, 'schemas/inner/schemas/b.cerial'),
    ]);
  });
});

describe('an explicit path is still honoured', () => {
  it('reads the path given, wherever it is', async () => {
    await put({ 'elsewhere/a.cerial': USER }, base);

    expect(await resolveSchemas({ cwd: root, paths: [join(base, 'elsewhere')] })).toEqual([
      join(base, 'elsewhere/a.cerial'),
    ]);
  });

  it('enters node_modules when the path names a folder inside it, and not below that', async () => {
    await put({
      'node_modules/dep/schemas/a.cerial': USER,
      'node_modules/dep/schemas/node_modules/inner/b.cerial': USER,
    });

    expect(await resolveSchemas({ cwd: root, paths: ['node_modules/dep/schemas'] })).toEqual([
      join(root, 'node_modules/dep/schemas/a.cerial'),
    ]);
  });

  it('skips node_modules below an explicit path', async () => {
    await put({ 'schemas/a.cerial': USER, 'schemas/node_modules/dep/b.cerial': USER });

    expect(await resolveSchemas({ cwd: root, paths: ['schemas'] })).toEqual([join(root, 'schemas/a.cerial')]);
  });
});

describe('format writes only inside the root', () => {
  it('leaves .cerial files under node_modules and behind a symlink untouched, and formats the project', async () => {
    await put({ 'schemas/user.cerial': MESSY, 'node_modules/dep/x.cerial': MESSY }, root);
    await put({ 'f.cerial': MESSY }, base);
    await symlink(join(base, 'f.cerial'), join(root, 'schemas/f.cerial'));

    const summary = await formatSchema({ schemaPath: root, root });

    expect(summary.formatted).toBe(1);
    expect(await readFile(join(root, 'schemas/user.cerial'), 'utf-8')).not.toBe(MESSY);
    expect(await readFile(join(root, 'node_modules/dep/x.cerial'), 'utf-8')).toBe(MESSY);
    expect(await readFile(join(base, 'f.cerial'), 'utf-8')).toBe(MESSY);
  });

  it('refuses a listed file that a symlink takes outside the root, naming it', async () => {
    await put({ 'out/f.cerial': MESSY }, base);
    await symlink(join(base, 'out'), join(root, 'linked'), 'dir');
    const listed = join(root, 'linked/f.cerial');

    const summary = await formatSchema({ schemaPath: join(root, 'none'), root, files: [listed] });

    expect(summary.errors.map((e) => e.path)).toEqual([listed]);
    expect(summary.errors[0]!.message).toContain('outside the project root');
    expect(await readFile(join(base, 'out/f.cerial'), 'utf-8')).toBe(MESSY);
  });

  it('refuses a listed file that sits outside the root, and a directory outside it', async () => {
    await put({ 'outside.cerial': MESSY, 'other/o.cerial': MESSY }, base);

    const listed = await formatSchema({ schemaPath: join(root, 'none'), root, files: [join(base, 'outside.cerial')] });
    const dir = await formatSchema({ schemaPath: join(base, 'other'), root });

    expect(listed.errors.map((e) => e.path)).toEqual([join(base, 'outside.cerial')]);
    expect(dir.errors.map((e) => e.path)).toEqual([join(base, 'other/o.cerial')]);
    expect(await readFile(join(base, 'outside.cerial'), 'utf-8')).toBe(MESSY);
    expect(await readFile(join(base, 'other/o.cerial'), 'utf-8')).toBe(MESSY);
  });

  it('still formats a listed file that sits inside the root', async () => {
    await put({ 'x/f.cerial': MESSY });

    const summary = await formatSchema({ schemaPath: join(root, 'none'), root, files: [join(root, 'x/f.cerial')] });

    expect(summary.formatted).toBe(1);
    expect(summary.errors).toEqual([]);
  });
});
