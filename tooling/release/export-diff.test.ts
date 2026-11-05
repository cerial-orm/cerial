// export-diff against two fixture packages: a removed name, a removed subpath, a name reached through
// `export *`, and the unchanged names that must not appear.

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { diffExports, exportedNames } from './export-diff.ts';

const root = mkdtempSync(join(tmpdir(), 'cerial-exports-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function pkg(name: string, entries: Record<string, string>, files: Record<string, string>): string {
  const dir = join(root, name);
  const exports = Object.fromEntries(
    entries && Object.entries(entries).map(([sub, types]) => [sub, { import: { types } }]),
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ exports }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }

  return dir;
}

describe('export-diff', () => {
  test('reads declarations, named exports, renames, type modifiers and export *', () => {
    const dir = pkg(
      'read',
      { '.': './i.d.mts' },
      {
        'i.d.mts':
          'export declare function a(): void;\nexport interface B {}\nexport { c as d, type E };\nexport * from "./more.mjs";\n',
        'more.d.mts': 'export declare const f: number;\n',
      },
    );
    expect([...exportedNames(join(dir, 'i.d.mts')).keys()].sort()).toEqual(['B', 'E', 'a', 'd', 'f']);
  });

  test('a removed name and a removed subpath are rows; kept names are not', () => {
    const before = pkg(
      'before',
      { '.': './i.d.mts', './x': './x.d.mts' },
      {
        'i.d.mts': 'export { keep, gone };\n',
        'x.d.mts': 'export { y };\n',
      },
    );
    const after = pkg('after', { '.': './i.d.mts' }, { 'i.d.mts': 'export { keep, added };\n' });
    expect(diffExports(before, after).map((row) => `${row.name}:${row.kind}`)).toEqual([
      'gone:export-removed',
      './x:export-path',
    ]);
  });

  test('identical packages yield no rows', () => {
    const a = pkg('same-a', { '.': './i.d.mts' }, { 'i.d.mts': 'export { keep };\n' });
    const b = pkg('same-b', { '.': './i.d.mts' }, { 'i.d.mts': 'export { keep };\n' });
    expect(diffExports(a, b)).toEqual([]);
  });
});
