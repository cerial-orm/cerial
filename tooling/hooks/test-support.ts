// What the hook suites share: scratch repositories, a way to run the scans inside
// one, and the fixtures that name the markers the scans refuse.
//
// The scans read every committed file, this one included, so a fixture that
// spells a marker plainly would refuse the commit that carries it. Each marker
// is therefore assembled at run time from pieces that match nothing on their own.

import { afterAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Refusal } from './scan.ts';
import { type Ran, type Scratch, scratchRepository, withoutGit } from './scratch.ts';

export const HOOKS_DIR = import.meta.dir;
export const REPO_ROOT = join(HOOKS_DIR, '..', '..');

const made: Scratch[] = [];

/** A fresh scratch repository, removed by {@link removeScratches}. */
export function newScratch(): Scratch {
  const scratch = scratchRepository('cerial-hooks-');
  made.push(scratch);

  return scratch;
}

/** Registers the cleanup of every scratch repository the file made. */
export function removeScratchesAfterAll(): void {
  afterAll(() => {
    for (const scratch of made.splice(0)) rmSync(scratch.dir, { recursive: true, force: true });
  });
}

export function write(scratch: Scratch, path: string, content: string): void {
  const full = join(scratch.dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

export function stage(scratch: Scratch, ...paths: string[]): void {
  const added = scratch.git('add', '-f', '--', ...paths);
  if (added.status !== 0) throw new Error(`git add failed: ${added.stderr}`);
}

/** Commit what is staged, with an identity given on the command line and no hook of anyone's. */
export function commit(scratch: Scratch, message = 'chore: seed'): Ran {
  const run = scratch.git(
    '-c',
    'user.name=Suite',
    '-c',
    'user.email=suite@example.com',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    message,
  );
  if (run.status !== 0) throw new Error(`git commit failed: ${run.stderr}`);

  return run;
}

/** Put a file in the scratch repository, add it, and commit it. */
export function seed(scratch: Scratch, files: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(files)) {
    write(scratch, path, content);
    stage(scratch, path);
  }
  commit(scratch);
}

/** Run a bun script with the scratch repository as its working directory and no git variable inherited. */
export function runScript(scratch: Scratch, script: string): Ran {
  const run = spawnSync(process.execPath, ['-e', script], { cwd: scratch.dir, env: scratch.env, encoding: 'utf8' });

  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
}

function runJson<T>(scratch: Scratch, script: string): T {
  const run = runScript(scratch, script);
  if (run.status !== 0) throw new Error(`script exited ${run.status}: ${run.stderr}`);

  return JSON.parse(run.stdout) as T;
}

const url = (file: string): string => JSON.stringify(join(HOOKS_DIR, file));

/** What the pre-commit hook's scans say about the index, without the verify step that follows them. */
export function stagedRefusals(scratch: Scratch): Refusal[] {
  return runJson<Refusal[]>(
    scratch,
    `import { readStaged, scanFiles } from ${url('scan.ts')};
     import { scanStagedState } from ${url('repo-scans.ts')};
     const staged = readStaged();
     const found = [...staged.refusals, ...scanFiles(staged.files), ...scanStagedState(staged.files)];
     console.log(JSON.stringify(found));`,
  );
}

/** What the message gate says, reading the package versions from the scratch repository's index. */
export function messageRefusals(scratch: Scratch, message: string): Refusal[] {
  return runJson<Refusal[]>(
    scratch,
    `import { checkMessage } from ${url('message.ts')};
     console.log(JSON.stringify(checkMessage(${JSON.stringify(message)})));`,
  );
}

/** The baseline ratchet reports a scratch repository always disagrees with, because it holds few casts. */
export const NOISE = 'ratchet.baseline-stale';

export function ruleNames(refusals: readonly Refusal[], ignoring: readonly string[] = []): string[] {
  return refusals.map((refusal) => refusal.rule).filter((rule) => !ignoring.includes(rule));
}

/** The hooks, and the one file of the ORM they import, copied so a scratch repository can run them whole. */
export function installHooksCopy(scratch: Scratch): void {
  for (const name of readdirSync(HOOKS_DIR)) {
    if (name.endsWith('.test.ts') || name === 'README.md') continue;
    cpSync(join(HOOKS_DIR, name), join(scratch.dir, 'tooling/hooks', name));
  }
  const utility = 'apps/orm/src/utils/string-utils.ts';
  mkdirSync(dirname(join(scratch.dir, utility)), { recursive: true });
  cpSync(join(REPO_ROOT, utility), join(scratch.dir, utility));
}

function realConfiguration(): string {
  const run = spawnSync('git', ['config', '--local', '--list'], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });

  return `${run.status}\n${run.stdout}`;
}

function realHooksPath(): string | null {
  const run = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
  });

  return run.status === 0 ? run.stdout.trim() : null;
}

/**
 * Registers the test that proves the suite wrote nothing into this repository's
 * configuration. It compares against what the file found when it loaded, so it
 * holds whether the hooks have been activated here or not: the point is that the
 * suite did not change it, and the repository's own `core.hooksPath` is the value
 * a leaked git variable would have rewritten. Call it last in a file.
 */
export function guardRepositoryConfiguration(): void {
  const before = realConfiguration();
  const hooksPathBefore = realHooksPath();
  test("leaves this repository's git configuration exactly as it found it", () => {
    expect(realHooksPath()).toBe(hooksPathBefore);
    expect(realConfiguration()).toBe(before);
  });
}

export function sameDirectory(a: string, b: string): boolean {
  return realpathSync(a) === realpathSync(b);
}

export { withoutGit };

/** A refused line and a near miss that must pass, for one rule. */
export interface Fixture {
  readonly refused: string;
  readonly passes: string;
}

const join2 = (...pieces: string[]): string => pieces.join('');

/** Planning identifiers, keyed by rule. Read by the tree scan and by the message gate alike. */
export const TRACKER_FIXTURES: Readonly<Record<string, Fixture>> = {
  'tracker.decision-record': {
    refused: `see ${join2('AD', 'R-0012')} for why`,
    passes: `error ${join2('E-AD', 'R-123')} is raised`,
  },
  'tracker.specification': {
    refused: `see ${join2('S', 'R-0042')} for the shape`,
    passes: `error ${join2('E-S', 'R-123')} is raised`,
  },
  'tracker.plan-item': {
    refused: `closes ${join2('sli', 'ce 3')} of the plan`,
    passes: 'slice the array in two',
  },
  'tracker.task-row': {
    refused: `finishes ${join2('ta', 'sk 12')} in the plan`,
    passes: 'add one task to the list',
  },
  'tracker.ledger-id': {
    refused: `covers ${join2('12', '-345')} in the ledger`,
    passes: `covers x${join2('12', '-345')} in the ledger`,
  },
  'tracker.section-reference': {
    refused: `as set out in ${String.fromCharCode(0xa7)} 4 of the plan`,
    passes: 'as set out in section four',
  },
  'tracker.planning-path': {
    refused: `listed in ${join2('.o', 'mc/plans/a.md')}`,
    passes: 'the omc plugin is not a path',
  },
};

/** Stub markers, keyed by rule. Their scan reads production paths only. */
export const STUB_FIXTURES: Readonly<Record<string, Fixture>> = {
  'stub.come-back-to-it': { refused: `// ${join2('t', 'odo')}: wire it up`, passes: '// the todos are listed' },
  'stub.fix-it-later': { refused: `// ${join2('f', 'ixme')} later`, passes: '// this was fixed' },
  'stub.bare-alarm': { refused: `// ${join2('X', 'XX')} look again`, passes: '// xxx in lower case is a count' },
  'stub.admitted-workaround': { refused: `// a ${join2('h', 'ack')} for now`, passes: '// a hackathon entry' },
  'stub.unfinished-marker': { refused: `// ${join2('unimpl', 'emented')} branch`, passes: '// implemented branch' },
  'stub.unfinished-phrase': { refused: `// ${join2('not impl', 'emented')} yet`, passes: '// implemented already' },
  'stub.partial-work': { refused: `// ${join2('W', 'IP')} do not merge`, passes: '// a wip branch name in lower case' },
  'stub.stand-in-value': {
    refused: `const x = '${join2('PLACEH', 'OLDER')}';`,
    passes: '<input placeholder="Name" />',
  },
};

/** A tombstone, spelled as the pattern source spells it. */
export const TOMB = join2('T', 'OMBSTONE');
