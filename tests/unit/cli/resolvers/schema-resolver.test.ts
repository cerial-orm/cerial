import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import {
  CONVENTION_MARKERS,
  discoverSchemas,
  findSchemaRoots,
  findSchemasInDir,
  resolveSchemas,
  resolveSinglePath,
  type SchemaRoot,
} from '../../../../src/cli/resolvers';

const FIXTURES = resolve(__dirname, '../../../fixtures/schema-discovery');

describe('CONVENTION_MARKERS', () => {
  it('should contain exactly three markers in priority order', () => {
    expect(CONVENTION_MARKERS).toEqual(['schema.cerial', 'main.cerial', 'index.cerial']);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(CONVENTION_MARKERS)).toBe(true);
  });
});

describe('findSchemaRoots', () => {
  describe('single marker detection', () => {
    it('should find a folder with schema.cerial marker', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'with-marker'));

      expect(roots).toHaveLength(1);
      expect(roots[0]!.path).toBe(resolve(FIXTURES, 'with-marker/auth'));
      expect(roots[0]!.marker).toBe('schema.cerial');
    });

    it('should include all .cerial files in the root folder', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'with-marker'));

      expect(roots[0]!.files).toHaveLength(2);
      expect(roots[0]!.files).toContain(resolve(FIXTURES, 'with-marker/auth/schema.cerial'));
      expect(roots[0]!.files).toContain(resolve(FIXTURES, 'with-marker/auth/user.cerial'));
    });
  });

  describe('multiple markers', () => {
    it('should find multiple schema roots', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'multi-marker'));

      expect(roots).toHaveLength(2);
      const paths = roots.map((r: SchemaRoot) => r.path).sort();
      expect(paths).toContain(resolve(FIXTURES, 'multi-marker/auth'));
      expect(paths).toContain(resolve(FIXTURES, 'multi-marker/cms'));
    });

    it('should detect different marker types across roots', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'multi-marker'));

      const authRoot = roots.find((r: SchemaRoot) => r.path.endsWith('/auth'));
      const cmsRoot = roots.find((r: SchemaRoot) => r.path.endsWith('/cms'));

      expect(authRoot).toBeDefined();
      expect(authRoot!.marker).toBe('schema.cerial');

      expect(cmsRoot).toBeDefined();
      expect(cmsRoot!.marker).toBe('main.cerial');
    });

    it('should collect all .cerial files per root', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'multi-marker'));

      const authRoot = roots.find((r: SchemaRoot) => r.path.endsWith('/auth'));
      expect(authRoot!.files).toHaveLength(2);

      const cmsRoot = roots.find((r: SchemaRoot) => r.path.endsWith('/cms'));
      expect(cmsRoot!.files).toHaveLength(2);
    });
  });

  describe('all marker types', () => {
    it('should detect schema.cerial as a marker', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'all-markers/schema-marker'));

      expect(roots).toHaveLength(1);
      expect(roots[0]!.marker).toBe('schema.cerial');
    });

    it('should detect main.cerial as a marker', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'all-markers/main-marker'));

      expect(roots).toHaveLength(1);
      expect(roots[0]!.marker).toBe('main.cerial');
    });

    it('should detect index.cerial as a marker', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'all-markers/index-marker'));

      expect(roots).toHaveLength(1);
      expect(roots[0]!.marker).toBe('index.cerial');
    });

    it('should find all three marker types when scanning parent', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'all-markers'));

      expect(roots).toHaveLength(3);
      const markers = roots.map((r: SchemaRoot) => r.marker).sort();
      expect(markers).toEqual(['index.cerial', 'main.cerial', 'schema.cerial']);
    });
  });

  describe('no markers', () => {
    it('should return empty array when no markers exist', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'single-no-marker'));

      expect(roots).toEqual([]);
    });

    it('should return empty array for non-existent directory', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'does-not-exist'));

      expect(roots).toEqual([]);
    });
  });

  describe('cwd default', () => {
    it('should default to process.cwd()', async () => {
      const roots = await findSchemaRoots();

      expect(Array.isArray(roots)).toBe(true);
    });
  });

  describe('node_modules skip', () => {
    it('should skip node_modules directories', async () => {
      const roots = await findSchemaRoots(resolve(FIXTURES, 'with-marker'));

      for (const root of roots) {
        expect(root.path).not.toContain('node_modules/');
      }
    });
  });
});

describe('discoverSchemas', () => {
  describe('single root found', () => {
    it('should return single discovered schema without name', async () => {
      const schemas = await discoverSchemas(resolve(FIXTURES, 'with-marker'));

      expect(schemas).toHaveLength(1);
      expect(schemas[0]!.name).toBeUndefined();
    });

    it('should include path and files from the root', async () => {
      const schemas = await discoverSchemas(resolve(FIXTURES, 'with-marker'));

      expect(schemas[0]!.path).toBe(resolve(FIXTURES, 'with-marker/auth'));
      expect(schemas[0]!.files).toHaveLength(2);
      expect(schemas[0]!.files).toContain(resolve(FIXTURES, 'with-marker/auth/schema.cerial'));
      expect(schemas[0]!.files).toContain(resolve(FIXTURES, 'with-marker/auth/user.cerial'));
    });
  });

  describe('multiple roots found', () => {
    it('should throw error with root count and paths', async () => {
      await expect(discoverSchemas(resolve(FIXTURES, 'multi-marker'))).rejects.toThrow(/Found 2 schema roots/);
    });

    it('should include comma-separated paths in error', async () => {
      try {
        await discoverSchemas(resolve(FIXTURES, 'multi-marker'));
        expect.unreachable('should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('auth');
        expect(message).toContain('cms');
        expect(message).toContain("Create a cerial.config.ts to configure them. Run 'cerial init' to get started.");
      }
    });

    it('should throw with three roots', async () => {
      await expect(discoverSchemas(resolve(FIXTURES, 'all-markers'))).rejects.toThrow(/Found 3 schema roots/);
    });
  });

  describe('zero markers — legacy fallback', () => {
    it('should fall back to resolveSchemas when no markers found', async () => {
      const schemas = await discoverSchemas(resolve(FIXTURES, 'single-no-marker'));

      expect(schemas).toHaveLength(1);
      expect(schemas[0]!.files).toHaveLength(1);
      expect(schemas[0]!.files[0]).toContain('user.cerial');
    });

    it('should return empty array when no markers and no legacy schemas', async () => {
      const schemas = await discoverSchemas(resolve(FIXTURES, 'does-not-exist'));

      expect(schemas).toEqual([]);
    });

    it('should set path to cwd for legacy fallback', async () => {
      const cwd = resolve(FIXTURES, 'single-no-marker');
      const schemas = await discoverSchemas(cwd);

      if (schemas.length) {
        expect(schemas[0]!.path).toBe(cwd);
      }
    });

    it('should not assign name for legacy fallback', async () => {
      const schemas = await discoverSchemas(resolve(FIXTURES, 'single-no-marker'));

      if (schemas.length) {
        expect(schemas[0]!.name).toBeUndefined();
      }
    });
  });
});

describe('existing functions (preserved)', () => {
  describe('findSchemasInDir', () => {
    it('should find .cerial files in a directory', async () => {
      const files = await findSchemasInDir(resolve(FIXTURES, 'with-marker/auth'), ['**/*.cerial']);

      expect(files).toHaveLength(2);
      expect(files).toContain(resolve(FIXTURES, 'with-marker/auth/schema.cerial'));
      expect(files).toContain(resolve(FIXTURES, 'with-marker/auth/user.cerial'));
    });

    it('should return empty for non-existent dir', async () => {
      const files = await findSchemasInDir(resolve(FIXTURES, 'nope'), ['**/*.cerial']);

      expect(files).toEqual([]);
    });
  });

  describe('resolveSchemas', () => {
    it('should find schemas using default search paths', async () => {
      const files = await resolveSchemas({ cwd: resolve(FIXTURES, 'single-no-marker') });

      expect(files).toHaveLength(1);
      expect(files[0]).toContain('user.cerial');
    });

    it('should return empty when no search paths match', async () => {
      const files = await resolveSchemas({ cwd: resolve(FIXTURES, 'does-not-exist') });

      expect(files).toEqual([]);
    });
  });

  describe('resolveSinglePath', () => {
    it('should resolve a single .cerial file', async () => {
      const filePath = resolve(FIXTURES, 'with-marker/auth/user.cerial');
      const files = await resolveSinglePath(filePath);

      expect(files).toEqual([filePath]);
    });

    it('should resolve a directory to all .cerial files', async () => {
      const dirPath = resolve(FIXTURES, 'with-marker/auth');
      const files = await resolveSinglePath(dirPath);

      expect(files).toHaveLength(2);
    });
  });
});
