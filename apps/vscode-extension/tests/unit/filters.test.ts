import { describe, expect, test } from 'bun:test';
import { resolvePathFilter } from '../../../orm/src/cli/filters/path-filter';
import type { CerialIgnoreFile, PathFilterOptions } from '../../../orm/src/cli/filters/types';
import { NO_FILTER } from '../../../orm/src/cli/filters/types';

function makeCerialIgnore(content: string): CerialIgnoreFile {
  return { path: '/fake/.cerialignore', dir: '/fake', content };
}

function makeOptions(overrides: Partial<PathFilterOptions> = {}): PathFilterOptions {
  return { basePath: '/project', ...overrides };
}

describe('resolvePathFilter', () => {
  describe('no filters', () => {
    test('returns NO_FILTER when no options provided', () => {
      const filter = resolvePathFilter(makeOptions());

      expect(filter).toBe(NO_FILTER);
    });

    test('NO_FILTER includes all paths', () => {
      expect(NO_FILTER.shouldInclude('any/path.cerial')).toBe(true);
      expect(NO_FILTER.shouldInclude('deeply/nested/file.cerial')).toBe(true);
      expect(NO_FILTER.shouldInclude('')).toBe(true);
    });

    test('returns NO_FILTER when configs have empty arrays', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { ignore: [], exclude: [], include: [] },
          schemaConfig: { ignore: [], exclude: [], include: [] },
          folderConfig: { ignore: [], exclude: [], include: [] },
        }),
      );

      expect(filter).toBe(NO_FILTER);
    });
  });

  describe('ignore patterns (absolute blacklist)', () => {
    test('rootConfig.ignore blocks matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { ignore: ['secret.cerial'] },
        }),
      );

      expect(filter.shouldInclude('secret.cerial')).toBe(false);
      expect(filter.shouldInclude('public.cerial')).toBe(true);
    });

    test('schemaConfig.ignore blocks matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          schemaConfig: { ignore: ['internal/**'] },
        }),
      );

      expect(filter.shouldInclude('internal/hidden.cerial')).toBe(false);
      expect(filter.shouldInclude('external/visible.cerial')).toBe(true);
    });

    test('folderConfig.ignore blocks matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          folderConfig: { ignore: ['*.draft.cerial'] },
        }),
      );

      expect(filter.shouldInclude('model.draft.cerial')).toBe(false);
      expect(filter.shouldInclude('model.cerial')).toBe(true);
    });

    test('ignore cannot be overridden by include', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { ignore: ['locked.cerial'], include: ['locked.cerial'] },
        }),
      );

      expect(filter.shouldInclude('locked.cerial')).toBe(false);
    });

    test('ignore from all levels are combined', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { ignore: ['root-locked.cerial'] },
          schemaConfig: { ignore: ['schema-locked.cerial'] },
          folderConfig: { ignore: ['folder-locked.cerial'] },
        }),
      );

      expect(filter.shouldInclude('root-locked.cerial')).toBe(false);
      expect(filter.shouldInclude('schema-locked.cerial')).toBe(false);
      expect(filter.shouldInclude('folder-locked.cerial')).toBe(false);
      expect(filter.shouldInclude('other.cerial')).toBe(true);
    });
  });

  describe('root .cerialignore (overridable by root include)', () => {
    test('rootCerialIgnore excludes matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootCerialIgnore: makeCerialIgnore('draft/**'),
        }),
      );

      expect(filter.shouldInclude('draft/wip.cerial')).toBe(false);
      expect(filter.shouldInclude('stable/model.cerial')).toBe(true);
    });

    test('rootCerialIgnore overridden by rootConfig.include', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootCerialIgnore: makeCerialIgnore('draft/**'),
          rootConfig: { include: ['draft/keep.cerial'] },
        }),
      );

      expect(filter.shouldInclude('draft/keep.cerial')).toBe(true);
      expect(filter.shouldInclude('draft/discard.cerial')).toBe(false);
    });
  });

  describe('root exclude (overridable by root include)', () => {
    test('rootConfig.exclude blocks matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { exclude: ['temp/**'] },
        }),
      );

      expect(filter.shouldInclude('temp/scratch.cerial')).toBe(false);
      expect(filter.shouldInclude('src/model.cerial')).toBe(true);
    });

    test('rootConfig.exclude overridden by rootConfig.include', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: {
            exclude: ['temp/**'],
            include: ['temp/important.cerial'],
          },
        }),
      );

      expect(filter.shouldInclude('temp/important.cerial')).toBe(true);
      expect(filter.shouldInclude('temp/junk.cerial')).toBe(false);
    });
  });

  describe('schema exclude (overridable by schema include)', () => {
    test('schemaConfig.exclude blocks matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          schemaConfig: { exclude: ['legacy/**'] },
        }),
      );

      expect(filter.shouldInclude('legacy/old.cerial')).toBe(false);
      expect(filter.shouldInclude('new/model.cerial')).toBe(true);
    });

    test('schemaConfig.exclude overridden by schemaConfig.include', () => {
      const filter = resolvePathFilter(
        makeOptions({
          schemaConfig: {
            exclude: ['legacy/**'],
            include: ['legacy/still-used.cerial'],
          },
        }),
      );

      expect(filter.shouldInclude('legacy/still-used.cerial')).toBe(true);
      expect(filter.shouldInclude('legacy/deprecated.cerial')).toBe(false);
    });
  });

  describe('folder .cerialignore (overridable by folder include)', () => {
    test('folderCerialIgnore excludes matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          folderCerialIgnore: makeCerialIgnore('test-fixtures/**'),
        }),
      );

      expect(filter.shouldInclude('test-fixtures/mock.cerial')).toBe(false);
      expect(filter.shouldInclude('src/real.cerial')).toBe(true);
    });

    test('folderCerialIgnore overridden by folderConfig.include', () => {
      const filter = resolvePathFilter(
        makeOptions({
          folderCerialIgnore: makeCerialIgnore('test-fixtures/**'),
          folderConfig: { include: ['test-fixtures/important.cerial'] },
        }),
      );

      expect(filter.shouldInclude('test-fixtures/important.cerial')).toBe(true);
      expect(filter.shouldInclude('test-fixtures/other.cerial')).toBe(false);
    });
  });

  describe('folder exclude (overridable by folder include)', () => {
    test('folderConfig.exclude blocks matching paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          folderConfig: { exclude: ['archive/**'] },
        }),
      );

      expect(filter.shouldInclude('archive/old.cerial')).toBe(false);
      expect(filter.shouldInclude('current/model.cerial')).toBe(true);
    });

    test('folderConfig.exclude overridden by folderConfig.include', () => {
      const filter = resolvePathFilter(
        makeOptions({
          folderConfig: {
            exclude: ['archive/**'],
            include: ['archive/needed.cerial'],
          },
        }),
      );

      expect(filter.shouldInclude('archive/needed.cerial')).toBe(true);
      expect(filter.shouldInclude('archive/leftover.cerial')).toBe(false);
    });
  });

  describe('all 7 layers active simultaneously', () => {
    test('ignore takes precedence over everything', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: {
            ignore: ['forbidden.cerial'],
            exclude: ['draft/**'],
            include: ['forbidden.cerial', 'draft/save.cerial'],
          },
          schemaConfig: {
            exclude: ['legacy/**'],
            include: ['legacy/keep.cerial'],
          },
          folderConfig: {
            exclude: ['archive/**'],
            include: ['archive/needed.cerial'],
          },
          rootCerialIgnore: makeCerialIgnore('wip/**'),
          folderCerialIgnore: makeCerialIgnore('test/**'),
        }),
      );

      // ignore — absolute blacklist
      expect(filter.shouldInclude('forbidden.cerial')).toBe(false);

      // root cerialignore excluded, not in root include
      expect(filter.shouldInclude('wip/scratch.cerial')).toBe(false);

      // root exclude overridden by root include
      expect(filter.shouldInclude('draft/save.cerial')).toBe(true);
      expect(filter.shouldInclude('draft/other.cerial')).toBe(false);

      // schema exclude overridden by schema include
      expect(filter.shouldInclude('legacy/keep.cerial')).toBe(true);
      expect(filter.shouldInclude('legacy/drop.cerial')).toBe(false);

      // folder cerialignore excluded, not in folder include
      expect(filter.shouldInclude('test/mock.cerial')).toBe(false);

      // folder exclude overridden by folder include
      expect(filter.shouldInclude('archive/needed.cerial')).toBe(true);
      expect(filter.shouldInclude('archive/old.cerial')).toBe(false);

      // no filter matches — included by default
      expect(filter.shouldInclude('src/model.cerial')).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('empty string path returns true', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { exclude: ['*.cerial'] },
        }),
      );


      expect(filter.shouldInclude('')).toBe(true);
    });

    test('exclude all with wildcard pattern', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { exclude: ['**'] },
        }),
      );

      expect(filter.shouldInclude('any/file.cerial')).toBe(false);
      expect(filter.shouldInclude('another.cerial')).toBe(false);
    });

    test('include without exclude is a no-op', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { include: ['specific.cerial'] },
        }),
      );


      expect(filter).toBe(NO_FILTER);
    });

    test('glob pattern matching with nested paths', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { exclude: ['sub/deep/**'] },
        }),
      );

      expect(filter.shouldInclude('sub/deep/nested/file.cerial')).toBe(false);
      expect(filter.shouldInclude('sub/shallow.cerial')).toBe(true);
    });

    test('multiple exclude patterns work together', () => {
      const filter = resolvePathFilter(
        makeOptions({
          rootConfig: { exclude: ['*.draft.cerial', 'temp/**'] },
        }),
      );

      expect(filter.shouldInclude('model.draft.cerial')).toBe(false);
      expect(filter.shouldInclude('temp/scratch.cerial')).toBe(false);
      expect(filter.shouldInclude('model.cerial')).toBe(true);
    });
  });
});
