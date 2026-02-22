import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findFolderConfigs } from '../../../../src/cli/config/loader';
import { resolvePathFilter } from '../../../../src/cli/filters/path-filter';
import type { PathFilter } from '../../../../src/cli/filters/types';
import { findSchemaRoots, type SchemaRoot } from '../../../../src/cli/resolvers';

const TMP = resolve(__dirname, '../../../.tmp-discovery-filter');

function makeDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function makeFile(path: string, content = ''): void {
  writeFileSync(path, content);
}

function makeFilter(options: { exclude?: string[]; ignore?: string[] }): PathFilter {
  return resolvePathFilter({
    basePath: TMP,
    rootConfig: {
      exclude: options.exclude,
      ignore: options.ignore,
    },
  });
}

beforeAll(() => {
  // Create temp fixture structure:
  // .tmp-discovery-filter/
  //   auth/
  //     schema.cerial      (marker)
  //     user.cerial
  //   cms/
  //     main.cerial         (marker)
  //     page.cerial
  //   experimental/
  //     schema.cerial       (marker)
  //     draft.cerial
  //   config-a/
  //     cerial.config.json  (folder config)
  //     models.cerial
  //   config-b/
  //     cerial.config.json  (folder config)
  //     data.cerial
  //   config-excluded/
  //     cerial.config.json  (folder config)
  //     excluded.cerial

  makeDir(resolve(TMP, 'auth'));
  makeFile(resolve(TMP, 'auth/schema.cerial'), 'model User { id Record @id }');
  makeFile(resolve(TMP, 'auth/user.cerial'), 'model Profile { id Record @id }');

  makeDir(resolve(TMP, 'cms'));
  makeFile(resolve(TMP, 'cms/main.cerial'), 'model Page { id Record @id }');
  makeFile(resolve(TMP, 'cms/page.cerial'), 'model Article { id Record @id }');

  makeDir(resolve(TMP, 'experimental'));
  makeFile(resolve(TMP, 'experimental/schema.cerial'), 'model Draft { id Record @id }');
  makeFile(resolve(TMP, 'experimental/draft.cerial'), 'model Idea { id Record @id }');

  makeDir(resolve(TMP, 'config-a'));
  makeFile(resolve(TMP, 'config-a/cerial.config.json'), JSON.stringify({ output: './gen-a' }));
  makeFile(resolve(TMP, 'config-a/models.cerial'), 'model A { id Record @id }');

  makeDir(resolve(TMP, 'config-b'));
  makeFile(resolve(TMP, 'config-b/cerial.config.json'), JSON.stringify({ output: './gen-b' }));
  makeFile(resolve(TMP, 'config-b/data.cerial'), 'model B { id Record @id }');

  makeDir(resolve(TMP, 'config-excluded'));
  makeFile(resolve(TMP, 'config-excluded/cerial.config.json'), JSON.stringify({ output: './gen-ex' }));
  makeFile(resolve(TMP, 'config-excluded/excluded.cerial'), 'model Ex { id Record @id }');
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('findSchemaRoots with filter', () => {
  describe('backward compatibility (no filter)', () => {
    it('should find all schema roots when no filter is provided', async () => {
      const roots = await findSchemaRoots(TMP);

      expect(roots.length).toBeGreaterThanOrEqual(3);
      const paths = roots.map((r: SchemaRoot) => r.path);
      expect(paths).toContain(resolve(TMP, 'auth'));
      expect(paths).toContain(resolve(TMP, 'cms'));
      expect(paths).toContain(resolve(TMP, 'experimental'));
    });
  });

  describe('exclude filter', () => {
    it('should exclude a directory matching the filter', async () => {
      const filter = makeFilter({ exclude: ['experimental/**'] });
      const roots = await findSchemaRoots(TMP, filter);

      const paths = roots.map((r: SchemaRoot) => r.path);
      expect(paths).toContain(resolve(TMP, 'auth'));
      expect(paths).toContain(resolve(TMP, 'cms'));
      expect(paths).not.toContain(resolve(TMP, 'experimental'));
    });

    it('should exclude multiple directories', async () => {
      const filter = makeFilter({ exclude: ['experimental/**', 'cms/**'] });
      const roots = await findSchemaRoots(TMP, filter);

      const paths = roots.map((r: SchemaRoot) => r.path);
      expect(paths).toContain(resolve(TMP, 'auth'));
      expect(paths).not.toContain(resolve(TMP, 'cms'));
      expect(paths).not.toContain(resolve(TMP, 'experimental'));
    });
  });

  describe('ignore filter', () => {
    it('should ignore a directory matching the filter', async () => {
      const filter = makeFilter({ ignore: ['experimental/**'] });
      const roots = await findSchemaRoots(TMP, filter);

      const paths = roots.map((r: SchemaRoot) => r.path);
      expect(paths).toContain(resolve(TMP, 'auth'));
      expect(paths).toContain(resolve(TMP, 'cms'));
      expect(paths).not.toContain(resolve(TMP, 'experimental'));
    });
  });

  describe('filter includes matching directory', () => {
    it('should include directories not matched by filter', async () => {
      const filter = makeFilter({ exclude: ['nonexistent/**'] });
      const roots = await findSchemaRoots(TMP, filter);

      const paths = roots.map((r: SchemaRoot) => r.path);
      expect(paths).toContain(resolve(TMP, 'auth'));
      expect(paths).toContain(resolve(TMP, 'cms'));
      expect(paths).toContain(resolve(TMP, 'experimental'));
    });
  });

  describe('directory-level filtering', () => {
    it('should filter based on directory path, not individual files', async () => {
      // Excluding the directory should remove the entire root, not just some files
      const filter = makeFilter({ exclude: ['experimental/**'] });
      const roots = await findSchemaRoots(TMP, filter);

      const experimentalRoot = roots.find((r: SchemaRoot) => r.path.endsWith('experimental'));
      expect(experimentalRoot).toBeUndefined();
    });
  });
});

describe('findFolderConfigs with filter', () => {
  describe('backward compatibility (no filter)', () => {
    it('should find all folder configs when no filter is provided', async () => {
      const configs = await findFolderConfigs(TMP);

      const dirs = configs.map((c) => c.dir);
      expect(dirs).toContain(resolve(TMP, 'config-a'));
      expect(dirs).toContain(resolve(TMP, 'config-b'));
      expect(dirs).toContain(resolve(TMP, 'config-excluded'));
    });
  });

  describe('exclude filter', () => {
    it('should exclude a directory matching the filter', async () => {
      const filter = makeFilter({ exclude: ['config-excluded/**'] });
      const configs = await findFolderConfigs(TMP, filter);

      const dirs = configs.map((c) => c.dir);
      expect(dirs).toContain(resolve(TMP, 'config-a'));
      expect(dirs).toContain(resolve(TMP, 'config-b'));
      expect(dirs).not.toContain(resolve(TMP, 'config-excluded'));
    });

    it('should exclude multiple directories', async () => {
      const filter = makeFilter({ exclude: ['config-excluded/**', 'config-b/**'] });
      const configs = await findFolderConfigs(TMP, filter);

      const dirs = configs.map((c) => c.dir);
      expect(dirs).toContain(resolve(TMP, 'config-a'));
      expect(dirs).not.toContain(resolve(TMP, 'config-b'));
      expect(dirs).not.toContain(resolve(TMP, 'config-excluded'));
    });
  });

  describe('ignore filter', () => {
    it('should ignore a directory matching the filter', async () => {
      const filter = makeFilter({ ignore: ['config-excluded/**'] });
      const configs = await findFolderConfigs(TMP, filter);

      const dirs = configs.map((c) => c.dir);
      expect(dirs).toContain(resolve(TMP, 'config-a'));
      expect(dirs).toContain(resolve(TMP, 'config-b'));
      expect(dirs).not.toContain(resolve(TMP, 'config-excluded'));
    });
  });

  describe('filter includes matching directory', () => {
    it('should include directories not matched by filter', async () => {
      const filter = makeFilter({ exclude: ['nonexistent/**'] });
      const configs = await findFolderConfigs(TMP, filter);

      const dirs = configs.map((c) => c.dir);
      expect(dirs).toContain(resolve(TMP, 'config-a'));
      expect(dirs).toContain(resolve(TMP, 'config-b'));
      expect(dirs).toContain(resolve(TMP, 'config-excluded'));
    });
  });

  describe('directory-level filtering', () => {
    it('should filter based on directory path, not individual config files', async () => {
      const filter = makeFilter({ exclude: ['config-excluded/**'] });
      const configs = await findFolderConfigs(TMP, filter);

      const excludedConfig = configs.find((c) => c.dir.endsWith('config-excluded'));
      expect(excludedConfig).toBeUndefined();
    });
  });
});
