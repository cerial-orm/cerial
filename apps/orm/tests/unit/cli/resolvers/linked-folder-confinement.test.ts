import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findFolderConfigs } from '../../../../src/cli/config';
import { discoverSchemas, findSchemaRoots } from '../../../../src/cli/resolvers/schema-resolver';

const USER = 'model User {\n  id Record @id\n}\n';

let base: string;
let root: string;
let marker: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'cerial-linked-')));
  root = join(base, 'project');
  marker = join(base, 'config-ran');
  await mkdir(root);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

// A config that records that it ran: loading one executes it
const config = (): string =>
  `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\nexport default { output: './gen' };\n`;

async function put(files: Record<string, string>, at: string): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(at, name)), { recursive: true });
    await writeFile(join(at, name), text);
  }
}

describe('a linked folder config is not loaded', () => {
  it('skips a link to a folder outside the project, without running its config', async () => {
    await put({ 'cfg/cerial.config.ts': config(), 'cfg/a.cerial': USER }, base);
    await symlink(join(base, 'cfg'), join(root, 'child'), 'dir');

    expect(await findFolderConfigs(root)).toEqual([]);
    expect(existsSync(marker)).toBe(false);
    expect(await discoverSchemas(root)).toEqual([]);
  });

  it('skips a link into node_modules, without running its config', async () => {
    await put({ 'node_modules/x/cfg/cerial.config.ts': config(), 'node_modules/x/cfg/a.cerial': USER }, root);
    await symlink(join(root, 'node_modules/x/cfg'), join(root, 'child'), 'dir');

    expect(await findFolderConfigs(root)).toEqual([]);
    expect(existsSync(marker)).toBe(false);
    expect(await discoverSchemas(root)).toEqual([]);
  });

  it('skips a real folder whose config file links outside the project', async () => {
    await put({ 'outside/cerial.config.ts': config() }, base);
    await put({ 'child/a.cerial': USER }, root);
    await symlink(join(base, 'outside/cerial.config.ts'), join(root, 'child/cerial.config.ts'), 'file');

    expect(await findFolderConfigs(root)).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });

  it('skips a real folder whose config file links into node_modules', async () => {
    await put({ 'node_modules/x/cerial.config.ts': config(), 'schemas/a.cerial': USER }, root);
    await symlink(join(root, 'node_modules/x/cerial.config.ts'), join(root, 'schemas/cerial.config.ts'), 'file');

    expect(await findFolderConfigs(root)).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });

  it('skips the whole folder when its ts config links out beside a real json config', async () => {
    await put({ 'outside/cerial.config.ts': config() }, base);
    await put({ 'child/cerial.config.json': '{ "output": "./gen" }', 'child/a.cerial': USER }, root);
    await symlink(join(base, 'outside/cerial.config.ts'), join(root, 'child/cerial.config.ts'), 'file');

    expect(await findFolderConfigs(root)).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });

  it('negative: a real folder with a config is still loaded', async () => {
    await put({ 'child/cerial.config.ts': config(), 'child/a.cerial': USER }, root);

    expect((await findFolderConfigs(root)).map((r) => r.dir)).toEqual([join(root, 'child')]);
    expect(existsSync(marker)).toBe(true);
  });
});

describe('a linked schema folder is not a schema root', () => {
  it('skips a link into node_modules', async () => {
    await put({ 'node_modules/x/cfg/schema.cerial': USER }, root);
    await symlink(join(root, 'node_modules/x/cfg'), join(root, 'child'), 'dir');

    expect(await findSchemaRoots(root)).toEqual([]);
  });

  it('skips a linked schemas folder that points into node_modules', async () => {
    await put({ 'node_modules/x/s/a.cerial': USER }, root);
    await symlink(join(root, 'node_modules/x/s'), join(root, 'schemas'), 'dir');

    expect((await discoverSchemas(root)).flatMap((s) => s.files)).toEqual([]);
  });

  it('negative: a real schema folder is a root', async () => {
    await put({ 'child/schema.cerial': USER }, root);

    expect((await findSchemaRoots(root)).map((r) => r.path)).toEqual([join(root, 'child')]);
  });
});
