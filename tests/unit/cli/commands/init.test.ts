import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DetectedSchema } from '../../../../src/cli/commands/init';
import {
  deriveSchemaName,
  detectSchemaFolders,
  findExistingConfig,
  generateConfigContent,
  generateJsonConfig,
  generateTsConfig,
  getConfigFilename,
  toRelativePath,
} from '../../../../src/cli/commands/init';

const PROJECT_TMP = resolve(__dirname, '../../../../tmp-schema-generates');

function createTempDir(): string {
  const dir = join(PROJECT_TMP, `cerial-init-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });

  return dir;
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe('init command', () => {
  describe('deriveSchemaName', () => {
    it('should extract basename from path', () => {
      expect(deriveSchemaName('/foo/bar/auth')).toBe('auth');
    });

    it('should handle single segment', () => {
      expect(deriveSchemaName('schemas')).toBe('schemas');
    });

    it('should handle nested path', () => {
      expect(deriveSchemaName('/project/schemas/cms')).toBe('cms');
    });

    it('should handle trailing slash stripped by resolve', () => {
      expect(deriveSchemaName('/project/schemas/auth')).toBe('auth');
    });
  });

  describe('toRelativePath', () => {
    it('should convert absolute to relative with ./ prefix', () => {
      expect(toRelativePath('/project/schemas', '/project')).toBe('./schemas');
    });

    it('should handle nested paths', () => {
      expect(toRelativePath('/project/schemas/auth', '/project')).toBe('./schemas/auth');
    });

    it('should handle same directory', () => {
      expect(toRelativePath('/project', '/project')).toBe('./');
    });

    it('should handle parent paths', () => {
      const result = toRelativePath('/other/schemas', '/project');

      expect(result).toBe('../other/schemas');
    });
  });

  describe('findExistingConfig', () => {
    it('should return null when no config exists', () => {
      const dir = createTempDir();

      try {
        expect(findExistingConfig(dir)).toBeNull();
      } finally {
        cleanupDir(dir);
      }
    });

    it('should detect cerial.config.ts', () => {
      const dir = createTempDir();
      writeFileSync(join(dir, 'cerial.config.ts'), 'export default {}');

      try {
        expect(findExistingConfig(dir)).toBe('cerial.config.ts');
      } finally {
        cleanupDir(dir);
      }
    });

    it('should detect cerial.config.json', () => {
      const dir = createTempDir();
      writeFileSync(join(dir, 'cerial.config.json'), '{}');

      try {
        expect(findExistingConfig(dir)).toBe('cerial.config.json');
      } finally {
        cleanupDir(dir);
      }
    });

    it('should prefer cerial.config.ts over cerial.config.json', () => {
      const dir = createTempDir();
      writeFileSync(join(dir, 'cerial.config.ts'), 'export default {}');
      writeFileSync(join(dir, 'cerial.config.json'), '{}');

      try {
        expect(findExistingConfig(dir)).toBe('cerial.config.ts');
      } finally {
        cleanupDir(dir);
      }
    });
  });

  describe('getConfigFilename', () => {
    it('should return cerial.config.ts for typescript', () => {
      expect(getConfigFilename('typescript')).toBe('cerial.config.ts');
    });

    it('should return cerial.config.json for json', () => {
      expect(getConfigFilename('json')).toBe('cerial.config.json');
    });
  });

  describe('generateTsConfig', () => {
    it('should generate default config when no schemas detected', () => {
      const result = generateTsConfig([]);

      expect(result).toContain("import { defineConfig } from 'cerial'");
      expect(result).toContain("schema: './schemas'");
      expect(result).toContain("output: './client'");
      expect(result).toContain('export default defineConfig({');
    });

    it('should generate single-schema shorthand', () => {
      const schemas: DetectedSchema[] = [{ name: 'schemas', path: './schemas' }];
      const result = generateTsConfig(schemas);

      expect(result).toContain("schema: './schemas'");
      expect(result).toContain("output: './client'");
      expect(result).not.toContain('schemas: {');
    });

    it('should generate single-schema with custom path', () => {
      const schemas: DetectedSchema[] = [{ name: 'db', path: './db/schema' }];
      const result = generateTsConfig(schemas);

      expect(result).toContain("schema: './db/schema'");
      expect(result).toContain("output: './client'");
    });

    it('should generate multi-schema map', () => {
      const schemas: DetectedSchema[] = [
        { name: 'auth', path: './schemas/auth' },
        { name: 'cms', path: './schemas/cms' },
      ];
      const result = generateTsConfig(schemas);

      expect(result).toContain('schemas: {');
      expect(result).toContain("auth: { path: './schemas/auth' },");
      expect(result).toContain("cms: { path: './schemas/cms' },");
      expect(result).not.toContain("schema: '");
      expect(result).not.toContain('output:');
    });

    it('should generate multi-schema with three schemas', () => {
      const schemas: DetectedSchema[] = [
        { name: 'auth', path: './schemas/auth' },
        { name: 'cms', path: './schemas/cms' },
        { name: 'billing', path: './schemas/billing' },
      ];
      const result = generateTsConfig(schemas);

      expect(result).toContain("auth: { path: './schemas/auth' },");
      expect(result).toContain("cms: { path: './schemas/cms' },");
      expect(result).toContain("billing: { path: './schemas/billing' },");
    });

    it('should use single quotes throughout', () => {
      const schemas: DetectedSchema[] = [{ name: 'auth', path: './schemas/auth' }];
      const result = generateTsConfig(schemas);

      expect(result).not.toMatch(/"cerial"/);
      expect(result).not.toMatch(/"\.\/schemas\/auth"/);
    });

    it('should end with trailing newline', () => {
      expect(generateTsConfig([])).toEndWith('\n');
      expect(generateTsConfig([{ name: 'a', path: './a' }])).toEndWith('\n');
      expect(
        generateTsConfig([
          { name: 'a', path: './a' },
          { name: 'b', path: './b' },
        ]),
      ).toEndWith('\n');
    });
  });

  describe('generateJsonConfig', () => {
    it('should generate default config when no schemas detected', () => {
      const result = generateJsonConfig([]);
      const parsed = JSON.parse(result);

      expect(parsed.schema).toBe('./schemas');
      expect(parsed.output).toBe('./client');
    });

    it('should generate single-schema shorthand', () => {
      const schemas: DetectedSchema[] = [{ name: 'schemas', path: './schemas' }];
      const result = generateJsonConfig(schemas);
      const parsed = JSON.parse(result);

      expect(parsed.schema).toBe('./schemas');
      expect(parsed.output).toBe('./client');
      expect(parsed.schemas).toBeUndefined();
    });

    it('should generate multi-schema map', () => {
      const schemas: DetectedSchema[] = [
        { name: 'auth', path: './schemas/auth' },
        { name: 'cms', path: './schemas/cms' },
      ];
      const result = generateJsonConfig(schemas);
      const parsed = JSON.parse(result);

      expect(parsed.schemas.auth.path).toBe('./schemas/auth');
      expect(parsed.schemas.cms.path).toBe('./schemas/cms');
      expect(parsed.schema).toBeUndefined();
    });

    it('should produce valid JSON', () => {
      const schemas: DetectedSchema[] = [
        { name: 'auth', path: './schemas/auth' },
        { name: 'cms', path: './schemas/cms' },
      ];
      const result = generateJsonConfig(schemas);

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should be pretty-printed with 2-space indent', () => {
      const result = generateJsonConfig([]);

      expect(result).toContain('  "schema"');
    });

    it('should end with trailing newline', () => {
      expect(generateJsonConfig([])).toEndWith('\n');
      expect(generateJsonConfig([{ name: 'a', path: './a' }])).toEndWith('\n');
    });
  });

  describe('generateConfigContent', () => {
    it('should delegate to generateTsConfig for typescript format', () => {
      const schemas: DetectedSchema[] = [{ name: 'auth', path: './schemas/auth' }];
      const result = generateConfigContent(schemas, 'typescript');

      expect(result).toContain("import { defineConfig } from 'cerial'");
    });

    it('should delegate to generateJsonConfig for json format', () => {
      const schemas: DetectedSchema[] = [{ name: 'auth', path: './schemas/auth' }];
      const result = generateConfigContent(schemas, 'json');
      const parsed = JSON.parse(result);

      expect(parsed.schema).toBe('./schemas/auth');
    });

    it('should handle empty schemas in both formats', () => {
      const ts = generateConfigContent([], 'typescript');
      const json = generateConfigContent([], 'json');

      expect(ts).toContain("schema: './schemas'");
      expect(JSON.parse(json).schema).toBe('./schemas');
    });

    it('should handle multi-schema in both formats', () => {
      const schemas: DetectedSchema[] = [
        { name: 'a', path: './a' },
        { name: 'b', path: './b' },
      ];
      const ts = generateConfigContent(schemas, 'typescript');
      const json = generateConfigContent(schemas, 'json');

      expect(ts).toContain('schemas: {');
      expect(JSON.parse(json).schemas.a.path).toBe('./a');
    });
  });

  describe('detectSchemaFolders', () => {
    it('should detect schemas with convention markers', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'schemas', 'auth'), { recursive: true });
      writeFileSync(join(dir, 'schemas', 'auth', 'schema.cerial'), 'model User { id Record @id }');
      writeFileSync(join(dir, 'schemas', 'auth', 'user.cerial'), 'model User { id Record @id }');

      try {
        const result = await detectSchemaFolders(dir);

        expect(result.length).toBe(1);
        expect(result[0]!.name).toBe('auth');
        expect(result[0]!.path).toContain('auth');
      } finally {
        cleanupDir(dir);
      }
    });

    it('should detect multiple schema roots with markers', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'schemas', 'auth'), { recursive: true });
      mkdirSync(join(dir, 'schemas', 'cms'), { recursive: true });
      writeFileSync(join(dir, 'schemas', 'auth', 'schema.cerial'), 'model User { id Record @id }');
      writeFileSync(join(dir, 'schemas', 'auth', 'user.cerial'), 'model User { id Record @id }');
      writeFileSync(join(dir, 'schemas', 'cms', 'schema.cerial'), 'model Page { id Record @id }');
      writeFileSync(join(dir, 'schemas', 'cms', 'page.cerial'), 'model Page { id Record @id }');

      try {
        const result = await detectSchemaFolders(dir);

        expect(result.length).toBe(2);
        const names = result.map((r) => r.name).sort();
        expect(names).toEqual(['auth', 'cms']);
      } finally {
        cleanupDir(dir);
      }
    });

    it('should use legacy fallback for schemas/ without markers', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'schemas'), { recursive: true });
      writeFileSync(join(dir, 'schemas', 'user.cerial'), 'model User { id Record @id }');

      try {
        const result = await detectSchemaFolders(dir);

        expect(result.length).toBe(1);
        expect(result[0]!.name).toBe('schemas');
        expect(result[0]!.path).toContain('schemas');
      } finally {
        cleanupDir(dir);
      }
    });

    it('should use legacy fallback for schema/ directory', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'schema'), { recursive: true });
      writeFileSync(join(dir, 'schema', 'user.cerial'), 'model User { id Record @id }');

      try {
        const result = await detectSchemaFolders(dir);

        expect(result.length).toBe(1);
        expect(result[0]!.name).toBe('schema');
      } finally {
        cleanupDir(dir);
      }
    });

    it('should detect multi-schema from subdirectories in legacy mode', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'schemas', 'auth'), { recursive: true });
      mkdirSync(join(dir, 'schemas', 'cms'), { recursive: true });
      writeFileSync(join(dir, 'schemas', 'auth', 'user.cerial'), 'model User { id Record @id }');
      writeFileSync(join(dir, 'schemas', 'cms', 'page.cerial'), 'model Page { id Record @id }');

      try {
        const result = await detectSchemaFolders(dir);

        expect(result.length).toBe(2);
        const names = result.map((r) => r.name).sort();
        expect(names).toEqual(['auth', 'cms']);
      } finally {
        cleanupDir(dir);
      }
    });

    it('should return empty array when no schemas found', async () => {
      const dir = createTempDir();

      try {
        const result = await detectSchemaFolders(dir);

        expect(result).toEqual([]);
      } finally {
        cleanupDir(dir);
      }
    });

    it('should skip empty directories in legacy fallback', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'schemas'), { recursive: true });

      try {
        const result = await detectSchemaFolders(dir);

        expect(result).toEqual([]);
      } finally {
        cleanupDir(dir);
      }
    });

    it('should filter out schema roots with no files', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'schemas', 'empty'), { recursive: true });
      writeFileSync(join(dir, 'schemas', 'empty', 'schema.cerial'), '');
      mkdirSync(join(dir, 'schemas', 'auth'), { recursive: true });
      writeFileSync(join(dir, 'schemas', 'auth', 'schema.cerial'), 'model User { id Record @id }');
      writeFileSync(join(dir, 'schemas', 'auth', 'user.cerial'), 'model User { id Record @id }');

      try {
        const result = await detectSchemaFolders(dir);
        const names = result.map((r) => r.name);

        expect(names).toContain('auth');
      } finally {
        cleanupDir(dir);
      }
    });
  });

  describe('parser -y/--yes flag', () => {
    it('should parse -y flag', async () => {
      const { parseArgs } = await import('../../../../src/cli/parser');
      const result = parseArgs(['-y']);

      expect(result.yes).toBe(true);
    });

    it('should parse --yes flag', async () => {
      const { parseArgs } = await import('../../../../src/cli/parser');
      const result = parseArgs(['--yes']);

      expect(result.yes).toBe(true);
    });

    it('should parse -y with other flags', async () => {
      const { parseArgs } = await import('../../../../src/cli/parser');
      const result = parseArgs(['-y', '-s', './schemas', '-o', './out']);

      expect(result.yes).toBe(true);
      expect(result.schema).toBe('./schemas');
      expect(result.output).toBe('./out');
    });

    it('should default to undefined when not provided', async () => {
      const { parseArgs } = await import('../../../../src/cli/parser');
      const result = parseArgs([]);

      expect(result.yes).toBeUndefined();
    });
  });

  describe('generated config snapshot', () => {
    it('should match expected TS single-schema output', () => {
      const expected = [
        "import { defineConfig } from 'cerial';",
        '',
        'export default defineConfig({',
        "  schema: './schemas',",
        "  output: './client',",
        '});',
        '',
      ].join('\n');

      expect(generateTsConfig([{ name: 'schemas', path: './schemas' }])).toBe(expected);
    });

    it('should match expected TS multi-schema output', () => {
      const expected = [
        "import { defineConfig } from 'cerial';",
        '',
        'export default defineConfig({',
        '  schemas: {',
        "    auth: { path: './schemas/auth' },",
        "    cms: { path: './schemas/cms' },",
        '  },',
        '});',
        '',
      ].join('\n');

      expect(
        generateTsConfig([
          { name: 'auth', path: './schemas/auth' },
          { name: 'cms', path: './schemas/cms' },
        ]),
      ).toBe(expected);
    });

    it('should match expected JSON single-schema output', () => {
      const expected = {
        schema: './schemas',
        output: './client',
      };

      expect(JSON.parse(generateJsonConfig([{ name: 'schemas', path: './schemas' }]))).toEqual(expected);
    });

    it('should match expected JSON multi-schema output', () => {
      const expected = {
        schemas: {
          auth: { path: './schemas/auth' },
          cms: { path: './schemas/cms' },
        },
      };

      expect(
        JSON.parse(
          generateJsonConfig([
            { name: 'auth', path: './schemas/auth' },
            { name: 'cms', path: './schemas/cms' },
          ]),
        ),
      ).toEqual(expected);
    });
  });

  describe('existing fixture detection', () => {
    const fixtureBase = join(__dirname, '..', '..', '..', 'fixtures', 'multi-schema');

    it('should detect markers in with-markers fixture', async () => {
      const dir = join(fixtureBase, 'with-markers');
      if (!existsSync(dir)) return;

      const result = await detectSchemaFolders(dir);

      expect(result.length).toBe(2);
      const names = result.map((r) => r.name).sort();
      expect(names).toEqual(['auth', 'cms']);
    });

    it('should detect single schema in single-schema fixture', async () => {
      const dir = join(fixtureBase, 'single-schema');
      if (!existsSync(dir)) return;

      const result = await detectSchemaFolders(dir);

      expect(result.length).toBe(1);
      expect(result[0]!.name).toBe('schemas');
    });

    it('should find existing config in with-config fixture', () => {
      const dir = join(fixtureBase, 'with-config');
      if (!existsSync(dir)) return;

      expect(findExistingConfig(dir)).toBe('cerial.config.ts');
    });

    it('should find existing JSON config in json-config fixture', () => {
      const dir = join(fixtureBase, 'json-config');
      if (!existsSync(dir)) return;

      expect(findExistingConfig(dir)).toBe('cerial.config.json');
    });
  });
});
