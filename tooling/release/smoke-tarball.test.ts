// The smoke's refusals against fixtures. The full smoke packs and installs, so it runs at the release gate and
// is not repeated here.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newScratch, removeScratchesAfterAll, seed, write } from '../hooks/test-support.ts';
import {
  aliasVersion,
  CONSUMER_TYPES,
  dirtyViolation,
  disallowedFiles,
  exportSpecifiers,
  mapLeaks,
  smokeTarball,
  tscMajor,
} from './smoke-tarball.ts';

removeScratchesAfterAll();

const SOURCE = readFileSync(join(import.meta.dir, 'smoke-tarball.ts'), 'utf8');

describe('dirty tree', () => {
  test('a clean package directory passes', () => {
    const scratch = newScratch();
    seed(scratch, { 'pkg/package.json': '{}\n' });

    expect(dirtyViolation(join(scratch.dir, 'pkg'))).toBeUndefined();
  });

  test('a modified tracked file refuses', () => {
    const scratch = newScratch();
    seed(scratch, { 'pkg/package.json': '{}\n' });
    write(scratch, 'pkg/package.json', '{ "a": 1 }\n');

    expect(dirtyViolation(join(scratch.dir, 'pkg'))).toContain('uncommitted changes');
  });

  test('an untracked file refuses, and a change outside the package does not', () => {
    const scratch = newScratch();
    seed(scratch, { 'pkg/package.json': '{}\n', 'other/a.txt': 'a\n' });
    write(scratch, 'other/a.txt', 'b\n');
    expect(dirtyViolation(join(scratch.dir, 'pkg'))).toBeUndefined();

    write(scratch, 'pkg/new.ts', 'export {};\n');
    expect(dirtyViolation(join(scratch.dir, 'pkg'))).toContain('uncommitted changes');
  });

  test('smokeTarball stops at the dirty tree before building anything', () => {
    const scratch = newScratch();
    seed(scratch, { 'pkg/package.json': '{ "name": "x" }\n' });
    write(scratch, 'pkg/stray.ts', '\n');
    const result = smokeTarball({ packageDir: join(scratch.dir, 'pkg') });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('uncommitted changes');
  });
});

describe('tarball contents', () => {
  test('the allowed set passes', () => {
    const paths = [
      'package/',
      'package/package.json',
      'package/README.md',
      'package/LICENSE',
      'package/dist/index.mjs',
    ];

    expect(disallowedFiles(paths)).toEqual([]);
  });

  test.each([
    'package/src/index.ts',
    'package/.env',
    'package/tests/a.test.ts',
    'package/distant/x.js',
    'package/CHANGELOG.md',
  ])('refuses %s', (path) => {
    expect(disallowedFiles(['package/package.json', path])).toEqual([expect.stringContaining(path)]);
  });
});

describe('source maps', () => {
  const roots = ['/work/repo/apps/orm'];

  test('relative sources pass', () => {
    expect(mapLeaks('a.map', JSON.stringify({ sources: ['../src/a.ts'] }), roots)).toEqual([]);
  });

  test.each([
    ['an absolute path', { sources: ['/Users/someone/repo/src/a.ts'] }],
    ['a windows path', { sources: ['C:\\repo\\src\\a.ts'] }],
    ['a source root', { sources: ['a.ts'], sourceRoot: '/home/x' }],
    ['the repository path', { sources: ['/work/repo/apps/orm/src/a.ts'] }],
  ])('refuses %s', (_name, map) => {
    expect(mapLeaks('a.map', JSON.stringify(map), roots)).toHaveLength(1);
  });

  test('refuses a map that is not JSON', () => {
    expect(mapLeaks('a.map', 'not json', roots)).toEqual(['a.map is not valid JSON']);
  });
});

describe('export specifiers', () => {
  test('maps the root and each subpath, ignoring non-path keys', () => {
    const pkg = { name: 'cerial', version: '1.0.0', exports: { '.': {}, './schema': {}, './package.json': {} } };

    expect(exportSpecifiers(pkg)).toEqual(['cerial', 'cerial/schema', 'cerial/package.json']);
  });
});

describe('typecheck consumers', () => {
  test('both a CommonJS and an ES module consumer are typechecked', () => {
    expect([...CONSUMER_TYPES].sort()).toEqual(['commonjs', 'module']);
  });

  test('the typecheck loops over every consumer type under each resolution mode', () => {
    expect(SOURCE).toMatch(/for \(const type of CONSUMER_TYPES\)/);
    expect(SOURCE).not.toMatch(/const type = 'commonjs'/);
  });
});

describe('typescript 7 consumer', () => {
  const pkg = (devDependencies: Record<string, string>) => ({ name: 'cerial', version: '1.0.0', devDependencies });

  test('reads the exact version an npm alias pins', () => {
    expect(aliasVersion(pkg({ 'typescript-7': 'npm:typescript@7.0.2' }), 'typescript-7')).toBe('7.0.2');
  });

  test.each([
    ['a range', 'npm:typescript@^7.0.0'],
    ['a tag', 'npm:typescript@latest'],
    ['a plain version', '7.0.2'],
    ['nothing', ''],
  ])('refuses %s', (_name, spec) => {
    expect(aliasVersion(pkg({ 'typescript-7': spec }), 'typescript-7')).toBeUndefined();
  });

  test('an absent alias is undefined', () => {
    expect(aliasVersion({ name: 'cerial', version: '1.0.0' }, 'typescript-7')).toBeUndefined();
  });

  test('reads the major from tsc --version', () => {
    expect(tscMajor('Version 7.0.2\n')).toBe(7);
    expect(tscMajor('Version 5.9.3')).toBe(5);
  });

  test('a line without a version has no major', () => {
    expect(tscMajor('')).toBeUndefined();
    expect(tscMajor('command not found')).toBeUndefined();
  });
});

describe('what the script may do', () => {
  test('never publishes', () => {
    expect(SOURCE).not.toMatch(/['"`]publish['"`]/);
    expect(SOURCE).not.toMatch(/npm publish/);
  });
});
