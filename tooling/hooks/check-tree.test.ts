// The tree-wide scan CI runs, so a commit made with --no-verify is still caught.
// It runs from a copy of the hooks inside a scratch repository, so the baseline it
// reads is one the test controls.

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import type { Scratch } from './scratch.ts';
import {
  guardRepositoryConfiguration,
  installHooksCopy,
  newScratch,
  removeScratchesAfterAll,
  stage,
  write,
} from './test-support.ts';

removeScratchesAfterAll();

const CAST = ['as', 'any'].join(' ');
const SRC = 'apps/orm/src/a.ts';
const casts = (n: number): string => Array.from({ length: n }, (_, i) => `export const v${i} = x ${CAST};\n`).join('');

function tree(options: { recorded: number; live: number; extra?: Record<string, string> }): Scratch {
  const scratch = newScratch();
  installHooksCopy(scratch);
  write(scratch, 'tooling/hooks/baseline.json', JSON.stringify({ 'as-any': { 'apps/orm/src': options.recorded } }));
  write(scratch, SRC, casts(options.live));
  stage(scratch, SRC);
  for (const [path, content] of Object.entries(options.extra ?? {})) {
    write(scratch, path, content);
    stage(scratch, path);
  }

  return scratch;
}

function checkTree(scratch: Scratch, ...args: string[]): { status: number; out: string } {
  const run = spawnSync(process.execPath, ['tooling/hooks/check-tree.ts', ...args], {
    cwd: scratch.dir,
    env: scratch.env,
    encoding: 'utf8',
  });

  return { status: run.status ?? -1, out: `${run.stdout}${run.stderr}` };
}

describe('check-tree', () => {
  test('a clean tree whose baseline matches the live count passes', () => {
    const run = checkTree(tree({ recorded: 2, live: 2 }));

    expect(run.status).toBe(0);
  });

  test('a baseline above the live count fails and names the path and both numbers', () => {
    const run = checkTree(tree({ recorded: 3, live: 2 }));

    expect(run.status).toBe(1);
    expect(run.out).toContain('apps/orm/src');
    expect(run.out).toContain('2 found, 3 recorded');
  });

  test('a baseline below the live count fails and names the path and both numbers', () => {
    const run = checkTree(tree({ recorded: 1, live: 2 }));

    expect(run.status).toBe(1);
    expect(run.out).toContain('apps/orm/src');
    expect(run.out).toContain('2 found, 1 recorded');
  });

  test('a baseline of zero over a tree with no casts passes', () => {
    expect(checkTree(tree({ recorded: 0, live: 0 })).status).toBe(0);
  });

  test('a tracked file carrying a planning identifier fails whatever the baseline says', () => {
    const run = checkTree(
      tree({ recorded: 2, live: 2, extra: { 'docs/a.md': `closes ${['sli', 'ce 3'].join('')}\n` } }),
    );

    expect(run.status).toBe(1);
    expect(run.out).toContain('docs/a.md:1');
  });

  test('a tracked production file carrying a stub marker fails', () => {
    const marker = ['// f', 'ixme later\n'].join('');
    const run = checkTree(tree({ recorded: 2, live: 2, extra: { 'apps/orm/src/b.ts': marker } }));

    expect(run.status).toBe(1);
    expect(run.out).toContain('apps/orm/src/b.ts:1');
  });

  test('an argument that matches no file is an error, not a pass', () => {
    expect(checkTree(tree({ recorded: 2, live: 2 }), 'no/such/dir').status).toBe(2);
  });

  test('naming a path scans that path and leaves the baseline out of it', () => {
    const scratch = tree({ recorded: 9, live: 2 });

    expect(checkTree(scratch).status).toBe(1);
    expect(checkTree(scratch, SRC).status).toBe(0);
  });
});

guardRepositoryConfiguration();
