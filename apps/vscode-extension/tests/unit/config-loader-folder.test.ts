import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findFolderConfigs, loadFolderConfig } from '../../server/src/config-loader';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerial-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadFolderConfig', () => {
  test('loads valid folder config JSON', () => {
    const dir = path.join(tmpDir, 'valid-folder');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'cerial.config.json'),
      JSON.stringify({ name: 'auth', output: './generated', ignore: ['draft/**'] }),
    );

    const config = loadFolderConfig(dir);

    expect(config).not.toBeNull();
    expect(config!.name).toBe('auth');
    expect(config!.output).toBe('./generated');
    expect(config!.ignore).toEqual(['draft/**']);
  });

  test('loads folder config with exclude and include', () => {
    const dir = path.join(tmpDir, 'folder-filters');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'cerial.config.json'),
      JSON.stringify({ exclude: ['temp/**'], include: ['temp/keep.cerial'] }),
    );

    const config = loadFolderConfig(dir);

    expect(config).not.toBeNull();
    expect(config!.exclude).toEqual(['temp/**']);
    expect(config!.include).toEqual(['temp/keep.cerial']);
  });

  test('returns null for root config with schema key', () => {
    const dir = path.join(tmpDir, 'root-schema');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'cerial.config.json'),
      JSON.stringify({ schema: './schemas', output: './generated' }),
    );

    const config = loadFolderConfig(dir);

    expect(config).toBeNull();
  });

  test('returns null for root config with schemas key', () => {
    const dir = path.join(tmpDir, 'root-schemas');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'cerial.config.json'),
      JSON.stringify({
        schemas: { auth: { path: './auth', output: './gen/auth' } },
      }),
    );

    const config = loadFolderConfig(dir);

    expect(config).toBeNull();
  });

  test('returns null for non-existent directory', () => {
    const config = loadFolderConfig(path.join(tmpDir, 'does-not-exist'));

    expect(config).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    const dir = path.join(tmpDir, 'bad-json-folder');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cerial.config.json'), '{ broken !!!');

    const config = loadFolderConfig(dir);

    expect(config).toBeNull();
  });

  test('loads folder config from TS file', () => {
    const dir = path.join(tmpDir, 'ts-folder');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cerial.config.ts'), `export default { name: 'billing', output: './client' };`);

    const config = loadFolderConfig(dir);

    expect(config).not.toBeNull();
    expect(config!.name).toBe('billing');
    expect(config!.output).toBe('./client');
  });

  test('returns null for TS root config with schema key', () => {
    const dir = path.join(tmpDir, 'ts-root');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cerial.config.ts'), `export default { schema: './schemas', output: './gen' };`);

    const config = loadFolderConfig(dir);

    expect(config).toBeNull();
  });

  test('returns config with no name (uses dir basename)', () => {
    const dir = path.join(tmpDir, 'minimal-folder');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cerial.config.json'), JSON.stringify({ output: './out' }));

    const config = loadFolderConfig(dir);

    expect(config).not.toBeNull();
    expect(config!.name).toBeUndefined();
    expect(config!.output).toBe('./out');
  });

  test('JSON config takes priority over TS config', () => {
    const dir = path.join(tmpDir, 'both-folder');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cerial.config.json'), JSON.stringify({ name: 'from-json' }));
    fs.writeFileSync(path.join(dir, 'cerial.config.ts'), `export default { name: 'from-ts' };`);

    const config = loadFolderConfig(dir);

    expect(config).not.toBeNull();
    expect(config!.name).toBe('from-json');
  });
});

describe('findFolderConfigs', () => {
  test('discovers folder config in subdirectory', () => {
    const workspace = path.join(tmpDir, 'workspace-1');
    const subdir = path.join(workspace, 'auth');
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(path.join(subdir, 'cerial.config.json'), JSON.stringify({ name: 'auth', output: './gen' }));

    const results = findFolderConfigs(workspace);

    expect(results.length).toBe(1);
    expect(results[0]!.dir).toBe(subdir);
    expect(results[0]!.config.name).toBe('auth');
  });

  test('returns empty array when no folder configs exist', () => {
    const workspace = path.join(tmpDir, 'workspace-empty');
    const subdir = path.join(workspace, 'src');
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(path.join(subdir, 'readme.md'), '# no config');

    const results = findFolderConfigs(workspace);

    expect(results).toEqual([]);
  });

  test('skips node_modules subdirectory', () => {
    const workspace = path.join(tmpDir, 'workspace-nm');
    const nmDir = path.join(workspace, 'node_modules', 'pkg');
    const validDir = path.join(workspace, 'schemas');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.mkdirSync(validDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'cerial.config.json'), JSON.stringify({ name: 'dep' }));
    fs.writeFileSync(path.join(validDir, 'cerial.config.json'), JSON.stringify({ name: 'app' }));

    const results = findFolderConfigs(workspace);

    expect(results.length).toBe(1);
    expect(results[0]!.config.name).toBe('app');
  });

  test('skips .git and dist subdirectories', () => {
    const workspace = path.join(tmpDir, 'workspace-skip');
    const gitDir = path.join(workspace, '.git');
    const distDir = path.join(workspace, 'dist');
    const validDir = path.join(workspace, 'core');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });
    fs.mkdirSync(validDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'cerial.config.json'), JSON.stringify({ name: 'git' }));
    fs.writeFileSync(path.join(distDir, 'cerial.config.json'), JSON.stringify({ name: 'dist' }));
    fs.writeFileSync(path.join(validDir, 'cerial.config.json'), JSON.stringify({ name: 'core' }));

    const results = findFolderConfigs(workspace);

    expect(results.length).toBe(1);
    expect(results[0]!.config.name).toBe('core');
  });

  test('discovers multiple folder configs', () => {
    const workspace = path.join(tmpDir, 'workspace-multi');
    const authDir = path.join(workspace, 'auth');
    const coreDir = path.join(workspace, 'core');
    fs.mkdirSync(authDir, { recursive: true });
    fs.mkdirSync(coreDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'cerial.config.json'), JSON.stringify({ name: 'auth' }));
    fs.writeFileSync(path.join(coreDir, 'cerial.config.json'), JSON.stringify({ name: 'core' }));

    const results = findFolderConfigs(workspace);

    expect(results.length).toBe(2);
    const names = results.map((r) => r.config.name).sort();
    expect(names).toEqual(['auth', 'core']);
  });

  test('ignores subdirectories with root configs', () => {
    const workspace = path.join(tmpDir, 'workspace-root-skip');
    const subdir = path.join(workspace, 'inner');
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(path.join(subdir, 'cerial.config.json'), JSON.stringify({ schema: './schemas', output: './gen' }));

    const results = findFolderConfigs(workspace);

    expect(results).toEqual([]);
  });

  test('returns empty array for non-existent workspace', () => {
    const results = findFolderConfigs(path.join(tmpDir, 'nonexistent'));

    expect(results).toEqual([]);
  });
});
