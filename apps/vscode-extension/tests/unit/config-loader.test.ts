import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findCerialFiles, loadCerialConfig } from '../../server/src/config-loader';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerial-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadCerialConfig', () => {
  test('returns null when no config exists', () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    const config = loadCerialConfig(emptyDir);

    expect(config).toBeNull();
  });

  test('loads JSON config', () => {
    const configDir = path.join(tmpDir, 'json-config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'cerial.config.json'),
      JSON.stringify({ schema: './schemas', output: './generated' }),
    );

    const config = loadCerialConfig(configDir);

    expect(config).not.toBeNull();
    expect(config!.schema).toBe('./schemas');
    expect(config!.output).toBe('./generated');
  });

  test('loads TS config with defineConfig pattern', () => {
    const configDir = path.join(tmpDir, 'ts-config-define');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'cerial.config.ts'),
      `import { defineConfig } from 'cerial';
export default defineConfig({
  schema: './schemas',
  output: './generated',
});`,
    );

    const config = loadCerialConfig(configDir);

    expect(config).not.toBeNull();
    expect(config!.schema).toBe('./schemas');
    expect(config!.output).toBe('./generated');
  });

  test('loads TS config with export default pattern', () => {
    const configDir = path.join(tmpDir, 'ts-config-default');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'cerial.config.ts'),
      `export default {
  schema: './schemas',
  output: './out',
};`,
    );

    const config = loadCerialConfig(configDir);

    expect(config).not.toBeNull();
    expect(config!.schema).toBe('./schemas');
    expect(config!.output).toBe('./out');
  });

  test('malformed JSON returns null (no throw)', () => {
    const configDir = path.join(tmpDir, 'bad-json');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'cerial.config.json'), '{ broken json !!!');

    const config = loadCerialConfig(configDir);

    expect(config).toBeNull();
  });

  test('JSON config takes priority over TS config', () => {
    const configDir = path.join(tmpDir, 'both-configs');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'cerial.config.json'), JSON.stringify({ schema: './from-json' }));
    fs.writeFileSync(path.join(configDir, 'cerial.config.ts'), `export default { schema: './from-ts' };`);

    const config = loadCerialConfig(configDir);

    expect(config).not.toBeNull();
    expect(config!.schema).toBe('./from-json');
  });

  test('TS config with single quotes parses correctly', () => {
    const configDir = path.join(tmpDir, 'ts-single-quotes');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'cerial.config.ts'),
      `export default defineConfig({
  schema: './schemas',
  output: './out',
});`,
    );

    const config = loadCerialConfig(configDir);

    expect(config).not.toBeNull();
    expect(config!.schema).toBe('./schemas');
  });

  test('TS config with comments parses correctly', () => {
    const configDir = path.join(tmpDir, 'ts-comments');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'cerial.config.ts'),
      `export default defineConfig({
  // Schema location
  schema: './schemas',
  /* Output dir */
  output: './generated',
});`,
    );

    const config = loadCerialConfig(configDir);

    expect(config).not.toBeNull();
    expect(config!.schema).toBe('./schemas');
    expect(config!.output).toBe('./generated');
  });

  test('multi-schema config with schemas field', () => {
    const configDir = path.join(tmpDir, 'multi-schema');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'cerial.config.json'),
      JSON.stringify({
        schemas: {
          auth: { path: './schemas/auth', output: './generated/auth' },
          core: { path: './schemas/core', output: './generated/core' },
        },
      }),
    );

    const config = loadCerialConfig(configDir);

    expect(config).not.toBeNull();
    expect(config!.schemas).toBeDefined();
    expect(config!.schemas!.auth).toBeDefined();
    expect(config!.schemas!.core).toBeDefined();
  });
});

describe('findCerialFiles', () => {
  test('finds .cerial files recursively', () => {
    const searchDir = path.join(tmpDir, 'find-files');
    const subDir = path.join(searchDir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(searchDir, 'root.cerial'), 'model A { id Record @id }');
    fs.writeFileSync(path.join(subDir, 'nested.cerial'), 'model B { id Record @id }');
    fs.writeFileSync(path.join(searchDir, 'readme.md'), '# not a cerial file');

    const files = findCerialFiles(searchDir);

    expect(files.length).toBe(2);
    expect(files.some((f) => f.endsWith('root.cerial'))).toBe(true);
    expect(files.some((f) => f.endsWith('nested.cerial'))).toBe(true);
  });

  test('skips node_modules directory', () => {
    const searchDir = path.join(tmpDir, 'skip-nm');
    const nmDir = path.join(searchDir, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(searchDir, 'main.cerial'), 'model A { id Record @id }');
    fs.writeFileSync(path.join(nmDir, 'dep.cerial'), 'model Dep { id Record @id }');

    const files = findCerialFiles(searchDir);

    expect(files.length).toBe(1);
    expect(files[0]!.endsWith('main.cerial')).toBe(true);
  });

  test('skips .git directory', () => {
    const searchDir = path.join(tmpDir, 'skip-git');
    const gitDir = path.join(searchDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(searchDir, 'main.cerial'), 'model A { id Record @id }');
    fs.writeFileSync(path.join(gitDir, 'hook.cerial'), 'model X { id Record @id }');

    const files = findCerialFiles(searchDir);

    expect(files.length).toBe(1);
  });

  test('skips dist directory', () => {
    const searchDir = path.join(tmpDir, 'skip-dist');
    const distDir = path.join(searchDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(searchDir, 'main.cerial'), 'model A { id Record @id }');
    fs.writeFileSync(path.join(distDir, 'built.cerial'), 'model B { id Record @id }');

    const files = findCerialFiles(searchDir);

    expect(files.length).toBe(1);
  });

  test('returns empty array for non-existent directory', () => {
    const files = findCerialFiles(path.join(tmpDir, 'nonexistent'));

    expect(files).toEqual([]);
  });

  test('returns empty array for empty directory', () => {
    const emptyDir = path.join(tmpDir, 'empty-find');
    fs.mkdirSync(emptyDir, { recursive: true });

    const files = findCerialFiles(emptyDir);

    expect(files).toEqual([]);
  });
});
