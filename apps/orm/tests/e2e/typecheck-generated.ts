/**
 * Type-checks a generated tree with `skipLibCheck: false`, so its declaration files are checked
 * rather than trusted.
 *
 * Every other gate in the repo inherits `skipLibCheck: true`, which silences errors inside `.d.ts`
 * files and turns an unresolved name there into `any`. A consumer with `skipLibCheck: false` sees
 * those errors, so this runs the tree the way that consumer does.
 *
 * Only errors under the tree fail the run. The ORM's own sources and third-party declarations are
 * compiled alongside and report their own errors, which are not this gate's concern.
 *
 * Default: both pinned compilers (5.9 and 7). `--resolved` runs whatever `bunx tsc` resolves to, which
 * CI uses so the compiler matrix tests what it installed.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Compiler, compilerBin, isUnder, parseTscErrors, type TscError } from '../../bench/compilers';

const ORM_DIR = resolve(import.meta.dir, '../..');
const DEFAULT_TREE = resolve(import.meta.dir, 'generated');

export interface GeneratedCheckResult {
  readonly label: string;
  readonly exitCode: number;
  /** Errors under the tree; the only ones that fail the run */
  readonly errors: readonly TscError[];
  /** Errors elsewhere in the program, reported by files this gate does not own */
  readonly ignoredErrors: number;
}

export type CompilerChoice = Compiler | 'resolved';

function command(choice: CompilerChoice, project: string): string[] {
  const args = ['-p', project, '--noEmit', '--pretty', 'false'];

  return choice === 'resolved' ? ['bunx', 'tsc', ...args] : ['node', compilerBin(choice), ...args];
}

/** `cerial` and `ts-toolbelt` are mapped by path so a tree outside the repo resolves them like one inside it */
function tsconfig(tree: string): string {
  return JSON.stringify({
    compilerOptions: {
      lib: ['ESNext', 'DOM'],
      types: ['node'],
      typeRoots: [join(ORM_DIR, 'node_modules/@types')],
      target: 'ESNext',
      module: 'Preserve',
      moduleResolution: 'bundler',
      moduleDetection: 'force',
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      noEmit: true,
      strict: true,
      skipLibCheck: false,
      noUncheckedIndexedAccess: true,
      paths: {
        cerial: [join(ORM_DIR, 'src/index.ts')],
        'ts-toolbelt': [join(ORM_DIR, 'node_modules/ts-toolbelt')],
      },
    },
    include: [`${tree}/**/*`],
  });
}

/** Compiles `tree` under `choice` with `skipLibCheck: false` and returns the errors beneath it */
export async function typecheckGenerated(tree: string, choice: CompilerChoice): Promise<GeneratedCheckResult> {
  const root = realpathSync(resolve(tree));
  const work = mkdtempSync(join(tmpdir(), 'cerial-typecheck-generated-'));

  try {
    const project = join(work, 'tsconfig.json');
    writeFileSync(project, tsconfig(root));

    const proc = Bun.spawn(command(choice, project), { cwd: ORM_DIR, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    const all = parseTscErrors(stdout, ORM_DIR);
    const errors = all.filter((error) => isUnder(error.file, [root]));

    // A crash prints no diagnostics; without this it would read as a clean tree
    if (exitCode !== 0 && !all.length) {
      throw new Error(`tsc ${choice} exited ${exitCode} without diagnostics: ${(stderr || stdout).slice(0, 500)}`);
    }

    return { label: choice, exitCode, errors, ignoredErrors: all.length - errors.length };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const choices: CompilerChoice[] = process.argv.includes('--resolved') ? ['resolved'] : ['5.9', '7'];
  let failed = false;

  for (const choice of choices) {
    const result = await typecheckGenerated(DEFAULT_TREE, choice);
    const state = result.errors.length ? 'FAIL' : 'ok';
    console.log(
      `[typecheck:generated] ${result.label}: ${state}, ${result.errors.length} errors under the tree, ${result.ignoredErrors} ignored elsewhere`,
    );
    for (const error of result.errors.slice(0, 20)) console.error(`  ${error.message}`);
    if (result.errors.length) failed = true;
  }

  process.exit(failed ? 1 : 0);
}
