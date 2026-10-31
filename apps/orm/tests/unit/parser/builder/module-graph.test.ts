import { describe, expect, test } from 'bun:test';
import { type ImportReader, moduleGraph } from '../../../../src/parser/builder/load';

/** A reader over a fixed adjacency map; counts reads so the walk's reuse is visible */
function reader(graph: Record<string, string[]>): ImportReader & { reads: string[] } {
  const reads: string[] = [];
  const read: ImportReader = async (file) => {
    reads.push(file);

    return graph[file] ?? [];
  };

  return Object.assign(read, { reads });
}

describe('moduleGraph', () => {
  test('returns the root and everything it reaches, transitively', async () => {
    const readImports = reader({ '/p/a.ts': ['/p/b.ts'], '/p/b.ts': ['/q/c.ts'] });

    expect((await moduleGraph(['/p/a.ts'], { readImports })).sort()).toEqual(['/p/a.ts', '/p/b.ts', '/q/c.ts']);
  });

  test('does not return a module nothing reaches', async () => {
    const readImports = reader({ '/p/a.ts': ['/p/b.ts'], '/p/sibling.ts': [] });

    expect(await moduleGraph(['/p/a.ts'], { readImports })).not.toContain('/p/sibling.ts');
  });

  test('reads each module once, including through a cycle and a diamond', async () => {
    const readImports = reader({
      '/p/a.ts': ['/p/b.ts', '/p/c.ts'],
      '/p/b.ts': ['/p/d.ts'],
      '/p/c.ts': ['/p/d.ts'],
      '/p/d.ts': ['/p/a.ts'],
    });
    await moduleGraph(['/p/a.ts'], { readImports });

    expect([...readImports.reads].sort()).toEqual(['/p/a.ts', '/p/b.ts', '/p/c.ts', '/p/d.ts']);
  });

  test('stops at an excluded module: it is not returned and what only it imports is not reached', async () => {
    const readImports = reader({ '/p/a.ts': ['/p/skip.ts', '/p/b.ts'], '/p/skip.ts': ['/p/hidden.ts'] });
    const found = await moduleGraph(['/p/a.ts'], { readImports, excludes: (path) => path === '/p/skip.ts' });

    expect(found.sort()).toEqual(['/p/a.ts', '/p/b.ts']);
    expect(readImports.reads).not.toContain('/p/skip.ts');
  });

  test('keeps a module an excluded module and an included one both import', async () => {
    const readImports = reader({ '/p/a.ts': ['/p/skip.ts', '/p/b.ts'], '/p/skip.ts': ['/p/b.ts'], '/p/b.ts': [] });

    expect(await moduleGraph(['/p/a.ts'], { readImports, excludes: (p) => p === '/p/skip.ts' })).toContain('/p/b.ts');
  });

  test('skips declaration files, node_modules and the generated handles, even as roots', async () => {
    const readImports = reader({});
    const roots = ['/p/x.d.ts', '/p/node_modules/pkg/index.ts', '/p/cerial/handles.ts', '/p/notes.md'];

    expect(await moduleGraph(roots, { readImports })).toEqual([]);
    expect(readImports.reads).toEqual([]);
  });

  test('propagates a reader failure so the caller can keep its old set', async () => {
    const readImports: ImportReader = async () => {
      throw new Error('cannot read');
    };

    await expect(moduleGraph(['/p/a.ts'], { readImports })).rejects.toThrow('cannot read');
  });
});
