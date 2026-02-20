import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  detectNestedConfigs,
  findFolderConfigs,
  loadFolderConfig,
  validateFolderConfig,
} from '../../../../src/cli/config';

const PROJECT_TMP = resolve(__dirname, '../../../../tmp-schema-generates');
let TMP_ROOT: string;

beforeAll(async () => {
  TMP_ROOT = join(PROJECT_TMP, `cerial-folder-config-${Date.now()}`);
  await mkdir(TMP_ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(TMP_ROOT, { recursive: true, force: true });
});

describe('validateFolderConfig', () => {
  it('should accept empty object', () => {
    const result = validateFolderConfig({});

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept { output }', () => {
    const result = validateFolderConfig({ output: './generated' });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept { connection }', () => {
    const result = validateFolderConfig({
      connection: { url: 'http://localhost:8000', namespace: 'main', database: 'main' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept { output, connection }', () => {
    const result = validateFolderConfig({
      output: './generated',
      connection: { url: 'http://localhost:8000' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject { schema }', () => {
    const result = validateFolderConfig({ schema: './foo' });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.field).toBe('schema');
    expect(result.errors[0]!.message).toContain('must not contain');
  });

  it('should reject { schemas }', () => {
    const result = validateFolderConfig({ schemas: { a: { path: './a' } } });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.field).toBe('schemas');
    expect(result.errors[0]!.message).toContain('must not contain');
  });

  it('should reject { schema, output } — both schema and output present', () => {
    const result = validateFolderConfig({ schema: './foo', output: './generated' });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'schema')).toBe(true);
  });

  it('should reject { schema, schemas } — both keys present', () => {
    const result = validateFolderConfig({ schema: './foo', schemas: {} });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('should reject non-string output', () => {
    const result = validateFolderConfig({ output: 123 });

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field).toBe('output');
  });

  it('should reject non-object connection', () => {
    const result = validateFolderConfig({ connection: 'http://localhost' });

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field).toBe('connection');
  });

  it('should reject null connection', () => {
    const result = validateFolderConfig({ connection: null });

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field).toBe('connection');
  });
});

describe('detectNestedConfigs', () => {
  it('should pass with non-overlapping paths', () => {
    expect(() => {
      detectNestedConfigs(['/a/b', '/c/d', '/e/f']);
    }).not.toThrow();
  });

  it('should pass with empty array', () => {
    expect(() => {
      detectNestedConfigs([]);
    }).not.toThrow();
  });

  it('should pass with single path', () => {
    expect(() => {
      detectNestedConfigs(['/a/b']);
    }).not.toThrow();
  });

  it('should throw with nested paths (parent contains child)', () => {
    expect(() => {
      detectNestedConfigs(['/a/b', '/a/b/c']);
    }).toThrow(/Nested configs detected/);
  });

  it('should throw with nested paths (child before parent)', () => {
    expect(() => {
      detectNestedConfigs(['/a/b/c', '/a/b']);
    }).toThrow(/Nested configs detected/);
  });

  it('should include parent and child in error message', () => {
    try {
      detectNestedConfigs(['/project/schemas', '/project/schemas/auth']);
      expect(true).toBe(false);
    } catch (error) {
      const msg = String(error);
      expect(msg).toContain('/project/schemas');
      expect(msg).toContain('/project/schemas/auth');
    }
  });

  it('should handle backslash separators', () => {
    expect(() => {
      detectNestedConfigs(['\\a\\b', '\\a\\b\\c']);
    }).toThrow(/Nested configs detected/);
  });

  it('should not detect sibling paths as nested', () => {
    expect(() => {
      detectNestedConfigs(['/a/b', '/a/c']);
    }).not.toThrow();
  });

  it('should not false-positive on paths with shared prefix but different names', () => {
    expect(() => {
      detectNestedConfigs(['/schemas/auth', '/schemas/auth-v2']);
    }).not.toThrow();
  });
});

describe('loadFolderConfig', () => {
  it('should return null when no config in dir', async () => {
    const dir = resolve(TMP_ROOT, 'empty-dir');
    await Bun.write(resolve(dir, '.gitkeep'), '');

    const result = await loadFolderConfig(dir);

    expect(result).toBeNull();
  });

  it('should return FolderConfig for valid .ts config', async () => {
    const dir = resolve(TMP_ROOT, 'valid-ts');
    await Bun.write(resolve(dir, 'cerial.config.ts'), 'export default { output: "./generated" };\n');

    const result = await loadFolderConfig(dir);

    expect(result).toBeDefined();
    expect(result!.output).toBe('./generated');
  });

  it('should return FolderConfig for valid .json config', async () => {
    const dir = resolve(TMP_ROOT, 'valid-json');
    await Bun.write(resolve(dir, 'cerial.config.json'), '{ "output": "./generated" }\n');

    const result = await loadFolderConfig(dir);

    expect(result).toBeDefined();
    expect(result!.output).toBe('./generated');
  });

  it('should return FolderConfig with connection', async () => {
    const dir = resolve(TMP_ROOT, 'with-connection');
    await Bun.write(
      resolve(dir, 'cerial.config.ts'),
      'export default { output: "./out", connection: { url: "http://localhost:8000" } };\n',
    );

    const result = await loadFolderConfig(dir);

    expect(result).toBeDefined();
    expect(result!.output).toBe('./out');
    expect(result!.connection).toBeDefined();
  });

  it('should return FolderConfig for empty config', async () => {
    const dir = resolve(TMP_ROOT, 'empty-config');
    await Bun.write(resolve(dir, 'cerial.config.ts'), 'export default {};\n');

    const result = await loadFolderConfig(dir);

    expect(result).toBeDefined();
    expect(result!.output).toBeUndefined();
    expect(result!.connection).toBeUndefined();
  });

  it('should throw when config has schema key', async () => {
    const dir = resolve(TMP_ROOT, 'with-schema');
    await Bun.write(resolve(dir, 'cerial.config.ts'), 'export default { schema: "./foo", output: "./gen" };\n');

    await expect(async () => {
      await loadFolderConfig(dir);
    }).toThrow(/must not contain 'schema'/);
  });

  it('should throw when config has schemas key', async () => {
    const dir = resolve(TMP_ROOT, 'with-schemas');
    await Bun.write(resolve(dir, 'cerial.config.ts'), 'export default { schemas: { a: { path: "./a" } } };\n');

    await expect(async () => {
      await loadFolderConfig(dir);
    }).toThrow(/must not contain 'schemas'/);
  });

  it('should prefer .ts over .json when both exist', async () => {
    const dir = resolve(TMP_ROOT, 'prefer-ts');
    await Bun.write(resolve(dir, 'cerial.config.ts'), 'export default { output: "./from-ts" };\n');
    await Bun.write(resolve(dir, 'cerial.config.json'), '{ "output": "./from-json" }\n');

    const result = await loadFolderConfig(dir);

    expect(result).toBeDefined();
    expect(result!.output).toBe('./from-ts');
  });
});

describe('findFolderConfigs', () => {
  it('should find configs in subdirectories', async () => {
    const root = resolve(TMP_ROOT, 'discovery');
    await Bun.write(resolve(root, 'auth/cerial.config.ts'), 'export default { output: "./auth-client" };\n');
    await Bun.write(resolve(root, 'cms/cerial.config.ts'), 'export default { output: "./cms-client" };\n');

    const results = await findFolderConfigs(root);

    expect(results.length).toBe(2);
    const dirs = results.map((r) => r.dir);
    expect(dirs.some((d) => basename(d) === 'auth')).toBe(true);
    expect(dirs.some((d) => basename(d) === 'cms')).toBe(true);
  });

  it('should ignore root-level config', async () => {
    const root = resolve(TMP_ROOT, 'root-only');
    await Bun.write(resolve(root, 'cerial.config.ts'), 'export default { output: "./gen" };\n');

    const results = await findFolderConfigs(root);

    expect(results).toHaveLength(0);
  });

  it('should detect nested configs and throw', async () => {
    const root = resolve(TMP_ROOT, 'nested');
    await Bun.write(resolve(root, 'parent/cerial.config.ts'), 'export default { output: "./gen" };\n');
    await Bun.write(resolve(root, 'parent/child/cerial.config.ts'), 'export default { output: "./gen" };\n');

    await expect(async () => {
      await findFolderConfigs(root);
    }).toThrow(/Nested configs detected/);
  });

  it('should return empty array when no subfolder configs exist', async () => {
    const root = resolve(TMP_ROOT, 'no-configs');
    await Bun.write(resolve(root, '.gitkeep'), '');

    const results = await findFolderConfigs(root);

    expect(results).toHaveLength(0);
  });

  it('should load config values from found configs', async () => {
    const root = resolve(TMP_ROOT, 'discovery-values');
    await Bun.write(resolve(root, 'auth/cerial.config.ts'), 'export default { output: "./auth-out" };\n');

    const results = await findFolderConfigs(root);
    const authConfig = results.find((r) => basename(r.dir) === 'auth');

    expect(authConfig).toBeDefined();
    expect(authConfig!.config.output).toBe('./auth-out');
  });

  it('should deduplicate dirs when both .ts and .json exist', async () => {
    const root = resolve(TMP_ROOT, 'dedup');
    await Bun.write(resolve(root, 'schema/cerial.config.ts'), 'export default { output: "./ts-out" };\n');
    await Bun.write(resolve(root, 'schema/cerial.config.json'), '{ "output": "./json-out" }\n');

    const results = await findFolderConfigs(root);

    expect(results).toHaveLength(1);
    expect(results[0]!.config.output).toBe('./ts-out');
  });
});
