import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { CORPUS_CONSUMER_SPEC, consumerSource, syntheticConsumerSpec } from './consumer';
import { type Compiler, DEFAULT_MAX_OLD_SPACE_MB, runTsc } from './compilers';
import { syntheticSchema } from './schema';

export const DEFAULT_SIZES: readonly number[] = [10, 50, 100, 250, 500, 1000, 1250, 1500];
export const DEFAULT_FIELDS = 10;
const SEED = 1;

const PACKAGE_ROOT = join(import.meta.dir, '..');

export interface BenchOptions {
  readonly sizes: readonly number[];
  readonly runs: number;
  readonly compilers: readonly Compiler[];
  readonly fields: number;
  readonly json: string | null;
  readonly ceiling: number | null;
  /** Heap limit for 5.9 runs; the default is what makes the ceiling the same on every machine */
  readonly heapMb: number;
}

export interface CaseRow {
  /** `corpus` or the model count */
  readonly name: string;
  readonly compiler: Compiler;
  readonly size: number | null;
  readonly state: 'ok' | 'heap-exhausted';
  readonly checkSeconds: number | null;
  readonly instantiations: number | null;
  readonly types: number | null;
  readonly memoryMb: number | null;
  readonly outputBytes: number;
  readonly files: number;
  readonly largestFile: string;
  readonly largestFileBytes: number;
  readonly codegenMs: number;
}

export interface RunOverrides {
  /** Replaces the consumer file, so a test can prove a broken query fails the run */
  readonly consumer?: string;
  /** Skips the dist freshness check, for tests that run before the build */
  readonly allowStale?: boolean;
}

export function median(values: readonly number[]): number {
  if (!values.length) throw new Error('median of no values');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function parseIntegerList(flag: string, text: string, min: number): number[] {
  const values = text.split(',').map((part) => Number(part.trim()));
  if (!values.length || values.some((value) => !Number.isInteger(value) || value < min)) {
    throw new Error(`${flag} takes integers of at least ${min}, got "${text}"`);
  }

  return values;
}

function parseInteger(flag: string, text: string, min: number): number {
  return parseIntegerList(flag, text, min)[0]!;
}

/** Reads `--sizes 10,50 --runs 3 --compiler 5.9|7|all --fields n --json path --ceiling n --heap-mb n`; refuses anything else */
export function parseBenchArgs(argv: readonly string[]): BenchOptions {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    if (!['--sizes', '--runs', '--compiler', '--fields', '--json', '--ceiling', '--heap-mb'].includes(flag)) {
      throw new Error(`unknown argument "${flag}"`);
    }
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    values.set(flag, value);
  }

  const compiler = values.get('--compiler') ?? 'all';
  if (!['5.9', '7', 'all'].includes(compiler)) throw new Error(`--compiler takes 5.9, 7 or all, got "${compiler}"`);

  const ceiling = values.has('--ceiling') ? parseInteger('--ceiling', values.get('--ceiling')!, 3) : null;
  const sizes = values.has('--sizes')
    ? parseIntegerList('--sizes', values.get('--sizes')!, 3)
    : ceiling !== null
      ? [ceiling]
      : [...DEFAULT_SIZES];
  if (ceiling !== null && !sizes.includes(ceiling)) sizes.push(ceiling);

  return {
    sizes,
    runs: values.has('--runs') ? parseInteger('--runs', values.get('--runs')!, 1) : 3,
    compilers: compiler === 'all' ? ['5.9', '7'] : [compiler as Compiler],
    fields: values.has('--fields') ? parseInteger('--fields', values.get('--fields')!, 1) : DEFAULT_FIELDS,
    json: values.get('--json') ?? null,
    ceiling,
    heapMb: values.has('--heap-mb') ? parseInteger('--heap-mb', values.get('--heap-mb')!, 1) : DEFAULT_MAX_OLD_SPACE_MB,
  };
}

function newestMtime(dir: string): { file: string; mtimeMs: number } {
  let newest = { file: dir, mtimeMs: 0 };

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const candidate = entry.isDirectory() ? newestMtime(path) : { file: path, mtimeMs: statSync(path).mtimeMs };
    if (candidate.mtimeMs > newest.mtimeMs) newest = candidate;
  }

  return newest;
}

/** A stale `dist/` measures old code, so the run stops and names the fix */
export function assertDistFresh(distFile: string, srcDir: string): void {
  let builtAt: number;
  try {
    builtAt = statSync(distFile).mtimeMs;
  } catch {
    throw new Error(`${distFile} does not exist; run \`bun run build\` in apps/orm first`);
  }

  const newest = newestMtime(srcDir);
  if (newest.mtimeMs > builtAt) {
    throw new Error(
      `${distFile} is older than ${newest.file}; run \`bun run build\` in apps/orm first, since a stale dist/ measures old code`,
    );
  }
}

interface TreeStats {
  readonly bytes: number;
  readonly files: number;
  readonly largest: string;
  readonly largestBytes: number;
}

function treeStats(dir: string): TreeStats {
  let bytes = 0;
  let files = 0;
  let largest = '';
  let largestBytes = -1;

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }

      const size = statSync(path).size;
      bytes += size;
      files++;
      if (size > largestBytes) {
        largest = relative(dir, path);
        largestBytes = size;
      }
    }
  };
  walk(dir);

  return { bytes, files, largest, largestBytes };
}

/** `node_modules` as a real consumer has it: `cerial` resolves through the built `dist/` */
function linkDependencies(caseDir: string): void {
  const modules = join(caseDir, 'node_modules');
  mkdirSync(join(modules, '@types'), { recursive: true });
  symlinkSync(PACKAGE_ROOT, join(modules, 'cerial'));

  for (const name of ['surrealdb', 'ts-toolbelt']) {
    const manifest = Bun.fileURLToPath(import.meta.resolve(`${name}/package.json`));
    symlinkSync(dirname(manifest), join(modules, name));
  }

  const nodeTypes = Bun.fileURLToPath(import.meta.resolve('@types/node/package.json'));
  symlinkSync(dirname(nodeTypes), join(modules, '@types', 'node'));
}

async function generate(schemaDir: string, genDir: string): Promise<number> {
  const started = performance.now();
  const proc = Bun.spawn(
    ['node', join(PACKAGE_ROOT, 'dist', 'bin', 'cerial.mjs'), 'generate', '-s', schemaDir, '-o', genDir, '-y'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  const elapsed = performance.now() - started;
  if (exitCode !== 0) throw new Error(`cerial generate failed (exit ${exitCode}): ${(stderr || stdout).slice(0, 500)}`);

  return elapsed;
}

interface CaseInput {
  readonly name: string;
  readonly size: number | null;
  readonly schemaDir: string;
  readonly consumer: string;
}

/** Generates the tree `runs` times for the codegen median, then compiles it `runs` times per compiler */
async function measureCase(root: string, input: CaseInput, options: BenchOptions, index: number): Promise<CaseRow[]> {
  const caseDir = join(root, `case-${index}`);
  const genDir = join(caseDir, 'gen');
  mkdirSync(caseDir, { recursive: true });
  linkDependencies(caseDir);
  writeFileSync(join(caseDir, 'consumer.ts'), input.consumer);
  writeFileSync(
    join(caseDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: 'ESNext',
        module: 'preserve',
        moduleResolution: 'bundler',
        lib: ['ESNext', 'DOM'],
        types: ['node'],
        typeRoots: ['./node_modules/@types'],
        noUncheckedIndexedAccess: true,
      },
      include: ['consumer.ts', 'gen/**/*.ts'],
    }),
  );

  const codegen: number[] = [];
  for (let run = 0; run < options.runs; run++) {
    rmSync(genDir, { recursive: true, force: true });
    codegen.push(await generate(input.schemaDir, genDir));
  }

  const stats = treeStats(genDir);
  const rows: CaseRow[] = [];

  for (const compiler of options.compilers) {
    const checks: number[] = [];
    let first: { instantiations: number; types: number; memoryKb: number } | null = null;
    let state: CaseRow['state'] = 'ok';

    for (let run = 0; run < options.runs; run++) {
      const result = await runTsc(compiler, caseDir, {
        countedRoots: [genDir, join(caseDir, 'consumer.ts')],
        maxOldSpaceMb: options.heapMb,
      });
      if (result.state === 'heap-exhausted' || !result.metrics) {
        state = 'heap-exhausted';
        break;
      }

      const { instantiations, types, memoryKb, checkSeconds } = result.metrics;
      if (first && (first.types !== types || first.instantiations !== instantiations)) {
        throw new Error(
          `${input.name} ${compiler}: types and instantiations differ between runs (${first.types}/${first.instantiations} then ${types}/${instantiations})`,
        );
      }
      first ??= { instantiations, types, memoryKb };
      checks.push(checkSeconds);
    }

    rows.push({
      name: input.name,
      compiler,
      size: input.size,
      state,
      checkSeconds: checks.length ? median(checks) : null,
      instantiations: first?.instantiations ?? null,
      types: first?.types ?? null,
      memoryMb: first ? Math.round(first.memoryKb / 1024) : null,
      outputBytes: stats.bytes,
      files: stats.files,
      largestFile: stats.largest,
      largestFileBytes: stats.largestBytes,
      codegenMs: Math.round(median(codegen)),
    });
  }

  return rows;
}

export interface BenchResult {
  readonly rows: readonly CaseRow[];
  /** Reasons the run must exit non-zero; empty when it passed */
  readonly failures: readonly string[];
}

/** Rows at the ceiling size that ran out of heap */
export function ceilingFailures(rows: readonly CaseRow[], ceiling: number | null): string[] {
  if (ceiling === null) return [];

  return rows
    .filter((row) => row.size === ceiling && row.state === 'heap-exhausted')
    .map((row) => `${row.compiler} ran out of heap at ${ceiling} models`);
}

/** Measures every size and the corpus; throws on a stale `dist/` or when generated types or a consumer query fail to compile */
export async function runBench(options: BenchOptions, overrides: RunOverrides = {}): Promise<BenchResult> {
  if (!overrides.allowStale) assertDistFresh(join(PACKAGE_ROOT, 'dist', 'index.d.mts'), join(PACKAGE_ROOT, 'src'));

  const root = mkdtempSync(join(tmpdir(), 'cerial-bench-'));
  const cleanup = (): void => rmSync(root, { recursive: true, force: true });
  process.on('exit', cleanup);

  try {
    const rows: CaseRow[] = [];
    let index = 0;

    for (const size of options.sizes) {
      const schema = syntheticSchema({ models: size, fieldsPerModel: options.fields, seed: SEED });
      const schemaDir = join(root, `schema-${size}`);
      mkdirSync(schemaDir, { recursive: true });
      writeFileSync(join(schemaDir, 'bench.cerial'), schema);
      const consumer = overrides.consumer ?? consumerSource(syntheticConsumerSpec(schema));
      rows.push(...(await measureCase(root, { name: String(size), size, schemaDir, consumer }, options, index++)));
    }

    const consumer = overrides.consumer ?? consumerSource(CORPUS_CONSUMER_SPEC);
    const corpus = { name: 'corpus', size: null, schemaDir: join(PACKAGE_ROOT, 'tests', 'e2e', 'schemas'), consumer };
    rows.push(...(await measureCase(root, corpus, options, index++)));

    return { rows, failures: ceilingFailures(rows, options.ceiling) };
  } finally {
    cleanup();
    process.off('exit', cleanup);
  }
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

/** One line per case and compiler, with a header; plain text so a run can be pasted anywhere */
export function formatCurve(rows: readonly CaseRow[]): string {
  const header = [
    'models',
    'compiler',
    'check (s)',
    'instantiations',
    'types',
    'memory (MB)',
    'output (MB)',
    'files',
    'largest file',
    'codegen (ms)',
    'state',
  ];
  const body = rows.map((row) => [
    row.name,
    row.compiler,
    row.checkSeconds === null ? '-' : row.checkSeconds.toFixed(3),
    row.instantiations === null ? '-' : String(row.instantiations),
    row.types === null ? '-' : String(row.types),
    row.memoryMb === null ? '-' : String(row.memoryMb),
    mb(row.outputBytes),
    String(row.files),
    `${row.largestFile} ${(row.largestFileBytes / 1024).toFixed(0)} KB`,
    String(row.codegenMs),
    row.state,
  ]);
  const widths = header.map((title, col) => Math.max(title.length, ...body.map((line) => line[col]!.length)));
  const render = (line: string[]): string =>
    line
      .map((cell, col) => cell.padEnd(widths[col]!))
      .join('  ')
      .trimEnd();

  return [render(header), ...body.map(render)].join('\n');
}
