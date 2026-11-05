import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions } from '../../../../src/cli/convert';
import { CerialError, CerialGenerationError } from '../../../../src/errors';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const MIXED = resolve(import.meta.dir, '../../../fixtures/mixed');

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-mixed-')));
  await mkdir(join(root, 'node_modules/cerial'), { recursive: true });
  await symlink(SCHEMA_MODULE, join(root, 'node_modules/cerial/schema'), 'dir');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Hash and mtime of every entry outside node_modules, so a touched or rewritten file shows. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const names = (await readdir(dir, { recursive: true })).filter((n) => !n.startsWith('node_modules')).sort();
  for (const name of names) {
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

const convert = (options: ConvertOptions): ReturnType<typeof runConvert> => runConvert({ schema: root, ...options });

/** Runs, asserts a Cerial error and that the tree is byte- and mtime-identical afterwards. */
async function refused(options: ConvertOptions): Promise<CerialError> {
  const before = await snapshot(root);
  const error = await convert(options).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CerialError);
  expect(await snapshot(root)).toEqual(before);

  return error as CerialError;
}

const read = (name: string): Promise<string> => readFile(join(root, name), 'utf8');

const IMPORT = "import { e, f, literal, model, object, variant } from 'cerial/schema';\n";
const BASE_CERIAL = `abstract model Base {
  id Record @id
  name String
  email String
}

object Addr {
  street String
  city String
  zip String
}
`;

describe('--to cerial over a mixed entry', () => {
  it('prints a handle reference by name, keeps the .cerial files byte-identical and compares the whole entry', async () => {
    await cp(MIXED, root, { recursive: true });
    const before = await snapshot(root);

    const result = await convert({ to: 'cerial', schema: join(root, 'schema') });

    expect(result.written).toEqual([join(root, 'schema/purchase.cerial')]);
    const text = await read('schema/purchase.cerial');
    for (const line of [
      'model Purchase {',
      '@model(Account)',
      '  meta      Meta',
      '  pair      Pair',
      '  priority  Priority',
      '  status    Status',
    ])
      expect(text).toContain(line);
    expect(text).not.toContain('handles');
    expect(await read('schema/purchase.schema.ts')).toContain("from './cerial/handles'");
    const after = await snapshot(root);
    expect(after['schema/account.cerial']).toBe(before['schema/account.cerial']);
    expect(after['schema/purchase.schema.ts']).toBe(before['schema/purchase.schema.ts']);
  });

  it('writes nothing under --dry-run and leaves no handles file behind', async () => {
    await cp(MIXED, root, { recursive: true });
    const before = await snapshot(root);

    const result = await convert({ to: 'cerial', schema: join(root, 'schema'), dryRun: true });

    expect(result.written).toEqual([]);
    expect(await snapshot(root)).toEqual(before);
  });

  it('refuses a TypeScript object named like a .cerial one, nothing written', async () => {
    await project({
      'base.cerial': BASE_CERIAL,
      'copy.schema.ts': `${IMPORT}export const Addr = object('Addr', { street: f.string() });\n`,
    });

    const error = await refused({ to: 'cerial' });

    expect(error.message).toContain('Duplicate object name: Addr');
  });
});

describe('--to ts over a mixed entry', () => {
  it('converts the .cerial files only and imports the TypeScript declarations from their origin', async () => {
    await cp(MIXED, root, { recursive: true });
    const before = await snapshot(root);

    const result = await convert({ to: 'ts', schema: join(root, 'schema') });

    expect(result.written).toEqual([join(root, 'schema/account.schema.ts')]);
    const text = await read('schema/account.schema.ts');
    expect(text).toContain("import { Address, Point, Level, Role } from './purchase.schema';");
    expect(text).toContain("export const Account = model('Account'");
    expect(text).not.toContain('export const Address');
    const after = await snapshot(root);
    expect(after['schema/purchase.schema.ts']).toBe(before['schema/purchase.schema.ts']);
    expect(after['schema/account.cerial']).toBe(before['schema/account.cerial']);
  });

  it('writes nothing under --dry-run', async () => {
    await cp(MIXED, root, { recursive: true });
    const before = await snapshot(root);

    const result = await convert({ to: 'ts', schema: join(root, 'schema'), dryRun: true });

    expect(result.written).toEqual([]);
    expect(await snapshot(root)).toEqual(before);
  });
});

describe('extends across the boundary', () => {
  const CHILD = `${IMPORT}import { Base, Addr } from './cerial/handles';
export const Child = model('Child', { extra: f.string() }, { extends: Base.pick('id', 'name') });
export const Kid = model('Kid', { extra: f.string() }, { extends: Base.omit('email') });
export const Home = object('Home', { extra: f.string() }, { extends: Addr.omit('zip') });
`;

  it('keeps a TypeScript declaration extending a .cerial one, with pick and omit, going to .cerial', async () => {
    await project({ 'base.cerial': BASE_CERIAL, 'child.schema.ts': CHILD });

    await convert({ to: 'cerial' });

    const text = await read('child.cerial');
    expect(text).toContain('model Child extends Base[id, name] {');
    expect(text).toContain('model Kid extends Base[!email] {');
    expect(text).toContain('object Home extends Addr[!zip] {');
    expect(await read('base.cerial')).toBe(BASE_CERIAL);
  });

  const PARENT = `${IMPORT}export const Parent = model('Parent', { id: f.record().id(), name: f.string(), email: f.string() }, { abstract: true });
export const Place = object('Place', { street: f.string(), city: f.string() });
`;
  const KIDS = `model Kid extends Parent[id, name] {
  extra String
}

model Rest extends Parent[!email] {
  extra String
}

object Spot extends Place[!city] {
  extra String
}
`;

  it('keeps a .cerial declaration extending a TypeScript one, with pick and omit, going to TypeScript', async () => {
    await project({ 'parent.schema.ts': PARENT, 'kids.cerial': KIDS });

    await convert({ to: 'ts' });

    const text = await read('kids.schema.ts');
    expect(text).toContain("from './parent.schema'");
    expect(text).toContain("extends: Parent.pick('id', 'name')");
    expect(text).toContain("extends: Parent.omit('email')");
    expect(text).toContain("extends: Place.omit('city')");
    expect(await read('kids.cerial')).toBe(KIDS);
  });

  it('refuses a pick of a field the .cerial parent does not have, nothing written', async () => {
    await project({
      'base.cerial': BASE_CERIAL,
      'child.schema.ts': CHILD.replace("pick('id', 'name')", "pick('id', 'nope')"),
    });

    await refused({ to: 'cerial' });
  });

  it('refuses a .cerial child picking a field the TypeScript parent does not have, nothing written', async () => {
    await project({ 'parent.schema.ts': PARENT, 'kids.cerial': KIDS.replace('[id, name]', '[id, nope]') });

    await refused({ to: 'ts' });
  });
});

describe('a handle that names a declaration which no longer exists', () => {
  const USER = `${IMPORT}import { Account } from './cerial/handles';
export const Purchase = model('Purchase', { id: f.record().id(), account: f.relation(Account) });
`;

  it('fails on the ordinary refusal and writes nothing, either direction', async () => {
    await project({ 'account.cerial': 'model Other {\n  id Record @id\n}\n', 'purchase.schema.ts': USER });

    for (const to of ['cerial', 'ts']) {
      const error = await refused({ to });

      expect(error.message).toContain("imports 'Account' from './cerial/handles'");
      expect(error.message).toContain('no longer exports it');
    }
  });

  it('converts when the declaration exists', async () => {
    await project({ 'account.cerial': 'model Account {\n  id Record @id\n}\n', 'purchase.schema.ts': USER });

    const result = await convert({ to: 'cerial' });

    expect(result.written).toEqual([join(root, 'purchase.cerial')]);
  });
});

describe('a rerun with both forms of one model present', () => {
  const BOTH = {
    'account.cerial': 'model Account {\n  id Record @id\n}\n',
    'account.schema.ts': `${IMPORT}export const Account = model('Account', { id: f.record().id() });\n`,
  };

  for (const to of ['cerial', 'ts']) {
    for (const force of [false, true]) {
      it(`stops at the duplicate-name refusal naming both origins (--to ${to}${force ? ' --force' : ''})`, async () => {
        await project(BOTH);

        const error = await refused({ to, force });

        expect(error).toBeInstanceOf(CerialGenerationError);
        expect(error.message).toContain('Duplicate model name: Account');
        expect(error.message).toContain(`${join(root, 'account.cerial')}:1`);
        expect(error.message).toContain(`${join(root, 'account.schema.ts')} (export Account)`);
      });
    }
  }

  it('does not refuse once only one form of the model is left', async () => {
    await project({ 'account.cerial': BOTH['account.cerial'] });

    const result = await convert({ to: 'ts', force: true });

    expect(result.written).toEqual([join(root, 'account.schema.ts')]);
  });
});

describe('--to ts, kept module exports', () => {
  const MAIN = 'model M {\n  id Record @id\n  addr Addr\n}\n';
  const ADDR = "object('Addr', { street: f.string() })";

  it('imports a kept default export under an alias', async () => {
    await project({ 'main.cerial': MAIN, 'kept.schema.ts': `${IMPORT}export default ${ADDR};\n` });

    const result = await convert({ to: 'ts' });

    expect(result.written).toEqual([join(root, 'main.schema.ts')]);
    expect(await read('main.schema.ts')).toContain("import { default as _default } from './kept.schema';");
  });

  it('imports a kept export named like a reserved word under an alias', async () => {
    await project({ 'main.cerial': MAIN, 'kept.schema.ts': `${IMPORT}const A = ${ADDR};\nexport { A as class };\n` });

    await convert({ to: 'ts' });

    expect(await read('main.schema.ts')).toContain("import { class as _class } from './kept.schema';");
  });

  it('prefers the export name that is an identifier over an earlier string name', async () => {
    await project({
      'main.cerial': MAIN,
      'kept.schema.ts': `${IMPORT}export const Addr = ${ADDR};\nexport { Addr as "A-bad" };\n`,
    });

    await convert({ to: 'ts' });

    expect(await read('main.schema.ts')).toContain("import { Addr } from './kept.schema';");
  });

  it('prefers an identifier export in a later module over a bad name in an earlier one', async () => {
    await project({
      'main.cerial': MAIN,
      'a.schema.ts': `${IMPORT}import { Addr } from './b.schema';\nexport { Addr as "A-bad" };\n`,
      'b.schema.ts': `${IMPORT}export const Addr = ${ADDR};\n`,
    });

    await convert({ to: 'ts' });

    expect(await read('main.schema.ts')).toContain("import { Addr } from './b.schema';");
  });

  it('refuses a declaration whose only export name is not an identifier, nothing written', async () => {
    await project({
      'main.cerial': MAIN,
      'kept.schema.ts': `${IMPORT}const A = ${ADDR};\nexport { A as "my-addr" };\n`,
    });

    const error = await refused({ to: 'ts' });

    expect(error.message).toContain('"my-addr"');
    expect(error.message).toContain('kept.schema.ts');
  });

  it('converts an entry whose kept module no emitted file imports', async () => {
    await project({
      'main.cerial': 'model M {\n  id Record @id\n  n String\n}\n',
      'kept.schema.ts': `${IMPORT}export const Addr = ${ADDR};\n`,
    });

    const result = await convert({ to: 'ts' });

    expect(result.written).toEqual([join(root, 'main.schema.ts')]);
  });
});
