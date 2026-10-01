// A scratch git repository for a suite, and a git that cannot reach any other.
//
// Git tells a hook where it is through the environment. A pre-commit hook in a
// linked worktree runs with GIT_DIR, GIT_INDEX_FILE and their neighbours
// pointing at the repository being committed, which is right for the hook: its
// job is to read that repository. It is wrong for anything the hook runs that
// means to work somewhere else. The commit gate runs this directory's suite, the
// suite makes a repository in a temporary directory, and a git process honours
// those variables over the directory it was started in. So an inherited GIT_DIR
// turned "initialise a scratch repository and give it an identity" into writing
// a bare flag and the suite's identity into the real repository's configuration.
//
// Every git process a suite starts therefore runs with no git variable in its
// environment, in a directory it names. Every variable carrying the prefix is
// dropped rather than a list of the dangerous ones, because git adds variables
// between releases and a list is the thing that falls behind. The hook's own git
// in scan.ts keeps them on purpose: it is meant to read the repository git
// handed it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Environment = Readonly<Record<string, string>>;

/** The environment with every git variable taken out. */
export function withoutGit(from: Readonly<Record<string, string | undefined>> = process.env): Environment {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(from)) {
    if (value !== undefined && !name.startsWith('GIT_')) kept[name] = value;
  }
  return Object.freeze(kept);
}

/** What one git process came back with. */
export interface Ran {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Scratch {
  /** The repository's directory, under the system's temporary directory. */
  readonly dir: string;
  /** The environment every process working in the repository runs with. */
  readonly env: Environment;
  /** Run git in the repository and nowhere else. */
  git(...args: string[]): Ran;
}

/** Make an empty repository in a fresh temporary directory. */
export function scratchRepository(prefix: string): Scratch {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const env = withoutGit();
  const git = (...args: string[]): Ran => {
    const run = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
    return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
  };
  const made = git('init', '--quiet');
  if (made.status !== 0) throw new Error(`git would not initialise ${dir}: ${made.stderr}`);
  return Object.freeze({ dir, env, git });
}
