import { describe, expect, it } from 'bun:test';
import { computeWatchSet, directoriesOutside } from '../../../src/cli/watcher';
import type { WatchTarget } from '../../../src/cli/watcher';
import type { ImportReader } from '../../../src/parser/builder/load';

const target = (extra: Partial<WatchTarget>): WatchTarget => ({
  schemaPath: '/p/schema',
  outputDir: '/p/schema/client',
  ...extra,
});

const reader =
  (graph: Record<string, string[]>): ImportReader =>
  async (file) =>
    graph[file] ?? [];

describe('directoriesOutside', () => {
  it('returns only directories the recursive watch of the schema path does not cover', () => {
    const dirs = directoriesOutside(
      ['/p/schema/a.ts', '/p/schema/sub/b.ts', '/p/shared/c.ts', '/p/shared/d.ts'],
      '/p/schema',
    );

    expect([...dirs]).toEqual(['/p/shared']);
  });

  it('does not mistake a sibling that shares the folder name prefix for an inside', () => {
    expect([...directoriesOutside(['/p/schema-extra/a.ts'], '/p/schema')]).toEqual(['/p/schema-extra']);
  });
});

describe('computeWatchSet', () => {
  it('is undefined for a target with neither entry nor files', async () => {
    expect(await computeWatchSet(target({}))).toBeUndefined();
  });

  it('holds the entry and every module it reaches, wherever they sit', async () => {
    const readImports = reader({ '/p/schema/entry.ts': ['/p/users/user.ts'], '/p/users/user.ts': ['/p/lib/base.ts'] });
    const set = await computeWatchSet(target({ entry: '/p/schema/entry.ts' }), readImports);

    expect([...set!].sort()).toEqual(['/p/lib/base.ts', '/p/schema/entry.ts', '/p/users/user.ts']);
  });

  it('excludes a sibling of the entry that nothing imports', async () => {
    const readImports = reader({ '/p/schema/entry.ts': ['/p/users/user.ts'] });
    const set = await computeWatchSet(target({ entry: '/p/schema/entry.ts' }), readImports);

    expect(set!.has('/p/users/other.ts')).toBe(false);
  });

  it('holds listed files, and the imports of listed TypeScript ones', async () => {
    const readImports = reader({ '/p/ext/a.ts': ['/p/ext/dep.ts'] });
    const set = await computeWatchSet(target({ files: ['/p/ext/a.ts', '/p/ext/b.cerial'] }), readImports);

    expect([...set!].sort()).toEqual(['/p/ext/a.ts', '/p/ext/b.cerial', '/p/ext/dep.ts']);
  });

  it('leaves out a file the target filter excludes, and what only it imports', async () => {
    const readImports = reader({
      '/p/schema/entry.ts': ['/p/schema/skip/x.ts'],
      '/p/schema/skip/x.ts': ['/p/lib/y.ts'],
    });
    const filter = { shouldInclude: (p: string) => !p.startsWith('skip/') };
    const set = await computeWatchSet(target({ entry: '/p/schema/entry.ts', filter }), readImports);

    expect([...set!]).toEqual(['/p/schema/entry.ts']);
  });

  it('never holds the generated handles, even when listed', async () => {
    const set = await computeWatchSet(target({ files: ['/p/ext/cerial/handles.ts', '/p/ext/a.cerial'] }), reader({}));

    expect([...set!]).toEqual(['/p/ext/a.cerial']);
  });

  it('rejects when the reader fails, so the watcher can keep its old set', async () => {
    const readImports: ImportReader = async () => {
      throw new Error('broken');
    };

    await expect(computeWatchSet(target({ entry: '/p/schema/entry.ts' }), readImports)).rejects.toThrow('broken');
  });
});
