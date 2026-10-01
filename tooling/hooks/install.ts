// Points git at this directory's hook scripts.
//
// Git configuration is not cloned, so a fresh clone runs this once. Two ways
// reach that state: pointing `core.hooksPath` here, or copying the two scripts
// into the private hook directory. This installs the pointer, because the
// pointer leaves one copy of each script under version control, so a change to
// a hook takes effect for everyone at the next pull with no second install
// step, and there is no second copy that can quietly fall behind the first.

import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOOKS_DIR = 'tooling/hooks';
const HOOKS = ['pre-commit', 'commit-msg'];
const EXECUTABLE = 0o755;

function git(args: string[]): { ok: boolean; out: string } {
  const run = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  return { ok: run.exitCode === 0, out: run.stdout.toString().trim() };
}

function fail(message: string): never {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

const root = git(['rev-parse', '--show-toplevel']);
if (!root.ok) fail('This is not a git working tree, so there is nothing to install into.');

for (const hook of HOOKS) {
  const path = join(root.out, HOOKS_DIR, hook);
  if (!existsSync(path)) fail(`${HOOKS_DIR}/${hook} is missing, so the install would be partial.`);
  chmodSync(path, EXECUTABLE);
}

const set = git(['config', 'core.hooksPath', HOOKS_DIR]);
if (!set.ok) fail('git refused to record the hook directory.');

const readBack = git(['config', '--get', 'core.hooksPath']);
if (!readBack.ok || readBack.out !== HOOKS_DIR) {
  fail(`git reports the hook directory as "${readBack.out}" rather than "${HOOKS_DIR}".`);
}

process.stdout.write(`git now runs the hooks in ${HOOKS_DIR}: ${HOOKS.join(', ')}.\n`);
