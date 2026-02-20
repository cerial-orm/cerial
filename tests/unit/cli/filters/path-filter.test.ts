import { describe, expect, it } from 'bun:test';
import { resolvePathFilter } from '../../../../src/cli/filters/path-filter';
import type { CerialIgnoreFile, PathFilterOptions } from '../../../../src/cli/filters/types';
import { NO_FILTER } from '../../../../src/cli/filters/types';

function cerialIgnore(content: string, dir = '/project'): CerialIgnoreFile {
  return { path: `${dir}/.cerialignore`, dir, content };
}

function opts(overrides: Partial<PathFilterOptions> = {}): PathFilterOptions {
  return { basePath: '/project', ...overrides };
}

describe('resolvePathFilter', () => {
  describe('8 confirmed cascade scenarios', () => {
    it('1. file in root ignore → SKIP (absolute blacklist)', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { ignore: ['secret.cerial'] },
        }),
      );

      expect(filter.shouldInclude('secret.cerial')).toBe(false);
    });

    it('2. file in root .cerialignore but in root include → INCLUDE', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { include: ['keep.cerial'] },
          rootCerialIgnore: cerialIgnore('keep.cerial'),
        }),
      );

      expect(filter.shouldInclude('keep.cerial')).toBe(true);
    });

    it('3. file in root .cerialignore, not in include → SKIP', () => {
      const filter = resolvePathFilter(
        opts({
          rootCerialIgnore: cerialIgnore('draft.cerial'),
        }),
      );

      expect(filter.shouldInclude('draft.cerial')).toBe(false);
    });

    it('4. file in root exclude → SKIP', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['temp.cerial'] },
        }),
      );

      expect(filter.shouldInclude('temp.cerial')).toBe(false);
    });

    it('5. file in per-schema exclude but in per-schema include → INCLUDE', () => {
      const filter = resolvePathFilter(
        opts({
          schemaConfig: { exclude: ['*.test.cerial'], include: ['important.test.cerial'] },
        }),
      );

      expect(filter.shouldInclude('important.test.cerial')).toBe(true);
    });

    it('6. file in per-schema exclude, not in include → SKIP', () => {
      const filter = resolvePathFilter(
        opts({
          schemaConfig: { exclude: ['*.test.cerial'] },
        }),
      );

      expect(filter.shouldInclude('some.test.cerial')).toBe(false);
    });

    it('7. file excluded by folder .cerialignore but in folder config include → INCLUDE', () => {
      const filter = resolvePathFilter(
        opts({
          folderConfig: { include: ['needed.cerial'] },
          folderCerialIgnore: cerialIgnore('needed.cerial'),
        }),
      );

      expect(filter.shouldInclude('needed.cerial')).toBe(true);
    });

    it('8. file excluded by folder .cerialignore, not in include → SKIP', () => {
      const filter = resolvePathFilter(
        opts({
          folderCerialIgnore: cerialIgnore('old.cerial'),
        }),
      );

      expect(filter.shouldInclude('old.cerial')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('file matches both include AND ignore → SKIP (ignore is absolute)', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { ignore: ['secret.cerial'], include: ['secret.cerial'] },
        }),
      );

      expect(filter.shouldInclude('secret.cerial')).toBe(false);
    });

    it('no filters configured → returns NO_FILTER', () => {
      const filter = resolvePathFilter(opts());

      expect(filter).toBe(NO_FILTER);
    });

    it('empty pattern arrays → returns NO_FILTER', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { ignore: [], exclude: [], include: [] },
          schemaConfig: { ignore: [], exclude: [], include: [] },
          folderConfig: { ignore: [], exclude: [], include: [] },
        }),
      );

      expect(filter).toBe(NO_FILTER);
    });

    it('.cerialignore with comments and blank lines → handled correctly', () => {
      const content = '# This is a comment\ndraft.cerial\n\n# Another comment\n*.tmp';
      const filter = resolvePathFilter(
        opts({
          rootCerialIgnore: cerialIgnore(content),
        }),
      );

      expect(filter.shouldInclude('draft.cerial')).toBe(false);
      expect(filter.shouldInclude('file.tmp')).toBe(false);
      expect(filter.shouldInclude('normal.cerial')).toBe(true);
    });

    it('include without exclude → returns NO_FILTER (not a whitelist-only filter)', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { include: ['keep.cerial'] },
        }),
      );

      expect(filter).toBe(NO_FILTER);
    });

    it('include-only across all levels → returns NO_FILTER', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { include: ['a.cerial'] },
          schemaConfig: { include: ['b.cerial'] },
          folderConfig: { include: ['c.cerial'] },
        }),
      );

      expect(filter).toBe(NO_FILTER);
    });

    it('multiple patterns in same field → all applied', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.tmp', '*.draft', 'internal/*'] },
        }),
      );

      expect(filter.shouldInclude('file.tmp')).toBe(false);
      expect(filter.shouldInclude('file.draft')).toBe(false);
      expect(filter.shouldInclude('internal/secret.cerial')).toBe(false);
      expect(filter.shouldInclude('public.cerial')).toBe(true);
    });

    it('root include overrides root exclude', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.test.cerial'], include: ['important.test.cerial'] },
        }),
      );

      expect(filter.shouldInclude('important.test.cerial')).toBe(true);
      expect(filter.shouldInclude('other.test.cerial')).toBe(false);
    });

    it('folder include overrides folder exclude', () => {
      const filter = resolvePathFilter(
        opts({
          folderConfig: { exclude: ['*.bak'], include: ['keep.bak'] },
        }),
      );

      expect(filter.shouldInclude('keep.bak')).toBe(true);
      expect(filter.shouldInclude('other.bak')).toBe(false);
    });

    it('file not matching any pattern → included by default', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.tmp'] },
        }),
      );

      expect(filter.shouldInclude('normal.cerial')).toBe(true);
    });

    it('empty relative path → included', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.tmp'] },
        }),
      );

      expect(filter.shouldInclude('')).toBe(true);
    });
  });

  describe('pattern scoping', () => {
    it('root config patterns apply to nested files', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.tmp'] },
        }),
      );

      expect(filter.shouldInclude('file.tmp')).toBe(false);
      expect(filter.shouldInclude('sub/file.tmp')).toBe(false);
      expect(filter.shouldInclude('deep/nested/file.tmp')).toBe(false);
    });

    it('schema config patterns apply to matching paths', () => {
      const filter = resolvePathFilter(
        opts({
          schemaConfig: { exclude: ['test/*'] },
        }),
      );

      expect(filter.shouldInclude('test/file.cerial')).toBe(false);
      expect(filter.shouldInclude('prod/file.cerial')).toBe(true);
    });

    it('folder .cerialignore patterns check against relative path', () => {
      const filter = resolvePathFilter(
        opts({
          folderCerialIgnore: cerialIgnore('draft.cerial', '/project/models'),
        }),
      );

      expect(filter.shouldInclude('draft.cerial')).toBe(false);
      expect(filter.shouldInclude('other.cerial')).toBe(true);
    });

    it('directory pattern excludes files inside that directory', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['internal/'] },
        }),
      );

      expect(filter.shouldInclude('internal/secret.cerial')).toBe(false);
      expect(filter.shouldInclude('internal/nested/deep.cerial')).toBe(false);
      expect(filter.shouldInclude('public.cerial')).toBe(true);
    });
  });

  describe('cross-layer interactions', () => {
    it('schema ignore is absolute like root ignore', () => {
      const filter = resolvePathFilter(
        opts({
          schemaConfig: { ignore: ['secret.cerial'], include: ['secret.cerial'] },
        }),
      );

      expect(filter.shouldInclude('secret.cerial')).toBe(false);
    });

    it('folder ignore is absolute like root ignore', () => {
      const filter = resolvePathFilter(
        opts({
          folderConfig: { ignore: ['secret.cerial'], include: ['secret.cerial'] },
        }),
      );

      expect(filter.shouldInclude('secret.cerial')).toBe(false);
    });

    it('root ignore overrides schema include', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { ignore: ['forbidden.cerial'] },
          schemaConfig: { include: ['forbidden.cerial'] },
        }),
      );

      expect(filter.shouldInclude('forbidden.cerial')).toBe(false);
    });

    it('file excluded at root level, not rescued by schema include', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['blocked.cerial'] },
          schemaConfig: { include: ['blocked.cerial'] },
        }),
      );

      expect(filter.shouldInclude('blocked.cerial')).toBe(false);
    });

    it('file excluded at root level, not rescued by folder include', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['blocked.cerial'] },
          folderConfig: { include: ['blocked.cerial'] },
        }),
      );

      expect(filter.shouldInclude('blocked.cerial')).toBe(false);
    });

    it('file passes all layers → included', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.tmp'] },
          schemaConfig: { exclude: ['*.draft'] },
          folderConfig: { exclude: ['*.bak'] },
        }),
      );

      expect(filter.shouldInclude('normal.cerial')).toBe(true);
    });

    it('all layers have exclude, file matches only schema exclude → SKIP', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.tmp'] },
          schemaConfig: { exclude: ['*.draft'] },
          folderConfig: { exclude: ['*.bak'] },
        }),
      );

      expect(filter.shouldInclude('file.draft')).toBe(false);
    });

    it('all layers have exclude, file matches only folder exclude → SKIP', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['*.tmp'] },
          schemaConfig: { exclude: ['*.draft'] },
          folderConfig: { exclude: ['*.bak'] },
        }),
      );

      expect(filter.shouldInclude('file.bak')).toBe(false);
    });

    it('ignore from different levels all block', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { ignore: ['root-secret.cerial'] },
          schemaConfig: { ignore: ['schema-secret.cerial'] },
          folderConfig: { ignore: ['folder-secret.cerial'] },
        }),
      );

      expect(filter.shouldInclude('root-secret.cerial')).toBe(false);
      expect(filter.shouldInclude('schema-secret.cerial')).toBe(false);
      expect(filter.shouldInclude('folder-secret.cerial')).toBe(false);
      expect(filter.shouldInclude('public.cerial')).toBe(true);
    });

    it('root .cerialignore excluded, root include rescues, then schema exclude blocks', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { include: ['shared.cerial'] },
          rootCerialIgnore: cerialIgnore('shared.cerial'),
          schemaConfig: { exclude: ['shared.cerial'] },
        }),
      );

      expect(filter.shouldInclude('shared.cerial')).toBe(false);
    });

    it('root exclude + root include rescues, then folder exclude blocks', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['models/*'], include: ['models/user.cerial'] },
          folderConfig: { exclude: ['models/user.cerial'] },
        }),
      );

      expect(filter.shouldInclude('models/user.cerial')).toBe(false);
    });
  });

  describe('Windows path normalization', () => {
    it('backslash paths are normalized before checking', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['models/*.cerial'] },
        }),
      );

      expect(filter.shouldInclude('models\\secret.cerial')).toBe(false);
    });

    it('backslash paths work with include override', () => {
      const filter = resolvePathFilter(
        opts({
          rootConfig: { exclude: ['sub/*.cerial'], include: ['sub/keep.cerial'] },
        }),
      );

      expect(filter.shouldInclude('sub\\keep.cerial')).toBe(true);
      expect(filter.shouldInclude('sub\\other.cerial')).toBe(false);
    });
  });
});
