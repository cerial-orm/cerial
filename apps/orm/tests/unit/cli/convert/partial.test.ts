import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { convertCommand } from '../../../../src/cli/commands/convert';
import { planPartial, renderUnresolved, runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions, PartialRefusal } from '../../../../src/cli/convert';
import { runPassThree } from '../../../../src/cli/passes/pass-three';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { CerialError, CerialGenerationError } from '../../../../src/errors';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const extras: string[] = [];

const originalCwd = process.cwd();
let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-partial-')));
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(root, { recursive: true, force: true });
  for (const dir of extras.splice(0)) await rm(dir, { recursive: true, force: true });
});

const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

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

async function outDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-partial-out-')));
  extras.push(dir);

  return dir;
}

const toTs = (options: ConvertOptions = {}): ReturnType<typeof runConvert> =>
  runConvert({ to: 'ts', schemaImport: SCHEMA_MODULE, schema: root, partial: true, ...options });
const toCerial = (options: ConvertOptions = {}): ReturnType<typeof runConvert> =>
  runConvert({ to: 'cerial', schema: root, partial: true, ...options });

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

function parse(files: Record<string, string>) {
  const { ast, errors } = runPassThree(Object.entries(files).map(([path, content]) => ({ path, content })));
  expect(errors).toEqual([]);

  return ast;
}

const refusal = (declaration: string): PartialRefusal => ({ declaration, module: 'm.cerial', reason: 'refused' });
const names = (items: ReadonlyArray<{ name: string }>): string[] => items.map((i) => i.name).sort();

describe('planPartial', () => {
  it('holds back a model whose relation reaches a refused one, with the chain, and keeps an unrelated one', () => {
    const ast = parse({
      'm.cerial': `model User {
  id Record @id
}

model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}

model Comment {
  id Record @id
  postId Record
  post Relation @field(postId) @model(Post)
}

model Tag {
  id Record @id
}
`,
    });

    const plan = planPartial(ast, [refusal('User')]);

    expect(plan.held.map((h) => h.chain.join(' -> '))).toEqual(['Comment -> Post -> User', 'Post -> User']);
    expect(names(plan.kept.models)).toEqual(['Tag']);
  });

  it('holds back a child of a refused parent and keeps a sibling of its own', () => {
    const ast = parse({
      'm.cerial': `object Base {
  a Int
}

object Child extends Base {
  b Int
}

object Free {
  c Int
}
`,
    });

    const plan = planPartial(ast, [refusal('Base')]);

    expect(plan.held.map((h) => h.chain)).toEqual([['Child', 'Base']]);
    expect(names(plan.kept.objects)).toEqual(['Free']);
  });

  it('walks object, tuple, literal and enum references', () => {
    const ast = parse({
      'm.cerial': `object Addr {
  street String
}

tuple Pair {
  Int,
  Int
}

literal Mood {
  'a',
  'b'
}

enum Color {
  Red
}

model ByObject {
  id Record @id
  addr Addr
}

model ByTuple {
  id Record @id
  pair Pair
}

model ByLiteral {
  id Record @id
  mood Mood
}

model ByEnum {
  id Record @id
  color Color
}

model Plain {
  id Record @id
}
`,
    });

    const plan = planPartial(ast, [refusal('Addr'), refusal('Pair'), refusal('Mood'), refusal('Color')]);

    expect(plan.held.map((h) => h.chain.join(' -> ')).sort()).toEqual([
      'ByEnum -> Color',
      'ByLiteral -> Mood',
      'ByObject -> Addr',
      'ByTuple -> Pair',
    ]);
    expect(names(plan.kept.models)).toEqual(['Plain']);
  });

  it('reaches a refused declaration through a literal variant and a tuple element', () => {
    const ast = parse({
      'm.cerial': `object Addr {
  street String
}

tuple Pair {
  Addr,
  Int
}

literal Choice {
  Addr,
  'x'
}
`,
    });

    const plan = planPartial(ast, [refusal('Addr')]);

    expect(plan.held.map((h) => h.chain.join(' -> ')).sort()).toEqual(['Choice -> Addr', 'Pair -> Addr']);
  });

  it('terminates on a cycle of held-back declarations', () => {
    const ast = parse({
      'm.cerial': `object Bad {
  n Int
}

object A {
  b B?
  bad Bad?
}

object B {
  a A?
}
`,
    });

    const plan = planPartial(ast, [refusal('Bad')]);

    expect(plan.held.map((h) => h.chain.join(' -> '))).toEqual(['A -> Bad', 'B -> A -> Bad']);
  });

  it('keeps everything when a refusal names nothing in the schema', () => {
    const ast = parse({ 'm.cerial': 'object Free {\n  c Int\n}\n' });

    const plan = planPartial(ast, [refusal('Elsewhere')]);

    expect(plan.held).toEqual([]);
    expect(names(plan.kept.objects)).toEqual(['Free']);
  });
});

describe('renderUnresolved', () => {
  it('says nothing is unresolved and that the project generates', () => {
    expect(renderUnresolved({ refused: [], held: [], duplicated: [] })).toEqual([
      'Unresolved: nothing.',
      'The project generates as it stands.',
    ]);
  });
});

const CYCLE_A = 'object Parent {\n  p Int\n}\n\nobject Child extends Base {\n  c Int\n}\n';
const CYCLE_B = 'object Base {\n  b Int\n}\n\nobject Other extends Parent {\n  o Int\n}\n';
const DEPENDENT = 'model Item {\n  id Record @id\n  child Child\n}\n\nmodel Tag {\n  id Record @id\n}\n';
const CYCLE_PROJECT = { 'a.cerial': CYCLE_A, 'b.cerial': CYCLE_B, 'c.cerial': DEPENDENT };

describe('--partial to ts', () => {
  it('converts the unrelated declaration, holds back the dependent of a refused cycle and reports the chain', async () => {
    await project(CYCLE_PROJECT);
    const out = await outDir();
    const before = await snapshot(root);

    const result = await toTs({ output: out });

    expect(result.refused).toBe(3);
    expect(await snapshot(root)).toEqual(before);
    const c = await readFile(join(out, 'c.schema.ts'), 'utf8');
    expect(c).toContain("model('Tag'");
    expect(c).not.toContain('Item');
    expect(await readFile(join(out, 'a.schema.ts'), 'utf8')).toContain("object('Parent'");
    expect(await readFile(join(out, 'a.schema.ts'), 'utf8')).not.toContain('Child');
    expect(result.lines).toContain(
      `  held back: Item -> Child (${join(root, 'c.cerial')}): it reaches a refused declaration`,
    );
    expect(result.lines.some((l) => l.startsWith('  refused: Child '))).toBe(true);
    expect(result.lines.some((l) => l.startsWith('  refused: Other '))).toBe(true);
    expect(result.lines).toContain('Unresolved:');
    expect(result.lines.at(-1)).toBe('The project generates as it stands.');
  });

  it('the claim that it generates holds when the output is outside the entry', async () => {
    await project(CYCLE_PROJECT);
    const result = await toTs({ output: await outDir() });

    expect(result.lines.at(-1)).toBe('The project generates as it stands.');
    const built = await buildResolvedSchemaAst({ schemaPath: root });
    expect(built.parseErrors).toEqual([]);
    expect(built.extendsErrors).toEqual([]);
  });

  it('the claim that it does not generate holds when the output sits beside its sources', async () => {
    await project(CYCLE_PROJECT);

    const result = await toTs();

    expect(result.lines.at(-1)).toStartWith('The project does not generate as it stands:');
    expect(result.lines).toContain(`  in both a source and the output: Tag; remove it from ${join(root, 'c.cerial')}`);
    expect(result.lines.some((l) => l.includes('in both a source and the output: Item'))).toBe(false);
    const built = await buildResolvedSchemaAst({ schemaPath: root });
    expect(built.extendsErrors.length).toBeGreaterThan(0);
  });

  it('exits 1 through the command when anything was refused, and 0 when nothing was', async () => {
    const exit = spyOn(process, 'exit').mockImplementation((_code) => undefined as never);
    const log = spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    const run = (args: Record<string, unknown>) =>
      convertCommand.run!({ args } as unknown as Parameters<NonNullable<typeof convertCommand.run>>[0]);
    try {
      await mkdir(join(root, 'node_modules/cerial'), { recursive: true });
      await symlink(SCHEMA_MODULE, join(root, 'node_modules/cerial/schema'), 'dir');
      await project(CYCLE_PROJECT);
      await run({ to: 'ts', schema: root, output: await outDir(), partial: true });
      expect(exit).toHaveBeenCalledWith(1);
      expect(log.mock.calls.some(([line]) => String(line).includes('held back: Item -> Child'))).toBe(true);

      exit.mockClear();
      await rm(join(root, 'a.cerial'));
      await rm(join(root, 'b.cerial'));
      await rm(join(root, 'c.cerial'));
      await project({ 'ok.cerial': 'model Solo {\n  id Record @id\n}\n' });
      await run({ to: 'ts', schema: root, output: await outDir(), partial: true });
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it('a run with nothing refused is a normal run that still ends with the report', async () => {
    await project({ 'ok.cerial': 'model Solo {\n  id Record @id\n}\n' });

    const result = await toTs({ output: await outDir() });

    expect(result.refused).toBe(0);
    expect(result.lines.slice(-2)).toEqual(['Unresolved: nothing.', 'The project generates as it stands.']);
  });

  it('writes nothing and exits through an error when everything is refused', async () => {
    await project({
      'a.cerial': 'object Parent {\n  p Int\n  child Child?\n}\n\nobject Child extends Base {\n  c Int\n}\n',
      'b.cerial': 'object Base {\n  b Int\n  other Other?\n}\n\nobject Other extends Parent {\n  o Int\n}\n',
    });

    const out = await outDir();
    const error = await refused(() => toTs({ output: out }));

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect(error.message).toContain('Every declaration is refused or held back');
    expect(error.message).toContain('Unresolved:');
  });

  it('--dry-run prints the same report and writes nothing', async () => {
    await project(CYCLE_PROJECT);
    const live = await toTs({ output: await outDir() });
    const out = await outDir();
    const before = await snapshot(root);

    const dry = await toTs({ output: out, dryRun: true });

    expect(dry.dryRun).toBe(true);
    expect(dry.refused).toBe(live.refused);
    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(out)).toEqual([]);
    expect(dry.lines.filter((l) => l.startsWith('  ') && !l.startsWith('  in both'))).toEqual(
      live.lines.filter((l) => l.startsWith('  ') && !l.startsWith('  in both')),
    );
    expect(dry.lines.at(-1)).toBe(live.lines.at(-1));
  });

  it('refuses without --partial exactly as before, writing nothing', async () => {
    await project(CYCLE_PROJECT);

    const error = await refused(() => toTs({ partial: false }));

    expect(error.message).toContain('extends-cross-file-cycle');
  });

  it('still refuses a preflight collision', async () => {
    await project(CYCLE_PROJECT);
    await project({ 'c.schema.ts': 'export const Mine = 1;\n' });

    const error = await refused(() => toTs());

    expect(error).toBeInstanceOf(CerialError);
    expect(existsSync(join(root, 'a.schema.ts'))).toBe(false);
  });

  it('never weakens the gate: a failing subset writes nothing', async () => {
    await project(CYCLE_PROJECT);
    const out = await outDir();

    const error = await refused(() =>
      toTs({
        output: out,
        rename: () => Promise.reject(new Error('disk full')),
      }),
    );

    expect(error.message).toContain('disk full');
    expect(await readdir(out)).toEqual([]);
  });
});

describe('--partial and --remove-source', () => {
  it('is accepted in both directions and removes only a wholly converted source', async () => {
    await project({ 'lone.cerial': 'model Lone {\n  id Record @id\n}\n', ...CYCLE_PROJECT });

    const result = await toTs({ output: await outDir(), removeSource: true });

    expect(existsSync(join(root, 'lone.cerial'))).toBe(false);
    for (const name of ['a', 'b', 'c']) expect(existsSync(join(root, `${name}.cerial`))).toBe(true);
    expect(result.failures).toEqual([]);
  });
});

const IMPORT = `import { f, model, object, literal, variant } from '${SCHEMA_MODULE}';\n`;
const mod = (body: string): string => `${IMPORT}${body}\n`;
const BAD = "f.record('a b')";
const TAG = mod("export const Tag = model('Tag', { id: f.record().id(), label: f.string() });");

describe('--partial to cerial', () => {
  it('holds back a model whose relation reaches a refused one and converts the unrelated model', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'post.schema.ts': mod(
        "import { User } from './user.schema';\nexport const Post = model('Post', { id: f.record().id(), author: f.relation(() => User) });",
      ),
      'tag.schema.ts': TAG,
    });
    const out = await outDir();

    const result = await toCerial({ output: out });

    expect(await readdir(out)).toEqual(['tag.cerial']);
    expect(result.refused).toBe(2);
    expect(result.lines.some((l) => l.startsWith('  held back: Post -> User '))).toBe(true);
    expect(result.lines.some((l) => l.startsWith('  refused: User '))).toBe(true);
    expect(result.lines.at(-1)).toBe('The project generates as it stands.');
  });

  it('holds back a child whose extends reaches a refused parent', async () => {
    await project({
      'base.schema.ts': mod(`export const Base = object('Base', { ref: ${BAD} });`),
      'child.schema.ts': mod(
        "import { Base } from './base.schema';\nexport const Child = object('Child', { extra: f.string() }, { extends: Base });",
      ),
      'tag.schema.ts': TAG,
    });
    const out = await outDir();

    const result = await toCerial({ output: out });

    expect(await readdir(out)).toEqual(['tag.cerial']);
    expect(result.lines.some((l) => l.startsWith('  held back: Child -> Base '))).toBe(true);
  });

  it('holds back a model whose field is a refused object', async () => {
    await project({
      'profile.schema.ts': mod(`export const Profile = object('Profile', { ref: ${BAD} });`),
      'user.schema.ts': mod(
        "import { Profile } from './profile.schema';\nexport const User = model('User', { id: f.record().id(), profile: f.object(Profile) });",
      ),
      'tag.schema.ts': TAG,
    });
    const out = await outDir();

    const result = await toCerial({ output: out });

    expect(await readdir(out)).toEqual(['tag.cerial']);
    expect(result.lines.some((l) => l.startsWith('  held back: User -> Profile '))).toBe(true);
  });

  it('the claim that it does not generate holds when .cerial lands beside the modules', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });

    const result = await toCerial();

    expect(existsSync(join(root, 'tag.cerial'))).toBe(true);
    expect(result.lines.at(-1)).toStartWith('The project does not generate as it stands:');
    expect(result.lines).toContain(
      `  in both a source and the output: Tag; remove it from ${join(root, 'tag.schema.ts')}`,
    );
    const built = await buildResolvedSchemaAst({ schemaPath: root });
    expect(built.extendsErrors.length).toBeGreaterThan(0);
  });

  it('the claim that it generates holds when the output is outside the entry', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });

    const result = await toCerial({ output: await outDir() });

    expect(result.lines.at(-1)).toBe('The project generates as it stands.');
    const built = await buildResolvedSchemaAst({ schemaPath: root });
    expect(built.parseErrors).toEqual([]);
    expect(built.extendsErrors).toEqual([]);
  });

  it('writes nothing and errors when every declaration is refused, and with --dry-run too', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
    });

    for (const dryRun of [false, true]) {
      const out = await outDir();
      const error = await refused(() => toCerial({ output: out, dryRun }));

      expect(error.message).toContain('Every declaration is refused or held back');
    }
  });

  it('--dry-run prints the report and writes nothing', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });
    const out = await outDir();
    const before = await snapshot(root);

    const result = await toCerial({ output: out, dryRun: true });

    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(out)).toEqual([]);
    expect(result.refused).toBe(1);
    expect(result.lines.some((l) => l.startsWith('  refused: User '))).toBe(true);
  });

  it('without --partial a refusal still writes nothing', async () => {
    await project({
      'user.schema.ts': mod(`export const User = model('User', { id: f.record().id(), ref: ${BAD} });`),
      'tag.schema.ts': TAG,
    });

    const error = await refused(() => toCerial({ partial: false }));

    expect(error.message).toContain('non-identifier-id-type');
    expect(existsSync(join(root, 'tag.cerial'))).toBe(false);
  });

  it('holds back a declaration built by a helper that holds a computed value no declaration owns', async () => {
    await project({
      'stamped.ts': `import { f, model } from '${SCHEMA_MODULE}';\n\nexport function makeStamped() {\n  return model('Stamped', { id: f.record().id(), at: f.int().default(Date.now()) });\n}\n`,
      'stamped.schema.ts': "import { makeStamped } from './stamped';\n\nexport const Stamped = makeStamped();\n",
      'tag.schema.ts': TAG,
    });
    const out = await outDir();

    const result = await toCerial({ output: out });

    expect(await readdir(out)).toEqual(['tag.cerial']);
    expect(result.lines.some((l) => l.includes('Stamped'))).toBe(true);
    expect(result.refused).toBeGreaterThan(0);
  });
});
