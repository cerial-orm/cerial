import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardUnknownModels } from '../src/client/unknown-model-guard';
import type { ModelRegistry } from '../src/types';
import { compilerBin } from './compilers';
import { type BenchOptions, assertDistFresh, measureCase, median } from './curve';
import { syntheticSchema } from './schema';

export const MIN_PROCESSES = 5;
export type Runtime = 'bun' | 'node';

/**
 * Node cannot import the generated `.ts` tree (`ERR_UNSUPPORTED_DIR_IMPORT` on `./enums`), so the tree is compiled to
 * CommonJS first. These flags are the ones that work under the pinned 5.9 compiler. `--noCheck` skips type checking:
 * the output is the same JS, and checking the 1000+ model trees exhausted the compiler's heap while measuring nothing
 * the import timing uses (type equivalence is benched separately).
 */
export const NODE_COMPILE_FLAGS: readonly string[] = [
  '--module',
  'commonjs',
  '--moduleResolution',
  'node10',
  '--target',
  'ES2022',
  '--lib',
  'ESNext,DOM',
  '--esModuleInterop',
  '--skipLibCheck',
  '--noCheck',
  '--types',
  'node',
  '--typeRoots',
  './node_modules/@types',
  '--outDir',
  'js',
];

const PACKAGE_ROOT = join(import.meta.dir, '..');
/** Directory names under the case that hold compiled output */
const COMPILED_DIR = 'js';

export interface ImportRow {
  readonly size: number;
  readonly runtime: Runtime;
  readonly processes: number;
  readonly rssMb: number;
  readonly importMs: number;
  /** Flags that produced the measured code: the compile flags for Node, none for Bun */
  readonly flags: string;
}

export interface ProxyRow {
  readonly accesses: number;
  readonly wrappedNs: number;
  readonly unwrappedNs: number;
  readonly overheadNs: number;
}

export interface RuntimeResult {
  readonly imports: readonly ImportRow[];
  readonly proxy: ProxyRow;
}

export interface RuntimeOptions {
  readonly bench: BenchOptions;
  /** Processes per runtime and size; below `MIN_PROCESSES` a median is not a measurement */
  readonly processes: number;
}

export interface RuntimeOverrides {
  /** Edits the generated tree before it is measured, so a test can prove a broken tree fails the row */
  readonly tamper?: (genDir: string) => void;
  readonly allowStale?: boolean;
}

export function assertEnoughProcesses(processes: number): void {
  if (!Number.isInteger(processes) || processes < MIN_PROCESSES) {
    throw new Error(`a median needs at least ${MIN_PROCESSES} processes, got ${processes}`);
  }
}

interface ChildReport {
  readonly rssBytes: number;
  readonly importMs: number;
}

// The report is the last stdout line, so anything the generated module prints cannot corrupt it
const BUN_SCRIPT = `const t = performance.now(); await import(process.argv[1]); const ms = performance.now() - t;
console.log(JSON.stringify({ rssBytes: process.memoryUsage().rss, importMs: ms }));`;
const NODE_SCRIPT = `const t = performance.now(); require(process.argv[1]); const ms = performance.now() - t;
console.log(JSON.stringify({ rssBytes: process.memoryUsage().rss, importMs: ms }));`;

async function importOnce(runtime: Runtime, caseDir: string): Promise<ChildReport> {
  const argv =
    runtime === 'bun'
      ? [process.execPath, '-e', BUN_SCRIPT, join(caseDir, 'gen', 'index.ts')]
      : ['node', '-e', NODE_SCRIPT, join(caseDir, COMPILED_DIR, 'index.js')];
  const proc = Bun.spawn(argv, { cwd: caseDir, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  if (exitCode !== 0)
    throw new Error(`${runtime} import failed (exit ${exitCode}): ${(stderr || stdout).slice(0, 500)}`);

  const report = JSON.parse(stdout.trim().split('\n').pop()!) as ChildReport;
  if (!(report.rssBytes > 0)) throw new Error(`${runtime} import reported no RSS`);

  return report;
}

async function compileForNode(caseDir: string): Promise<void> {
  const proc = Bun.spawn(['node', compilerBin('5.9'), ...NODE_COMPILE_FLAGS, join('gen', 'index.ts')], {
    cwd: caseDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  // syntax and resolution errors still fail; type errors are not reported under --noCheck
  if (exitCode !== 0)
    throw new Error(`node compile step failed (exit ${exitCode}): ${(stderr || stdout).slice(0, 500)}`);
}

/** Median RSS and import time over `processes` fresh processes; each process imports the tree once, cold */
export async function measureImport(
  runtime: Runtime,
  caseDir: string,
  size: number,
  processes: number,
): Promise<ImportRow> {
  assertEnoughProcesses(processes);
  if (runtime === 'node') await compileForNode(caseDir);

  const reports: ChildReport[] = [];
  for (let i = 0; i < processes; i++) reports.push(await importOnce(runtime, caseDir));

  return {
    size,
    runtime,
    processes,
    rssMb: Number((median(reports.map((r) => r.rssBytes)) / 1024 / 1024).toFixed(1)),
    importMs: Number(median(reports.map((r) => r.importMs)).toFixed(1)),
    flags: runtime === 'node' ? `tsc ${NODE_COMPILE_FLAGS.join(' ')}` : 'bun -e import(gen/index.ts)',
  };
}

const MEMBERS = ['db', 'connect', 'disconnect', 'migrate', '$transaction', 'getMetadata', 'query', 'close'];

function accessLoop(target: Record<string, unknown>, accesses: number): number {
  let seen = 0;
  for (let i = 0; i < accesses; i++) if (target[MEMBERS[i & 7]!] !== undefined) seen++;

  return seen;
}

/** The same object the guard wraps, so the only difference between the two loops is the `get` trap */
function sampleClient(): Record<string, unknown> {
  return Object.fromEntries(MEMBERS.map((name) => [name, () => name]));
}

export function guardedSample(): Record<string, unknown> {
  const registry: ModelRegistry = {};

  return guardUnknownModels(sampleClient(), registry);
}

/** ns per access of a member that exists, through the real guard and through the bare object; no connection is made */
export function measureProxy(accesses = 2_000_000, rounds = 7): ProxyRow {
  const plain = sampleClient();
  const guarded = guardedSample();
  // Warm-up lets the JIT settle on both shapes before anything is timed
  accessLoop(plain, accesses);
  accessLoop(guarded, accesses);

  const time = (target: Record<string, unknown>): number => {
    const samples: number[] = [];
    for (let round = 0; round < rounds; round++) {
      const started = performance.now();
      const seen = accessLoop(target, accesses);
      const elapsed = performance.now() - started;
      // A loop that found nothing was optimised or mistyped, and its time means nothing
      if (seen !== accesses) throw new Error('proxy bench read a member that does not exist');
      samples.push((elapsed * 1e6) / accesses);
    }

    return median(samples);
  };

  const unwrappedNs = time(plain);
  const wrappedNs = time(guarded);

  return {
    accesses,
    wrappedNs: Number(wrappedNs.toFixed(2)),
    unwrappedNs: Number(unwrappedNs.toFixed(2)),
    overheadNs: Number((wrappedNs - unwrappedNs).toFixed(2)),
  };
}

/** Imports each size's generated tree under Bun and Node in fresh processes, then times the guard's `get` trap */
export async function runRuntime(options: RuntimeOptions, overrides: RuntimeOverrides = {}): Promise<RuntimeResult> {
  assertEnoughProcesses(options.processes);
  if (!overrides.allowStale) assertDistFresh(join(PACKAGE_ROOT, 'dist', 'index.d.mts'), join(PACKAGE_ROOT, 'src'));

  const root = mkdtempSync(join(tmpdir(), 'cerial-bench-runtime-'));
  const cleanup = (): void => rmSync(root, { recursive: true, force: true });
  process.on('exit', cleanup);

  try {
    const imports: ImportRow[] = [];
    let index = 0;

    for (const size of options.bench.sizes) {
      const schemaDir = join(root, `schema-${size}`);
      mkdirSync(schemaDir, { recursive: true });
      writeFileSync(
        join(schemaDir, 'bench.cerial'),
        syntheticSchema({ models: size, fieldsPerModel: options.bench.fields, seed: 1 }),
      );
      // No compilers and one run: only the generated tree and its linked dependencies are wanted
      await measureCase(
        root,
        { name: String(size), size, schemaDir, consumer: 'export {};\n' },
        { ...options.bench, runs: 1, compilers: [] },
        index,
      );
      const caseDir = join(root, `case-${index++}`);
      overrides.tamper?.(join(caseDir, 'gen'));

      for (const runtime of ['bun', 'node'] as const) {
        imports.push(await measureImport(runtime, caseDir, size, options.processes));
      }
    }

    return { imports, proxy: measureProxy() };
  } finally {
    cleanup();
    process.off('exit', cleanup);
  }
}

export function formatRuntime(result: RuntimeResult): string {
  const header = ['models', 'runtime', 'processes', 'RSS (MB)', 'import (ms)'];
  const body = result.imports.map((row) => [
    String(row.size),
    row.runtime,
    String(row.processes),
    row.rssMb.toFixed(1),
    row.importMs.toFixed(1),
  ]);
  const widths = header.map((title, col) => Math.max(title.length, ...body.map((line) => line[col]!.length)));
  const render = (line: string[]): string =>
    line
      .map((cell, col) => cell.padEnd(widths[col]!))
      .join('  ')
      .trimEnd();
  const flags = [...new Set(result.imports.map((row) => `${row.runtime}: ${row.flags}`))];
  const { proxy } = result;

  return [
    render(header),
    ...body.map(render),
    '',
    ...flags,
    '',
    `guard get trap, ${proxy.accesses} accesses per round: wrapped ${proxy.wrappedNs} ns, unwrapped ${proxy.unwrappedNs} ns, overhead ${proxy.overheadNs} ns`,
  ].join('\n');
}
