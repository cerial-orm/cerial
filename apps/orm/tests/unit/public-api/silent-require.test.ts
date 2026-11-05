/**
 * Unit tests: requiring any CJS entry of the built package prints nothing.
 *
 * An import cycle between modules makes the bundler warn on stderr when a consumer calls `require`.
 * These tests load the BUILT package, so they build it first when `dist/` is missing; an existing
 * `dist/` is used as it stands, so run `bun run build` after changing `src/`.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ExportTarget {
  require?: { default?: string };
}

const root = resolve(import.meta.dir, '../../..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  exports: Record<string, ExportTarget | string>;
};
const entries = Object.entries(pkg.exports).flatMap(([subpath, target]) => {
  const file = typeof target === 'string' ? undefined : target.require?.default;

  return file ? [{ subpath, file }] : [];
});

beforeAll(() => {
  if (existsSync(resolve(root, 'dist/index.cjs'))) return;
  const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (build.exitCode !== 0) throw new Error(`bun run build failed:\n${build.stderr.toString()}`);
}, 120_000);

describe('require of every CJS entry', () => {
  test('the exports map has CJS entries to check', () => {
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.map((e) => e.subpath)).toContain('./cli');
  });

  for (const { subpath, file } of entries) {
    test(`cerial${subpath.slice(1)} prints nothing to stderr`, () => {
      const run = Bun.spawnSync(['node', '-e', `require(${JSON.stringify(resolve(root, file))})`], {
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(run.stderr.toString()).toBe('');
      expect(run.exitCode).toBe(0);
    });
  }
});
