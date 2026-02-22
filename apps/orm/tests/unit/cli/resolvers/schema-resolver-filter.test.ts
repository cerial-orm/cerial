import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { PathFilter } from '../../../../src/cli/filters/types';
import { NO_FILTER } from '../../../../src/cli/filters/types';
import { findFilteredSchemasInDir, resolveSchemas, resolveSinglePath } from '../../../../src/cli/resolvers';

// Temp directory for filter tests
const TMP_ROOT = resolve(tmpdir(), 'cerial-resolver-filter-tests');

function createTmpFile(relativePath: string, content = ''): string {
  const fullPath = resolve(TMP_ROOT, relativePath);
  const dir = resolve(fullPath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content);

  return fullPath;
}

beforeAll(() => {
  mkdirSync(TMP_ROOT, { recursive: true });

  // Create test schema files
  createTmpFile('schemas/user.cerial', 'model User {}');
  createTmpFile('schemas/post.cerial', 'model Post {}');
  createTmpFile('schemas/excluded.cerial', 'model Excluded {}');
  createTmpFile('schemas/internal/secret.cerial', 'model Secret {}');
  createTmpFile('schemas/internal/admin.cerial', 'model Admin {}');
  createTmpFile('schemas/public/api.cerial', 'model Api {}');
});

afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

// Helper filters
const excludeFilter: PathFilter = {
  shouldInclude: (path) => !path.includes('excluded'),
};

const excludeInternalFilter: PathFilter = {
  shouldInclude: (path) => !path.startsWith('internal/'),
};

const includeOnlyPublicFilter: PathFilter = {
  shouldInclude: (path) => path.startsWith('public/'),
};

describe('findFilteredSchemasInDir', () => {
  const schemasDir = resolve(TMP_ROOT, 'schemas');

  describe('with NO_FILTER', () => {
    it('should return all files (backward compat)', async () => {
      const files = await findFilteredSchemasInDir(schemasDir, ['**/*.cerial'], NO_FILTER);

      expect(files.length).toBeGreaterThanOrEqual(6);
      expect(files.some((f) => f.endsWith('user.cerial'))).toBe(true);
      expect(files.some((f) => f.endsWith('excluded.cerial'))).toBe(true);
      expect(files.some((f) => f.endsWith('secret.cerial'))).toBe(true);
    });
  });

  describe('with exclude filter', () => {
    it('should omit files matching exclude pattern', async () => {
      const files = await findFilteredSchemasInDir(schemasDir, ['**/*.cerial'], excludeFilter);

      expect(files.some((f) => f.endsWith('user.cerial'))).toBe(true);
      expect(files.some((f) => f.endsWith('post.cerial'))).toBe(true);
      expect(files.some((f) => f.endsWith('excluded.cerial'))).toBe(false);
    });

    it('should not affect non-matching files', async () => {
      const files = await findFilteredSchemasInDir(schemasDir, ['**/*.cerial'], excludeFilter);
      const nonExcluded = files.filter((f) => !f.includes('excluded'));

      expect(nonExcluded.length).toBe(files.length);
    });
  });

  describe('with directory exclude filter', () => {
    it('should omit entire directory of files', async () => {
      const files = await findFilteredSchemasInDir(schemasDir, ['**/*.cerial'], excludeInternalFilter);

      expect(files.some((f) => f.includes('internal'))).toBe(false);
      expect(files.some((f) => f.endsWith('user.cerial'))).toBe(true);
      expect(files.some((f) => f.endsWith('api.cerial'))).toBe(true);
    });
  });

  describe('with include-only filter', () => {
    it('should only return files matching include pattern', async () => {
      const files = await findFilteredSchemasInDir(schemasDir, ['**/*.cerial'], includeOnlyPublicFilter);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain('api.cerial');
    });
  });

  describe('filter receives relative paths', () => {
    it('should pass relative paths to filter.shouldInclude', async () => {
      const receivedPaths: string[] = [];
      const spyFilter: PathFilter = {
        shouldInclude: (path) => {
          receivedPaths.push(path);

          return true;
        },
      };

      await findFilteredSchemasInDir(schemasDir, ['**/*.cerial'], spyFilter);

      // All paths should be relative (no absolute path prefix)
      for (const p of receivedPaths) {
        expect(p.startsWith('/')).toBe(false);
        expect(p.includes('\\')).toBe(false); // Forward slashes only
      }

      // Should contain known relative paths
      expect(receivedPaths).toContain('user.cerial');
      expect(receivedPaths).toContain('post.cerial');
      expect(receivedPaths).toContain('excluded.cerial');
      expect(receivedPaths.some((p) => p === 'internal/secret.cerial')).toBe(true);
    });
  });

  describe('empty results', () => {
    it('should return empty array when all files excluded', async () => {
      const rejectAll: PathFilter = { shouldInclude: () => false };
      const files = await findFilteredSchemasInDir(schemasDir, ['**/*.cerial'], rejectAll);

      expect(files).toEqual([]);
    });

    it('should return empty array for non-existent directory', async () => {
      const files = await findFilteredSchemasInDir(resolve(TMP_ROOT, 'nope'), ['**/*.cerial'], NO_FILTER);

      expect(files).toEqual([]);
    });
  });
});

describe('resolveSinglePath with filter', () => {
  const schemasDir = resolve(TMP_ROOT, 'schemas');

  describe('without filter (backward compat)', () => {
    it('should resolve a single file', async () => {
      const filePath = resolve(schemasDir, 'user.cerial');
      const files = await resolveSinglePath(filePath);

      expect(files).toEqual([filePath]);
    });

    it('should resolve a directory to all files', async () => {
      const files = await resolveSinglePath(schemasDir);

      expect(files.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('with filter on single file', () => {
    it('should exclude a single file when filter rejects it', async () => {
      const filePath = resolve(schemasDir, 'excluded.cerial');
      const files = await resolveSinglePath(filePath, process.cwd(), excludeFilter);

      expect(files).toEqual([]);
    });

    it('should include a single file when filter accepts it', async () => {
      const filePath = resolve(schemasDir, 'user.cerial');
      const files = await resolveSinglePath(filePath, process.cwd(), excludeFilter);

      expect(files).toEqual([filePath]);
    });
  });

  describe('with filter on directory', () => {
    it('should apply filter to directory scan results', async () => {
      const files = await resolveSinglePath(schemasDir, process.cwd(), excludeInternalFilter);

      expect(files.some((f) => f.includes('internal'))).toBe(false);
      expect(files.some((f) => f.endsWith('user.cerial'))).toBe(true);
    });

    it('should return empty when filter rejects all', async () => {
      const rejectAll: PathFilter = { shouldInclude: () => false };
      const files = await resolveSinglePath(schemasDir, process.cwd(), rejectAll);

      expect(files).toEqual([]);
    });
  });
});

describe('resolveSchemas with filter', () => {
  describe('without filter (backward compat)', () => {
    it('should work exactly as before with custom paths', async () => {
      const files = await resolveSchemas({
        paths: [resolve(TMP_ROOT, 'schemas')],
      });

      expect(files.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('with filter and custom paths', () => {
    it('should apply filter to resolved files', async () => {
      const files = await resolveSchemas({
        paths: [resolve(TMP_ROOT, 'schemas')],
        filter: excludeFilter,
      });

      expect(files.some((f) => f.endsWith('excluded.cerial'))).toBe(false);
      expect(files.some((f) => f.endsWith('user.cerial'))).toBe(true);
    });

    it('should apply directory filter across all paths', async () => {
      const files = await resolveSchemas({
        paths: [resolve(TMP_ROOT, 'schemas')],
        filter: excludeInternalFilter,
      });

      expect(files.some((f) => f.includes('internal'))).toBe(false);
    });
  });

  describe('with filter and default search paths', () => {
    it('should apply filter when using default path discovery', async () => {
      const files = await resolveSchemas({
        cwd: TMP_ROOT,
        filter: excludeFilter,
      });

      // Default search discovers `schemas/` dir inside TMP_ROOT
      expect(files.some((f) => f.endsWith('excluded.cerial'))).toBe(false);
      if (files.length) {
        expect(files.some((f) => f.endsWith('user.cerial'))).toBe(true);
      }
    });
  });

  describe('with NO_FILTER', () => {
    it('should return all files when NO_FILTER passed', async () => {
      const files = await resolveSchemas({
        paths: [resolve(TMP_ROOT, 'schemas')],
        filter: NO_FILTER,
      });

      expect(files.some((f) => f.endsWith('excluded.cerial'))).toBe(true);
      expect(files.length).toBeGreaterThanOrEqual(6);
    });
  });
});
