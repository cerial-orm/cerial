/**
 * The built CLI running `convert` on a linked install, under Bun and under every Node binary found. The
 * in-process convert tests override the schema import, so only this file proves `cerial/schema` and the
 * module scan resolve from `dist/bin/cerial.mjs`. Needs no database, but needs `bun run build`.
 *
 * Node binaries come from `node` on PATH plus any listed in `CERIAL_TEST_NODE` (a path list), as in
 * `typescript-node.test.ts`.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, sep } from 'node:path';
import { assertSupportedNode } from '../../src/parser/builder';

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
const nodes = found
  .filter((n): n is { binary: string; version: string } => !!n.version && atLeastMinimum(n.version))
  .map((n) => ({ name: `Node ${n.version}`, binary: n.binary }));
const runtimes = [{ name: `Bun ${Bun.version}`, binary: process.execPath }, ...nodes];
console.log(`convert-bin: runtimes exercised: ${runtimes.map((r) => r.name).join(', ')}`);

async function project(files: Record<string, string>): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-convert-bin-')));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'node_modules'));
  // `cerial/schema` and the peer `typescript` resolve through the linked package, as for an installed one
  await symlink(PACKAGE, join(dir, 'node_modules/cerial'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(dir, 'cerial.config.ts'), "export default { schema: './schemas', output: './out' };\n");
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }

  return dir;
}

async function cerial(binary: string, dir: string, ...args: string[]): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([binary, CLI, ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { code: await proc.exited, output: stdout + stderr };
}

async function hashes(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of (await readdir(dir, { recursive: true })).sort()) {
    if (name.startsWith('node_modules')) continue;
    try {
      out[name] = createHash('sha256')
        .update(await readFile(join(dir, name)))
        .digest('hex');
    } catch {
      out[name] = 'dir';
    }
  }

  return out;
}

const names = (dir: string): Promise<string[]> => readdir(join(dir, 'schemas')).then((n) => n.sort());

const userCerial = `model User {
  id Record @id
  name String
  posts Relation[] @model(Post)
}
`;
const postCerial = `model Post {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(User)
}
`;
const cerialFiles = { 'schemas/user.cerial': userCerial, 'schemas/post.cerial': postCerial };

it('built the CLI before running', () => {
  expect(existsSync(CLI), 'run `bun run build` first').toBe(true);
});

it('exercises at least one Node binary here besides Bun', () => {
  expect(nodes.length, 'no supported Node on PATH or in CERIAL_TEST_NODE').toBeGreaterThan(0);
});

describe.each(runtimes)('$name', ({ binary }) => {
  it('converts to TypeScript with --remove-source, generates, converts back and generates again', async () => {
    const dir = await project(cerialFiles);

    const toTs = await cerial(binary, dir, 'convert', '--to', 'ts', '--remove-source');
    expect(toTs.code, toTs.output).toBe(0);
    expect(await names(dir)).toEqual(['post.schema.ts', 'user.schema.ts']);
    const fromTs = await cerial(binary, dir, 'generate', '-y');
    expect(fromTs.code, fromTs.output).toBe(0);
    const client = (await readdir(join(dir, 'out'), { recursive: true })).filter((f) => f.endsWith('.ts'));
    expect(client.length).toBeGreaterThan(0);

    await rm(join(dir, 'out'), { recursive: true });
    const toCerial = await cerial(binary, dir, 'convert', '--to', 'cerial', '--remove-source');
    expect(toCerial.code, toCerial.output).toBe(0);
    expect(await names(dir)).toEqual(['post.cerial', 'user.cerial']);
    const fromCerial = await cerial(binary, dir, 'generate', '-y');
    expect(fromCerial.code, fromCerial.output).toBe(0);
    const text = (
      await Promise.all(
        (await readdir(join(dir, 'out'), { recursive: true }))
          .filter((f) => f.endsWith('.ts'))
          .map((f) => readFile(join(dir, 'out', f), 'utf8')),
      )
    ).join('\n');
    expect(text).toContain('Post');
    expect(text).toContain('author');
  }, 120_000);

  it('refuses a second convert without --remove-source on duplicate names and changes nothing', async () => {
    const dir = await project(cerialFiles);

    const first = await cerial(binary, dir, 'convert', '--to', 'ts');
    expect(first.code, first.output).toBe(0);
    expect(await names(dir)).toEqual(['post.cerial', 'post.schema.ts', 'user.cerial', 'user.schema.ts']);
    const before = await hashes(dir);

    const second = await cerial(binary, dir, 'convert', '--to', 'ts');
    expect(second.code).toBe(1);
    expect(second.output).toContain('Duplicate model name');
    expect(await hashes(dir)).toEqual(before);

    const back = await cerial(binary, dir, 'convert', '--to', 'cerial');
    expect(back.code).toBe(1);
    expect(back.output).toContain('Duplicate model name');
    expect(await hashes(dir)).toEqual(before);
  }, 120_000);

  it('refuses to overwrite an existing target and changes nothing', async () => {
    const dir = await project({
      'schemas/user.cerial': userCerial,
      'converted/user.schema.ts': 'export const note = 1;\n',
    });
    const before = await hashes(dir);

    const { code, output } = await cerial(
      binary,
      dir,
      'convert',
      '--to',
      'ts',
      '--output',
      'converted',
      '--remove-source',
    );

    expect(code, output).toBe(1);
    expect(output).toMatch(/exist/i);
    expect(await hashes(dir)).toEqual(before);
  }, 60_000);

  it('scans modules from the linked install without reporting the library and refuses a computed default', async () => {
    const dir = await project({
      'schemas/c.schema.ts': `import { f, model } from 'cerial/schema';
const compute = (): string => 'x';
export const C = model('C', { id: f.record().id(), name: f.string().default(compute()) });
`,
    });
    const before = await hashes(dir);

    const { code, output } = await cerial(binary, dir, 'convert', '--to', 'cerial', '--remove-source');

    expect(code, output).toBe(1);
    expect(output).toContain('Nothing was written');
    expect(output).toContain('1 construct(s)');
    expect(output).toContain('computed-value');
    expect(output).toContain('compute()');
    expect(output).toContain(join(dir, 'schemas/c.schema.ts'));
    expect(output).not.toContain(`${PACKAGE}${sep}src`);
    expect(output).not.toContain(`${PACKAGE}${sep}dist`);
    expect(await hashes(dir)).toEqual(before);
  }, 60_000);
});
