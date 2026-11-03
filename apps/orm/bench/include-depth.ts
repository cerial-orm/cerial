import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDistFresh, type BenchOptions, type CaseRow, measureCase } from './curve';
import { syntheticSchema } from './schema';

export const MAX_INCLUDE_DEPTH = 4;
export const DEFAULT_INCLUDE_SIZE = 50;
const SEED = 1;
const PACKAGE_ROOT = join(import.meta.dir, '..');

/** `forward` follows `next` only; `mixed` alternates `next` and the reverse `previous` */
export const INCLUDE_VARIANTS = ['forward', 'mixed'] as const;
export type IncludeVariant = (typeof INCLUDE_VARIANTS)[number];

function relationAt(variant: IncludeVariant, level: number): 'next' | 'previous' {
  return variant === 'mixed' && level % 2 === 1 ? 'previous' : 'next';
}

/** Refuses a depth outside 1 to the maximum, and a ring that would visit a model twice at that depth */
export function assertDepth(depth: number, size: number): void {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`include depth must be an integer from 1 to ${MAX_INCLUDE_DEPTH}, got ${depth}`);
  }
  if (!Number.isInteger(size) || size < 3) throw new Error(`schema size must be an integer of at least 3, got ${size}`);
  if (size <= depth) {
    throw new Error(`a ring of ${size} models would revisit a model at include depth ${depth}; use more than ${depth}`);
  }
}

/** The `include` source nesting `depth` levels: `{ next: { include: { next: true } } }` at depth 2 */
export function includeSource(depth: number, variant: IncludeVariant): string {
  let source = `{ ${relationAt(variant, depth - 1)}: true }`;

  for (let level = depth - 2; level >= 0; level--) {
    source = `{ ${relationAt(variant, level)}: { include: ${source} } }`;
  }

  return source;
}

/** Path from the result to the deepest included row; `!` keeps it compiling under `noUncheckedIndexedAccess` */
function deepPath(depth: number, variant: IncludeVariant): string {
  let path = 'rows[0]!';

  for (let level = 0; level < depth; level++) {
    path += relationAt(variant, level) === 'next' ? '.next!' : '.previous[0]!';
  }

  return path;
}

/** A consumer whose include nests `depth` levels and which reads `field0` of the deepest row, so that payload type is resolved */
export function includeDepthConsumer(depth: number, variant: IncludeVariant, size: number): string {
  assertDepth(depth, size);

  return `import type { CerialClient } from './gen';

declare const client: CerialClient;

const rows = await client.db.BenchModel0.findMany({ include: ${includeSource(depth, variant)} });
export const deepField = ${deepPath(depth, variant)}.field0;
`;
}

export interface IncludeDepthOptions {
  readonly depths: readonly number[];
  readonly size: number;
  /** Runs, compilers, fields and heap limit; its `sizes` are ignored */
  readonly bench: BenchOptions;
}

export interface IncludeDepthRow extends CaseRow {
  readonly depth: number;
  readonly variant: IncludeVariant;
}

/** Measures each depth in both variants at one schema size; a consumer that does not compile throws */
export async function runIncludeDepth(
  options: IncludeDepthOptions,
  allowStale = false,
): Promise<readonly IncludeDepthRow[]> {
  for (const depth of options.depths) assertDepth(depth, options.size);
  if (!allowStale) assertDistFresh(join(PACKAGE_ROOT, 'dist', 'index.d.mts'), join(PACKAGE_ROOT, 'src'));

  const root = mkdtempSync(join(tmpdir(), 'cerial-bench-include-'));
  const cleanup = (): void => rmSync(root, { recursive: true, force: true });
  process.on('exit', cleanup);

  try {
    const schemaDir = join(root, 'schema');
    mkdirSync(schemaDir, { recursive: true });
    writeFileSync(
      join(schemaDir, 'bench.cerial'),
      syntheticSchema({ models: options.size, fieldsPerModel: options.bench.fields, seed: SEED }),
    );

    const rows: IncludeDepthRow[] = [];
    let index = 0;

    for (const depth of options.depths) {
      for (const variant of INCLUDE_VARIANTS) {
        const consumer = includeDepthConsumer(depth, variant, options.size);
        const name = `depth ${depth} ${variant}`;
        const input = { name, size: options.size, schemaDir, consumer };
        const measured = await measureCase(root, input, { ...options.bench, case: null }, index++);
        rows.push(...measured.map((row) => ({ ...row, depth, variant })));
      }
    }

    return rows;
  } finally {
    cleanup();
    process.off('exit', cleanup);
  }
}

/** Compact table: one line per depth, variant and compiler */
export function formatIncludeDepth(rows: readonly IncludeDepthRow[]): string {
  const header = ['case', 'compiler', 'check (s)', 'instantiations', 'types', 'memory (MB)', 'state'];
  const body = rows.map((row) => [
    row.name,
    row.compiler,
    row.checkSeconds === null ? '-' : row.checkSeconds.toFixed(3),
    row.instantiations === null ? '-' : String(row.instantiations),
    row.types === null ? '-' : String(row.types),
    row.memoryMb === null ? '-' : String(row.memoryMb),
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

/** Takes `--depths 1,2,3,4` and `--size n` out of `argv`; what is left goes to `parseBenchArgs` */
export function extractIncludeDepthArgs(argv: readonly string[]): {
  depths: number[];
  size: number;
  rest: string[];
} {
  const rest: string[] = [];
  let depths = [1, 2, 3, 4];
  let size = DEFAULT_INCLUDE_SIZE;

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    if (flag !== '--depths' && flag !== '--size') {
      rest.push(flag);
      if (value !== undefined) rest.push(value);
      continue;
    }
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);

    if (flag === '--size') size = Number(value);
    else depths = value.split(',').map((part) => Number(part.trim()));
  }
  for (const depth of depths) assertDepth(depth, size);

  return { depths, size, rest };
}
