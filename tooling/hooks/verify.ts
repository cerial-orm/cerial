// The third gate: what is fast enough to run on every commit and needs nothing
// running beside it. Everything heavier stays in CI on purpose. The generated
// client, the compile-time type checks, the integration suite and the end-to-end
// suite need a live SurrealDB, and a gate that needs one refuses every commit
// from a contributor who does not have it running, which teaches them to skip
// the gate instead. Do not add those suites here.

import { join } from 'node:path';
import { stagedPaths } from './scan.ts';
import { withoutGit } from './scratch.ts';

const ROOT = join(import.meta.dir, '..', '..');

export interface VerifyResult {
  readonly ok: boolean;
  readonly detail: string;
}

/** One command the verify runs, and the directory it runs in. */
export interface Step {
  readonly name: string;
  readonly command: readonly string[];
  readonly cwd: string;
}

/** What running the verify reaches for: the environment it inherits and the spawn that runs a step. */
export interface VerifyParts {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly paths: () => string[] | null;
  readonly spawn: (
    command: string[],
    options: {
      readonly cwd: string;
      readonly env: Record<string, string>;
      readonly stdout: 'inherit';
      readonly stderr: 'inherit';
    },
  ) => { readonly exitCode: number | null };
}

const REAL: VerifyParts = {
  env: process.env,
  paths: stagedPaths,
  spawn: (command, options) => Bun.spawnSync(command, options),
};

/** The steps, in the order they run. Formatting is first because it is the cheapest to fail. */
export function verifySteps(paths: readonly string[], bun: string = process.execPath): Step[] {
  return [
    {
      name: 'oxfmt check on the staged files',
      command: [bun, 'x', 'oxfmt', '--check', '--no-error-on-unmatched-pattern', ...paths],
      cwd: ROOT,
    },
    {
      name: 'oxlint on the staged files',
      command: [bun, 'x', 'oxlint', '--deny-warnings', '--no-error-on-unmatched-pattern', ...paths],
      cwd: ROOT,
    },
    {
      // Runs the package's own script rather than a copy of its folder list, so a folder added to
      // that script is gated without a second edit here.
      name: 'ORM unit suites',
      command: [bun, 'run', 'test'],
      cwd: join(ROOT, 'apps/orm'),
    },
    {
      name: 'extension unit and grammar suites',
      command: [bun, 'test', 'tests/unit', 'tests/grammar'],
      cwd: join(ROOT, 'apps/vscode-extension'),
    },
  ];
}

/**
 * Runs the steps and stops at the first that fails. A step that cannot be run is
 * a failed step rather than a skipped one.
 *
 * Each step runs with every git variable taken out of its environment and
 * everything else kept. Git hands a hook GIT_DIR, GIT_INDEX_FILE and their
 * neighbours so the hook can read the commit, and a hook in a linked worktree is
 * handed them pointing at that worktree's repository. The steps need none of
 * them, because they check the working tree they run in. Passed on, they reach
 * every suite, and any git process a suite starts then acts on the repository
 * being committed rather than the one it meant, which is how a suite once wrote
 * a bare flag and its own identity into the real configuration.
 *
 * A verify with no staged path is refused before any step is spawned. The file
 * steps take their paths as arguments, and oxfmt and oxlint given none check the
 * whole project, so the gate would refuse a commit over files it does not contain.
 * A failed git call is refused apart from an empty index, so a broken git is not
 * reported as nothing staged.
 *
 * The parts are handed in so a suite can see what each spawn is given without
 * running a verify. The hook passes none and gets the real ones.
 */
export function runVerify(parts: VerifyParts = REAL): VerifyResult {
  const paths = parts.paths();
  if (paths === null)
    return { ok: false, detail: 'git could not list the staged files, so there is nothing to verify.' };
  if (!paths.length) return { ok: false, detail: 'No files are staged, so there is nothing to verify.' };

  const env = { ...withoutGit(parts.env) };
  for (const step of verifySteps(paths)) {
    const run = parts.spawn([...step.command], { cwd: step.cwd, env, stdout: 'inherit', stderr: 'inherit' });
    if (run.exitCode !== 0) return { ok: false, detail: `${step.name} exited ${run.exitCode}.` };
  }

  return { ok: true, detail: '' };
}
