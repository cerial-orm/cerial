import { statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export type Compiler = '5.9' | '7';

/** Heap limit for every 5.9 run, so the ceiling is the same on every machine */
export const DEFAULT_MAX_OLD_SPACE_MB = 4096;

/** The pinned binaries are npm aliases in devDependencies; resolving from node_modules never touches PATH */
const COMPILER_PACKAGES: Record<Compiler, string> = {
  '5.9': 'typescript-5.9',
  '7': 'typescript-7',
};

export interface TscMetrics {
  readonly checkSeconds: number;
  readonly totalSeconds: number;
  readonly types: number;
  readonly instantiations: number;
  readonly memoryKb: number;
}

export interface TscError {
  readonly file: string;
  readonly message: string;
}

export interface TscRunOptions {
  /** Directories whose errors fail the run; errors anywhere else are counted in `ignoredErrors` */
  readonly countedRoots: readonly string[];
  /** Heap limit for 5.9, in MB; 7 is native and has no such flag */
  readonly maxOldSpaceMb?: number;
}

export interface TscResult {
  readonly compiler: Compiler;
  /** `ok` carries metrics; `heap-exhausted` is a measurement outcome, not a harness failure */
  readonly state: 'ok' | 'heap-exhausted';
  readonly exitCode: number | null;
  readonly metrics: TscMetrics | null;
  readonly ignoredErrors: number;
}

/** Path of the pinned compiler's bin, resolved from this package's node_modules */
export function compilerBin(compiler: Compiler): string {
  // `exports` hides bin/, but package.json is exported by both 5.9 and 7
  const manifest = Bun.fileURLToPath(import.meta.resolve(`${COMPILER_PACKAGES[compiler]}/package.json`));

  return join(dirname(manifest), 'bin', 'tsc');
}

function readNumber(text: string, label: string): number | null {
  const match = new RegExp(`^${label}:\\s+([\\d.]+)`, 'm').exec(text);

  return match ? Number(match[1]) : null;
}

/**
 * Reads the `--extendedDiagnostics` block of either compiler: 5.9 prints `Lines of TypeScript:`, `Memory used: 49146K`
 * and `Check time: 0.00s`; 7 prints `Lines:` and `Memory used: 25540K`. Returns null when the block is absent.
 */
export function parseExtendedDiagnostics(text: string): TscMetrics | null {
  const checkSeconds = readNumber(text, 'Check time');
  const totalSeconds = readNumber(text, 'Total time');
  const types = readNumber(text, 'Types');
  const instantiations = readNumber(text, 'Instantiations');
  const memoryKb = readNumber(text, 'Memory used');
  if (
    checkSeconds === null ||
    totalSeconds === null ||
    types === null ||
    instantiations === null ||
    memoryKb === null
  ) {
    return null;
  }

  return { checkSeconds, totalSeconds, types, instantiations, memoryKb };
}

/** Diagnostics in tsc's plain format, `file(line,col): error TSnnnn: message`, with `file` resolved against `cwd` */
export function parseTscErrors(text: string, cwd: string): TscError[] {
  const errors: TscError[] = [];

  for (const line of text.split('\n')) {
    const match = /^(.+?)\(\d+,\d+\): error TS\d+: /.exec(line);
    if (match) errors.push({ file: resolve(cwd, match[1]!), message: line.trim() });
  }

  return errors;
}

function isUnder(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const dir = resolve(root);

    return file === dir || file.startsWith(dir + sep);
  });
}

function isHeapExhausted(stderr: string, signal: unknown): boolean {
  return (
    /JavaScript heap out of memory|Allocation failed|ERR_WORKER_OUT_OF_MEMORY/.test(stderr) || signal === 'SIGABRT'
  );
}

/**
 * Runs the pinned compiler over `project` (a directory with a tsconfig, or a tsconfig path) with `--extendedDiagnostics`.
 * Throws with the first error under `countedRoots`, so a broken case cannot produce a flattering number.
 */
export async function runTsc(compiler: Compiler, project: string, options: TscRunOptions): Promise<TscResult> {
  const cwd = statSync(project).isDirectory() ? resolve(project) : dirname(resolve(project));
  const heapMb = options.maxOldSpaceMb ?? DEFAULT_MAX_OLD_SPACE_MB;
  const heapFlag = compiler === '5.9' ? [`--max-old-space-size=${heapMb}`] : [];
  const proc = Bun.spawn(
    ['node', ...heapFlag, compilerBin(compiler), '-p', resolve(project), '--extendedDiagnostics'],
    {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

  if (isHeapExhausted(stderr, proc.signalCode)) {
    return { compiler, state: 'heap-exhausted', exitCode, metrics: null, ignoredErrors: 0 };
  }

  const errors = parseTscErrors(stdout, cwd);
  const counted = errors.find((error) => isUnder(error.file, options.countedRoots));
  if (counted) throw new Error(`tsc ${compiler} failed: ${counted.message}`);

  const metrics = parseExtendedDiagnostics(stdout);
  if (!metrics) {
    throw new Error(`tsc ${compiler} printed no diagnostics (exit ${exitCode}): ${(stderr || stdout).slice(0, 500)}`);
  }

  return { compiler, state: 'ok', exitCode, metrics, ignoredErrors: errors.length };
}
