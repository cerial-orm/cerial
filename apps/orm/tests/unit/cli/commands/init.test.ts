import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findDuplicateClassNames, schemaNameProblem, validateConfig } from '../../../../src/cli/config';
import type { DetectedSchema } from '../../../../src/cli/commands/init';
import {
  deriveSchemaName,
  detectSchemaFolders,
  findExistingConfig,
  generateConfigContent,
  generateJsonConfig,
  generateTsConfig,
  getConfigFilename,
  findBackslashSchemaFiles,
  normalizeSchemaNames,
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
    const norm = (p: string) => p.replace(/\\/g, '/');

    it('should convert absolute to relative with ./ prefix', () => {
      expect(norm(toRelativePath('/project/schemas', '/project'))).toBe('./schemas');
    });

    it('should handle nested paths', () => {
      expect(norm(toRelativePath('/project/schemas/auth', '/project'))).toBe('./schemas/auth');
    });

    it('should handle same directory', () => {
      expect(norm(toRelativePath('/project', '/project'))).toBe('./');
    });

    it('should handle parent paths', () => {
      const result = toRelativePath('/other/schemas', '/project');

      expect(norm(result)).toBe('../other/schemas');
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
      expect(result).toContain("auth: { path: './schemas/auth', output: './schemas/auth/client' },");
      expect(result).toContain("cms: { path: './schemas/cms', output: './schemas/cms/client' },");
      expect(result).not.toContain("schema: '");
    });

    it('should generate multi-schema with three schemas', () => {
      const schemas: DetectedSchema[] = [
        { name: 'auth', path: './schemas/auth' },
        { name: 'cms', path: './schemas/cms' },
        { name: 'billing', path: './schemas/billing' },
      ];
      const result = generateTsConfig(schemas);

      expect(result).toContain("auth: { path: './schemas/auth', output: './schemas/auth/client' },");
      expect(result).toContain("cms: { path: './schemas/cms', output: './schemas/cms/client' },");
      expect(result).toContain("billing: { path: './schemas/billing', output: './schemas/billing/client' },");
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
      const { parseArgs } = await import('../../../../src/cli/compat');
      const result = parseArgs(['-y']);

      expect(result.yes).toBe(true);
    });

    it('should parse --yes flag', async () => {
      const { parseArgs } = await import('../../../../src/cli/compat');
      const result = parseArgs(['--yes']);

      expect(result.yes).toBe(true);
    });

    it('should parse -y with other flags', async () => {
      const { parseArgs } = await import('../../../../src/cli/compat');
      const result = parseArgs(['-y', '-s', './schemas', '-o', './out']);

      expect(result.yes).toBe(true);
      expect(result.schema).toBe('./schemas');
      expect(result.output).toBe('./out');
    });

    it('should default to undefined when not provided', async () => {
      const { parseArgs } = await import('../../../../src/cli/compat');
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
        "    auth: { path: './schemas/auth', output: './schemas/auth/client' },",
        "    cms: { path: './schemas/cms', output: './schemas/cms/client' },",
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
          auth: { path: './schemas/auth', output: './schemas/auth/client' },
          cms: { path: './schemas/cms', output: './schemas/cms/client' },
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

  describe('config built from data', () => {
    const PAYLOADS = [
      "x',y:console.log('INJECTED_INIT_SINGLE'),z:'",
      'a:0,b:console.log(0xC0FFEE),c',
      'it\'s\\ a "dir"\n',
    ];

    // Runs the generated module under bun with defineConfig stubbed, so only the config text can execute anything
    async function evaluate(content: string, dir: string): Promise<{ config: unknown; stdout: string }> {
      const file = join(dir, 'cerial.config.ts');
      writeFileSync(
        file,
        content.replace("import { defineConfig } from 'cerial';", 'const defineConfig = (c: unknown) => c;'),
      );
      const proc = Bun.spawn(
        ['bun', '-e', `console.log('@@' + JSON.stringify((await import(${JSON.stringify(file)})).default))`],
        {
          stdout: 'pipe',
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const [before, json] = stdout.split('@@');

      return { config: JSON.parse(json!), stdout: before! };
    }

    for (const payload of PAYLOADS) {
      it(`keeps ${JSON.stringify(payload)} as data and runs nothing`, async () => {
        const dir = createTempDir();

        try {
          const schemas: DetectedSchema[] = [
            { name: 'ok', path: './ok' },
            { name: payload, path: `./${payload}` },
          ];
          normalizeSchemaNames(schemas);
          const { config, stdout } = await evaluate(generateTsConfig(schemas), dir);

          expect(stdout).toBe('');
          const entries = (config as { schemas: Record<string, { path: string }> }).schemas;

          expect(Object.values(entries).map((e) => e.path)).toEqual(['./ok', `./${payload}`]);
          expect(Object.keys(entries).every((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))).toBe(true);
        } finally {
          cleanupDir(dir);
        }
      });

      it(`keeps a single schema path ${JSON.stringify(payload)} as data`, async () => {
        const dir = createTempDir();

        try {
          const { config, stdout } = await evaluate(generateTsConfig([{ name: 'x', path: `./${payload}` }]), dir);

          expect(stdout).toBe('');
          expect((config as { schema: string }).schema).toBe(`./${payload}`);
        } finally {
          cleanupDir(dir);
        }
      });
    }

    it('quotes a key that is not an identifier when called directly', async () => {
      const dir = createTempDir();

      try {
        const { config } = await evaluate(
          generateTsConfig([
            { name: 'user-db', path: './user-db' },
            { name: 'b', path: './b' },
          ]),
          dir,
        );

        expect(Object.keys((config as { schemas: object }).schemas)).toEqual(['user-db', 'b']);
      } finally {
        cleanupDir(dir);
      }
    });

    it('keeps a hyphenated folder name, which generate accepts, and derives a valid name for `a b`', () => {
      const schemas: DetectedSchema[] = [
        { name: 'user-db', path: './user-db' },
        { name: 'a b', path: './a b' },
      ];
      const notes = normalizeSchemaNames(schemas);

      expect(schemas.map((s) => s.name)).toEqual(['user-db', 'a_b']);
      expect(schemas[1]!.path).toBe('./a b');
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain("'a b'");
      expect(notes[0]).toContain("'a_b'");
    });

    it('derives names generate accepts for digit-leading, underscore-leading and prototype names', () => {
      const schemas: DetectedSchema[] = [
        { name: '1st', path: './1st' },
        { name: '_x', path: './x' },
        { name: '__proto__', path: './p' },
        { name: 'constructor', path: './c' },
        { name: '$x', path: './d' },
      ];
      normalizeSchemaNames(schemas);

      expect(schemas.map((s) => s.name)).toEqual(['st', 'x', 'proto__', 'constructor_', 'x_2']);
      for (const { name } of schemas) expect(schemaNameProblem(name)).toBeUndefined();
    });

    it('keeps names unique by derived client class, ignoring case', () => {
      const schemas: DetectedSchema[] = [
        { name: 'my-auth', path: './a' },
        { name: 'my_auth', path: './b' },
        { name: 'Auth', path: './c' },
        { name: 'auth', path: './d' },
      ];
      normalizeSchemaNames(schemas);

      expect(schemas.map((s) => s.name)).toEqual(['my-auth', 'my_auth_2', 'Auth', 'auth_2']);
      expect(findDuplicateClassNames(schemas.map((s) => s.name))).toBeUndefined();
    });

    it('leaves ordinary names untouched and silent', () => {
      const schemas: DetectedSchema[] = [
        { name: 'auth', path: './schemas/auth' },
        { name: 'my_cms', path: './schemas/my_cms' },
      ];

      expect(normalizeSchemaNames(schemas)).toEqual([]);
      expect(schemas.map((s) => s.name)).toEqual(['auth', 'my_cms']);
      expect(generateTsConfig(schemas)).toBe(
        [
          "import { defineConfig } from 'cerial';",
          '',
          'export default defineConfig({',
          '  schemas: {',
          "    auth: { path: './schemas/auth', output: './schemas/auth/client' },",
          "    my_cms: { path: './schemas/my_cms', output: './schemas/my_cms/client' },",
          '  },',
          '});',
          '',
        ].join('\n'),
      );
    });

    it('JSON config holds a __proto__ name as an own key', () => {
      const parsed = JSON.parse(
        generateJsonConfig([
          { name: '__proto__', path: './a' },
          { name: 'b', path: './b' },
        ]),
      );

      expect(Object.keys(parsed.schemas)).toEqual(['__proto__', 'b']);
    });

    it('derives around the names validateConfig refuses (default, index)', () => {
      const schemas: DetectedSchema[] = [
        { name: 'default', path: './default' },
        { name: 'index', path: './index' },
      ];
      normalizeSchemaNames(schemas);

      expect(schemas.map((s) => s.name)).toEqual(['default_', 'index_']);
      expect(validateConfig(JSON.parse(generateJsonConfig(schemas))).valid).toBe(true);
    });

    it('writes __proto__ as a computed key so it stays an own key', async () => {
      const dir = createTempDir();

      try {
        const { config } = await evaluate(
          generateTsConfig([
            { name: '__proto__', path: './a' },
            { name: 'b', path: './b' },
          ]),
          dir,
        );

        expect(Object.keys((config as { schemas: object }).schemas)).toEqual(['__proto__', 'b']);
      } finally {
        cleanupDir(dir);
      }
    });

    it('escapes control characters in the text it displays', () => {
      const schemas: DetectedSchema[] = [{ name: 'a\u001b[31m', path: './a\u001b[2J' }];
      const [note] = normalizeSchemaNames(schemas);

      expect(note).not.toContain('\u001b');
      expect(note).toContain('\\u001b');
    });

    it('words the note by reason', () => {
      const schemas: DetectedSchema[] = [
        { name: 'a_b', path: './x/a_b' },
        { name: 'a_b', path: './y/a_b' },
        { name: 'a b', path: './a b' },
      ];
      const notes = normalizeSchemaNames(schemas);

      expect(notes[0]).toContain('already used by another schema');
      expect(notes[0]).not.toContain('not a valid');
      expect(notes[1]).toContain('not a valid schema name');
    });

    it('reports schema files under a folder with a backslash in its name', async () => {
      const dir = createTempDir();
      mkdirSync(join(dir, 'a\\b'), { recursive: true });
      writeFileSync(join(dir, 'a\\b', 'x.cerial'), 'model A { id Record @id }');

      try {
        expect(await findBackslashSchemaFiles(dir)).toEqual(['a\\b/x.cerial']);
      } finally {
        cleanupDir(dir);
      }
    });

    describe('init then generate', () => {
      const SRC = resolve(__dirname, '../../../../src/cli/generate');

      async function generateIn(dir: string): Promise<{ code: number; out: string }> {
        const script = `const { generate } = await import(${JSON.stringify(SRC)}); const r = await generate({}); console.log(JSON.stringify(r)); process.exit(r.success ? 0 : 1)`;
        const proc = Bun.spawn(['bun', '-e', script], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
        const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());

        return { code: await proc.exited, out };
      }

      function layout(dir: string, folders: string[]): DetectedSchema[] {
        return folders.map((f, i) => {
          mkdirSync(join(dir, 'schemas', f), { recursive: true });
          writeFileSync(join(dir, 'schemas', f, 'm.cerial'), `model M${i} {\n  id Record @id\n  name String\n}`);

          return { name: f, path: `./schemas/${f}` };
        });
      }

      for (const folders of [['user-db'], ['user-db', 'auth'], ['a_b', 'a_b_2'], ['default', 'index']]) {
        it(`generate accepts the config init writes for ${folders.join(' + ')}`, async () => {
          const dir = createTempDir();

          try {
            const detected = layout(dir, folders);
            normalizeSchemaNames(detected);
            writeFileSync(join(dir, 'cerial.config.json'), generateJsonConfig(detected));
            const { code, out } = await generateIn(dir);

            expect({ code, out: code ? out : '' }).toEqual({ code: 0, out: '' });
          } finally {
            cleanupDir(dir);
          }
        });
      }
    });
  });
});
