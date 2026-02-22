import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import type { ResolvedSchemaEntry } from '../../../src/cli/config';
import { detectNestedSchemaRoots, validateCombinedEntries } from '../../../src/cli/config';
import type {
  GenerateResult,
  MultiGenerateResult,
  MultiSchemaOptions,
  SingleSchemaOptions,
} from '../../../src/cli/generate';
import {
  applyFolderOverridesAndDiscover,
  generate,
  generateMultiSchema,
  generateSingleSchema,
} from '../../../src/cli/generate';
import { findSchemaRoots } from '../../../src/cli/resolvers';
import { validateOptions } from '../../../src/cli/validators';

describe('generate orchestration', () => {
  describe('validateOptions', () => {
    it('should require -o when no config is set', () => {
      const result = validateOptions({});
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain('Output directory is required');
    });

    it('should pass when -o is provided without config', () => {
      const result = validateOptions({ output: './out' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass when config is set without -o', () => {
      const result = validateOptions({ config: './cerial.config.ts' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass when both config and -o are set', () => {
      const result = validateOptions({ config: './cerial.config.ts', output: './out' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('generateSingleSchema', () => {
    it('should return GenerateResult shape', async () => {
      const result = await generateSingleSchema({
        schemaPath: resolve(__dirname, '../../fixtures/nonexistent'),
        outputDir: '/tmp/cerial-test-out',
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.files)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should fail when schema path has no .cerial files', async () => {
      const result = await generateSingleSchema({
        schemaPath: resolve(__dirname, '../../fixtures/config'),
        outputDir: '/tmp/cerial-test-out',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No schema files found');
    });

    it('should accept optional clientClassName', async () => {
      const options: SingleSchemaOptions = {
        schemaPath: resolve(__dirname, '../../fixtures/nonexistent'),
        outputDir: '/tmp/cerial-test-out',
        clientClassName: 'MyClient',
      };

      const result = await generateSingleSchema(options);
      expect(result.success).toBe(false);
    });

    it('should default logLevel to minimal', async () => {
      const result = await generateSingleSchema({
        schemaPath: resolve(__dirname, '../../fixtures/nonexistent'),
        outputDir: '/tmp/cerial-test-out',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('generateMultiSchema', () => {
    it('should return MultiGenerateResult shape', async () => {
      const result = await generateMultiSchema([], { logLevel: 'minimal' });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('errors');
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should succeed with empty entries', async () => {
      const result = await generateMultiSchema([], {});

      expect(result.success).toBe(true);
      expect(Object.keys(result.results)).toHaveLength(0);
    });

    it('should aggregate errors from failed schemas', async () => {
      const entries = [
        {
          name: 'alpha',
          path: resolve(__dirname, '../../fixtures/nonexistent-alpha'),
          output: '/tmp/cerial-test-alpha',
          clientClassName: 'AlphaCerialClient',
        },
        {
          name: 'beta',
          path: resolve(__dirname, '../../fixtures/nonexistent-beta'),
          output: '/tmp/cerial-test-beta',
          clientClassName: 'BetaCerialClient',
        },
      ];

      const result = await generateMultiSchema(entries, { logLevel: 'minimal' });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some((e) => e.startsWith('[alpha]'))).toBe(true);
      expect(result.errors.some((e) => e.startsWith('[beta]'))).toBe(true);
    });

    it('should store individual results keyed by schema name', async () => {
      const entries = [
        {
          name: 'first',
          path: resolve(__dirname, '../../fixtures/nonexistent-first'),
          output: '/tmp/cerial-test-first',
          clientClassName: 'FirstCerialClient',
        },
      ];

      const result = await generateMultiSchema(entries, {});

      expect(result.results).toHaveProperty('first');
      expect(result.results.first).toHaveProperty('success');
      expect(result.results.first).toHaveProperty('files');
      expect(result.results.first).toHaveProperty('errors');
    });

    it('should pass options through to each schema', async () => {
      const entries = [
        {
          name: 'test',
          path: resolve(__dirname, '../../fixtures/nonexistent-test'),
          output: '/tmp/cerial-test-opts',
          clientClassName: 'TestCerialClient',
        },
      ];
      const options: MultiSchemaOptions = { logLevel: 'full', verbose: true, clean: false };
      const result = await generateMultiSchema(entries, options);

      expect(result.results.test?.success).toBe(false);
    });
  });

  describe('generate() orchestration', () => {
    it('should take -s flag path when schema is provided', async () => {
      const result = await generate({
        schema: resolve(__dirname, '../../fixtures/nonexistent'),
        output: '/tmp/cerial-test-out',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No schema files found');
    });

    it('should require -o in -s flag path', async () => {
      const result = await generate({
        schema: './some-path',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Output directory is required');
    });

    it('should fall through to legacy mode when no config found and no -s', async () => {
      const result = await generate({
        output: '/tmp/cerial-test-legacy',
      });

      // Legacy mode discovers schemas from CWD — succeeds if schemas exist in project
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('errors');
    });

    it('should fail when invoked without -o or config', async () => {
      const result = await generate({});

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return config load error when config path is invalid', async () => {
      const result = await generate({
        config: resolve(__dirname, '../../fixtures/config/invalid-json/cerial.config.json'),
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should try config path before falling to legacy', async () => {
      const result = await generate({
        config: resolve(__dirname, '../../fixtures/nonexistent-config.ts'),
        output: '/tmp/cerial-test-out',
      });

      expect(result.success).toBe(false);
    });

    it('should return error for -n with unknown schema name', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config/ts-config/cerial.config.ts');
      const result = await generate({
        config: configPath,
        name: 'nonexistent_schema',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("Schema 'nonexistent_schema' not found");
      expect(result.errors[0]).toContain('Available schemas:');
    });

    it('should apply -o override when config is present', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config/ts-config/cerial.config.ts');
      const result = await generate({
        config: configPath,
        output: '/tmp/cerial-test-override',
      });

      expect(result.success).toBe(false);
    });

    it('should return GenerateResult from generate() even in config mode', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config/ts-config/cerial.config.ts');
      const result = await generate({ config: configPath });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('errors');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.files)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    describe('convention marker no-root-config path', () => {
      const fixturesDir = resolve(__dirname, '../../fixtures/config-merge');

      it('should return GenerateResult shape from generate()', async () => {
        const result = await generate({ output: '/tmp/cerial-marker-test' });

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('files');
        expect(result).toHaveProperty('errors');
        expect(typeof result.success).toBe('boolean');
        expect(Array.isArray(result.files)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should fall through to legacy when no markers exist', async () => {
        const result = await generate({ output: '/tmp/cerial-legacy-fallthrough' });

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('files');
        expect(result).toHaveProperty('errors');
      });

      it('should find convention markers in fixture directory', async () => {
        const roots = await findSchemaRoots(resolve(fixturesDir, 'marker-at-root'));

        expect(roots.length).toBe(1);
        expect(roots[0]!.path).toBe(resolve(fixturesDir, 'marker-at-root'));
        expect(roots[0]!.marker).toBe('schema.cerial');
      });

      it('should return empty roots for directory without markers', async () => {
        const roots = await findSchemaRoots(resolve(fixturesDir, 'clean'));

        expect(roots).toHaveLength(0);
      });

      it('should throw for nested marker-to-marker roots', () => {
        const roots = [
          { path: '/project/schemas', type: 'convention-marker' as const },
          { path: '/project/schemas/sub', type: 'convention-marker' as const },
        ];

        expect(() => detectNestedSchemaRoots(roots)).toThrow(/Nested schema roots/);
      });

      it('should detect name collisions among discovered marker entries', () => {
        const entries: ResolvedSchemaEntry[] = [
          { name: 'dup', path: '/a/dup', output: '/out/a', clientClassName: 'DupCerialClient' },
          { name: 'dup', path: '/b/dup', output: '/out/b', clientClassName: 'DupCerialClient' },
        ];

        expect(() => validateCombinedEntries([], entries)).toThrow(/Duplicate schema name/);
      });

      it('should detect output collisions among discovered marker entries', () => {
        const entries: ResolvedSchemaEntry[] = [
          { name: 'alpha', path: '/a/alpha', output: '/shared/out', clientClassName: 'AlphaCerialClient' },
          { name: 'beta', path: '/b/beta', output: '/shared/out', clientClassName: 'BetaCerialClient' },
        ];

        expect(() => validateCombinedEntries([], entries)).toThrow(/output.*collides/);
      });
    });
  });

  describe('applyFolderOverridesAndDiscover', () => {
    const fixturesDir = resolve(__dirname, '../../fixtures/config-merge');

    describe('merge - folder config overrides', () => {
      it('should override entry output when folder config has output', async () => {
        const entryPath = resolve(fixturesDir, 'merge-output');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/original-output',
            clientClassName: 'TestCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, entryPath);

        expect(result[0]!.output).toBe(resolve(entryPath, './custom'));
      });

      it('should override entry connection when folder config has connection', async () => {
        const entryPath = resolve(fixturesDir, 'merge-connection');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/original-output',
            clientClassName: 'TestCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, entryPath);

        expect(result[0]!.connection).toEqual({ url: 'ws://custom:8000' });
      });

      it('should keep entry values when folder config has no overrides', async () => {
        const entryPath = resolve(fixturesDir, 'clean');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/original-output',
            clientClassName: 'TestCerialClient',
            connection: { url: 'ws://original:8000' },
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, entryPath);

        expect(result[0]!.output).toBe('/tmp/original-output');
        expect(result[0]!.connection).toEqual({ url: 'ws://original:8000' });
      });

      it('should partially override — output only, keep connection from root', async () => {
        const entryPath = resolve(fixturesDir, 'merge-output');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/original-output',
            clientClassName: 'TestCerialClient',
            connection: { url: 'ws://root:8000' },
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, entryPath);

        expect(result[0]!.output).toBe(resolve(entryPath, './custom'));
        expect(result[0]!.connection).toEqual({ url: 'ws://root:8000' });
      });

      it('should partially override — connection only, keep output from root', async () => {
        const entryPath = resolve(fixturesDir, 'merge-connection');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/original-output',
            clientClassName: 'TestCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, entryPath);

        expect(result[0]!.output).toBe('/tmp/original-output');
        expect(result[0]!.connection).toEqual({ url: 'ws://custom:8000' });
      });

      it('should preserve name and clientClassName through merge', async () => {
        const entryPath = resolve(fixturesDir, 'merge-output');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'mySchema',
            path: entryPath,
            output: '/tmp/original-output',
            clientClassName: 'MySchemaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, entryPath);

        expect(result[0]!.name).toBe('mySchema');
        expect(result[0]!.clientClassName).toBe('MySchemaCerialClient');
      });
    });

    describe('nested detection', () => {
      it('should throw when config exists inside root-defined path', async () => {
        const entryPath = resolve(fixturesDir, 'nested-config');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/test',
            clientClassName: 'TestCerialClient',
          },
        ];

        await expect(applyFolderOverridesAndDiscover(entries, entryPath)).rejects.toThrow('Found config file at');
      });

      it('should throw for deep nested config inside root-defined path', async () => {
        const entryPath = resolve(fixturesDir, 'deep-nested');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/test',
            clientClassName: 'TestCerialClient',
          },
        ];

        await expect(applyFolderOverridesAndDiscover(entries, entryPath)).rejects.toThrow('Found config file at');
      });
    });

    describe('coexistence discovery', () => {
      it('should auto-discover folder configs outside root paths', async () => {
        const cwdPath = resolve(fixturesDir, 'coexistence-root');
        const entryPath = resolve(cwdPath, 'schema-a');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'alpha',
            path: entryPath,
            output: '/tmp/alpha',
            clientClassName: 'AlphaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        expect(result).toHaveLength(2);
        expect(result[0]!.name).toBe('alpha');
        const discovered = result[1]!;
        expect(discovered.name).toBe('schema-b');
        expect(discovered.path).toBe(resolve(cwdPath, 'schema-b'));
        expect(discovered.output).toBe(resolve(cwdPath, 'schema-b', 'gen'));
        expect(discovered.clientClassName).toBe('SchemaBCerialClient');
      });

      it('should not duplicate entries for configs at root entry paths', async () => {
        const cwdPath = resolve(fixturesDir, 'coexistence-root');
        const entryPath = resolve(cwdPath, 'schema-b');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'beta',
            path: entryPath,
            output: '/tmp/beta',
            clientClassName: 'BetaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('beta');
        expect(result[0]!.output).toBe(resolve(entryPath, 'gen'));
      });

      it('should throw on name collision between root and discovered', async () => {
        const cwdPath = resolve(fixturesDir, 'collision-root');
        const entryPath = resolve(cwdPath, 'schema-a');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'collider',
            path: entryPath,
            output: '/tmp/collider',
            clientClassName: 'ColliderCerialClient',
          },
        ];

        await expect(applyFolderOverridesAndDiscover(entries, cwdPath)).rejects.toThrow(
          "Auto-discovered schema name 'collider' collides",
        );
      });
    });

    describe('convention marker coexistence', () => {
      it('should discover convention markers outside root paths', async () => {
        const cwdPath = resolve(fixturesDir, 'marker-outside');
        const entryPath = resolve(cwdPath, 'schema-a');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'alpha',
            path: entryPath,
            output: '/tmp/alpha',
            clientClassName: 'AlphaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        const markerEntry = result.find((e) => e.name === 'marker-dir');
        expect(markerEntry).toBeDefined();
        expect(markerEntry!.path).toBe(resolve(cwdPath, 'marker-dir'));
      });

      it('should NOT discover convention markers at root paths', async () => {
        const cwdPath = resolve(fixturesDir, 'marker-outside');
        const markerAtRootPath = resolve(fixturesDir, 'marker-at-root');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'alpha',
            path: markerAtRootPath,
            output: '/tmp/alpha',
            clientClassName: 'AlphaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        expect(result.find((e) => e.name === 'marker-at-root')).toBeUndefined();
      });

      it('should throw when convention marker found inside root path subdirectory', async () => {
        const cwdPath = resolve(fixturesDir, 'marker-nested');
        const entryPath = cwdPath;
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'root-schema',
            path: entryPath,
            output: '/tmp/root-schema',
            clientClassName: 'RootSchemaCerialClient',
          },
        ];

        await expect(applyFolderOverridesAndDiscover(entries, cwdPath)).rejects.toThrow(
          /Found convention marker at.*inside schema path/,
        );
      });

      it('should set output to resolve(dir, client) for marker entries', async () => {
        const cwdPath = resolve(fixturesDir, 'marker-outside');
        const entryPath = resolve(cwdPath, 'schema-a');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'alpha',
            path: entryPath,
            output: '/tmp/alpha',
            clientClassName: 'AlphaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        const markerEntry = result.find((e) => e.name === 'marker-dir');
        expect(markerEntry!.output).toBe(resolve(cwdPath, 'marker-dir', 'client'));
      });

      it('should set correct clientClassName for marker entries', async () => {
        const cwdPath = resolve(fixturesDir, 'marker-outside');
        const entryPath = resolve(cwdPath, 'schema-a');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'alpha',
            path: entryPath,
            output: '/tmp/alpha',
            clientClassName: 'AlphaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        const markerEntry = result.find((e) => e.name === 'marker-dir');
        expect(markerEntry!.clientClassName).toBe('MarkerDirCerialClient');
      });

      it('should use config.name for discovered folder configs when available', async () => {
        const cwdPath = resolve(fixturesDir, 'coexistence-root');
        const entryPath = resolve(cwdPath, 'schema-a');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'alpha',
            path: entryPath,
            output: '/tmp/alpha',
            clientClassName: 'AlphaCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        const discovered = result.find((e) => e.path === resolve(cwdPath, 'schema-b'));
        expect(discovered).toBeDefined();
        expect(discovered!.name).toBe('schema-b');
      });

      it('should deduplicate markers with same basename — first wins', async () => {
        const cwdPath = resolve(fixturesDir, 'marker-outside');
        const entries: ResolvedSchemaEntry[] = [];

        const result = await applyFolderOverridesAndDiscover(entries, cwdPath);

        const markerEntries = result.filter((e) => e.name === 'marker-dir');
        expect(markerEntries).toHaveLength(1);
      });
    });

    describe('backward compat', () => {
      it('should return original entries unchanged when no folder configs exist', async () => {
        const entryPath = resolve(fixturesDir, 'clean');
        const entries: ResolvedSchemaEntry[] = [
          {
            name: 'test',
            path: entryPath,
            output: '/tmp/test',
            clientClassName: 'TestCerialClient',
          },
        ];

        const result = await applyFolderOverridesAndDiscover(entries, entryPath);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(entries[0]);
      });

      it('should work with empty entries array', async () => {
        const result = await applyFolderOverridesAndDiscover([], resolve(fixturesDir, 'clean'));

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('type interfaces', () => {
    it('SingleSchemaOptions should accept all optional fields', () => {
      const opts: SingleSchemaOptions = {
        outputDir: '/tmp/out',
      };
      expect(opts.outputDir).toBe('/tmp/out');
      expect(opts.schemaPath).toBeUndefined();
      expect(opts.logLevel).toBeUndefined();
      expect(opts.verbose).toBeUndefined();
      expect(opts.clean).toBeUndefined();
      expect(opts.clientClassName).toBeUndefined();
    });

    it('SingleSchemaOptions should accept all fields', () => {
      const opts: SingleSchemaOptions = {
        schemaPath: './schemas',
        outputDir: '/tmp/out',
        logLevel: 'full',
        verbose: true,
        clean: true,
        clientClassName: 'MyClient',
      };
      expect(opts.schemaPath).toBe('./schemas');
      expect(opts.clientClassName).toBe('MyClient');
    });

    it('MultiSchemaOptions should accept all optional fields', () => {
      const opts: MultiSchemaOptions = {};
      expect(opts.logLevel).toBeUndefined();
      expect(opts.verbose).toBeUndefined();
      expect(opts.clean).toBeUndefined();
    });

    it('MultiGenerateResult should have correct shape', () => {
      const result: MultiGenerateResult = {
        success: true,
        results: {},
        errors: [],
      };
      expect(result.success).toBe(true);
      expect(typeof result.results).toBe('object');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('MultiGenerateResult.results should hold GenerateResult values', () => {
      const singleResult: GenerateResult = {
        success: true,
        files: ['/tmp/a.ts'],
        errors: [],
      };
      const result: MultiGenerateResult = {
        success: true,
        results: { mySchema: singleResult },
        errors: [],
      };
      expect(result.results.mySchema?.files).toEqual(['/tmp/a.ts']);
    });
  });
});
