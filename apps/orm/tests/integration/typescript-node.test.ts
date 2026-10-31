/**
 * The built CLI generating from TypeScript schema modules and `cerial.config.ts` under real Node binaries.
 * Needs no database, but needs `bun run build`: it runs `dist/bin/cerial.mjs`.
 *
 * Node binaries come from `node` on PATH plus any listed in `CERIAL_TEST_NODE` (a path list), so CI runs
 * one matrix entry per job and a developer can add 22.12 beside the default. `CERIAL_TEST_OLD_NODE` names a
 * binary below the supported range for the message check.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { CerialGenerationError } from '../../src/errors';
import { assertSupportedNode, MINIMUM_NODE_VERSION } from '../../src/parser/builder';

const PACKAGE = join(import.meta.dir, '../..');
const CLI = join(PACKAGE, 'dist/bin/cerial.mjs');
const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

async function nodeVersion(binary: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([binary, '-p', 'process.versions.node'], { stdout: 'pipe', stderr: 'ignore' });
    const text = (await new Response(proc.stdout).text()).trim();

    return (await proc.exited) === 0 ? text : null;
  } catch {
    return null;
  }
}

function atLeastMinimum(version: string): boolean {
  try {
    assertSupportedNode(version);

    return true;
  } catch {
    return false;
  }
}

const candidates = ['node', ...(process.env.CERIAL_TEST_NODE ?? '').split(delimiter).filter(Boolean)];
const found = await Promise.all(candidates.map(async (binary) => ({ binary, version: await nodeVersion(binary) })));
const supported = found.filter(
  (n): n is { binary: string; version: string } => !!n.version && atLeastMinimum(n.version),
);
const oldBinary = process.env.CERIAL_TEST_OLD_NODE;
const oldVersion = oldBinary ? await nodeVersion(oldBinary) : null;
console.log(`typescript-node: Node binaries exercised: ${supported.map((n) => n.version).join(', ') || 'none'}`);

interface Project {
  dir: string;
  out: string;
}

async function project(files: Record<string, string>): Promise<Project> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-ts-node-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'node_modules'));
  // `cerial/schema` resolves to the built package, as it does for an installed one
  await symlink(PACKAGE, join(dir, 'node_modules/cerial'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }

  return { dir, out: join(dir, 'out') };
}

async function generate(binary: string, dir: string): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([binary, CLI, 'generate', '-y'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { code: await proc.exited, output: stdout + stderr };
}

async function generatedText(out: string): Promise<string> {
  const files = await readdir(out, { recursive: true });
  const texts = await Promise.all(files.filter((f) => f.endsWith('.ts')).map((f) => readFile(join(out, f), 'utf8')));

  return texts.join('\n');
}

const config = "export default { schema: './schemas', output: './out' };\n";
const user = `import { f, model } from 'cerial/schema';
export const User = model('User', { id: f.record().id(), name: f.string() });
`;

it('built the CLI before running', () => {
  expect(existsSync(CLI), 'run `bun run build` first').toBe(true);
});

it('exercises at least one supported Node binary here', () => {
  expect(supported.length, 'no Node >= the minimum on PATH or in CERIAL_TEST_NODE').toBeGreaterThan(0);
});

describe.each(supported)('Node $version', ({ binary }) => {
  it('loads cerial.config.ts and schema modules that import each other without an extension', async () => {
    const p = await project({
      'cerial.config.ts': config,
      'schemas/user.schema.ts': user,
      'schemas/post.schema.ts': `import { f, model } from 'cerial/schema';
import { User } from './user.schema';
export const Post = model('Post', { id: f.record().id(), title: f.string(), author: f.relation(() => User).optional() });
`,
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code, output).toBe(0);
    // The relation resolved, so the handle from `cerial/schema` was recognised by the CLI's own builder copy
    const text = await generatedText(p.out);
    expect(text).toContain('Post');
    expect(text).toContain('author');
  }, 60_000);

  it('loads modules that import with an explicit .ts extension', async () => {
    const p = await project({
      'cerial.config.ts': config,
      'schemas/user.schema.ts': user,
      'schemas/post.schema.ts': `import { f, model } from 'cerial/schema';
import { User } from './user.schema.ts';
export const Post = model('Post', { id: f.record().id(), author: f.relation(() => User).optional() });
`,
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code, output).toBe(0);
  }, 60_000);

  it('loads a module that declares a TypeScript enum beside its model', async () => {
    const p = await project({
      'cerial.config.ts': config,
      'schemas/user.schema.ts': `${user}export enum Kind { Admin, Member }\n`,
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code, output).toBe(0);
  }, 60_000);

  it('loads a cerial.config.ts that imports a sibling module without an extension', async () => {
    const p = await project({
      'cerial.config.ts': "import { output } from './paths';\nexport default { schema: './schemas', output };\n",
      'paths.ts': "export const output: string = './out';\n",
      'schemas/user.schema.ts': user,
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code, output).toBe(0);
    expect(await generatedText(p.out)).toContain('User');
  }, 60_000);

  it('names the module when it throws on import, not a bare loader error', async () => {
    const p = await project({
      'cerial.config.ts': config,
      'schemas/broken.schema.ts': "throw new Error('boom from the module');\n",
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code).not.toBe(0);
    expect(output).toContain('broken.schema.ts');
    expect(output).toContain('boom from the module');
    expect(output).not.toContain('Unknown file extension');
  }, 60_000);
});

/**
 * A project whose `cerial` holds only the built output. The symlinked package carries this repo's own
 * `.cerial` test fixtures, which convention discovery would find in a project with no config.
 */
async function slimProject(files: Record<string, string>): Promise<Project> {
  const p = await project(files);
  await rm(join(p.dir, 'node_modules/cerial'));
  await mkdir(join(p.dir, 'node_modules/cerial'));
  for (const name of ['dist', 'package.json'])
    await symlink(join(PACKAGE, name), join(p.dir, 'node_modules/cerial', name));

  return p;
}

describe.each(supported)('Node $version registration', ({ binary }) => {
  const entry = `import { defineSchema } from 'cerial/schema';
import { User } from './users/user';
import { Post } from './posts/post';

export default defineSchema({ models: [User, Post] });
`;
  const post = `import { f, model } from 'cerial/schema';
import { User } from '../users/user';
export const Post = model('Post', { id: f.record().id(), author: f.relation(() => User).optional() });
`;

  it('registers a plainly named module through schemas[].entry', async () => {
    const p = await project({
      'cerial.config.ts': "export default { schemas: { app: { entry: './src/schema.ts', output: './out' } } };\n",
      'src/schema.ts': entry,
      'src/users/user.ts': user,
      'src/posts/post.ts': post,
      'src/unregistered.ts': user.replace(/User/g, 'Ghost'),
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code, output).toBe(0);
    const text = await generatedText(p.out);
    expect(text).toContain('User');
    expect(text).toContain('author');
    expect(text).not.toContain('Ghost');
  }, 60_000);

  it('registers a plainly named module from cerial.schema.ts with no config', async () => {
    const p = await slimProject({
      'cerial.schema.ts': entry.replace(/'\.\//g, "'./src/"),
      'src/users/user.ts': user,
      'src/posts/post.ts': post,
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code, output).toBe(0);
    expect(await generatedText(join(p.dir, 'client'))).toContain('Post');
  }, 60_000);

  it('does not register what a plain *.schema.ts imports', async () => {
    const p = await slimProject({
      'user.schema.ts': `${user}import './helper';\n`,
      'helper.ts': user.replace(/User/g, 'Helper'),
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code, output).toBe(0);
    expect(await generatedText(join(p.dir, 'client'))).not.toContain('Helper');
  }, 60_000);

  it('refuses a listed model that is not an exported binding, naming it', async () => {
    const p = await project({
      'cerial.config.ts': "export default { schemas: { app: { entry: './schema.ts', output: './out' } } };\n",
      'schema.ts':
        "import { defineSchema, f, model } from 'cerial/schema';\nexport default defineSchema({ models: [model('Inline', { id: f.record().id() })] });\n",
    });
    const { code, output } = await generate(binary, p.dir);

    expect(code).not.toBe(0);
    expect(output).toContain('Inline');
  }, 60_000);
});

describe('below the supported Node range', () => {
  it('refuses with the release to upgrade to', () => {
    for (const version of ['20.19.0', '22.11.0', '18.0.0']) {
      expect(() => assertSupportedNode(version)).toThrow(CerialGenerationError);
      expect(() => assertSupportedNode(version)).toThrow(`Node ${MINIMUM_NODE_VERSION} or newer (Node 22 LTS)`);
      expect(() => assertSupportedNode(version)).toThrow(`this is Node ${version}`);
    }
  });

  it('accepts the minimum and anything newer', () => {
    for (const version of [MINIMUM_NODE_VERSION, '22.12.1', '22.23.4', '24.18.0', '26.0.0']) {
      expect(() => assertSupportedNode(version)).not.toThrow();
    }
  });

  it.skipIf(!oldVersion)(
    `a real Node ${oldVersion ?? '(none; set CERIAL_TEST_OLD_NODE)'} says what to upgrade to`,
    async () => {
      const p = await project({ 'cerial.config.ts': config, 'schemas/user.schema.ts': user });
      const { code, output } = await generate(oldBinary!, p.dir);

      expect(code).not.toBe(0);
      expect(output).toContain('Upgrade to Node 22 LTS');
      expect(output).not.toContain('Unknown file extension');
    },
    60_000,
  );
});
