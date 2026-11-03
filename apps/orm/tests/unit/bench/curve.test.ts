import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertDistFresh,
  type BenchOptions,
  type CaseRow,
  ceilingFailures,
  formatCurve,
  median,
  parseBenchArgs,
  runBench,
} from '../../../bench/curve';
import { consumerSource, syntheticConsumerSpec } from '../../../bench/consumer';
import { syntheticSchema } from '../../../bench/schema';

const DIST = join(import.meta.dir, '..', '..', '..', 'dist', 'index.d.mts');
// The measurement tests compile against the built package; without a build there is nothing to measure
const withDist = existsSync(DIST) ? describe : describe.skip;

const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-bench-curve-'));
  roots.push(dir);

  return dir;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const SMALL: BenchOptions = {
  sizes: [10],
  runs: 2,
  compilers: ['5.9'],
  fields: 5,
  json: null,
  ceiling: null,
  heapMb: 4096,
};

function row(overrides: Partial<CaseRow>): CaseRow {
  return {
    name: '10',
    compiler: '5.9',
    size: 10,
    state: 'ok',
    checkSeconds: 0.1,
    instantiations: 1,
    types: 1,
    memoryMb: 1,
    outputBytes: 1024,
    files: 1,
    largestFile: 'a.ts',
    largestFileBytes: 1024,
    codegenMs: 1,
    ...overrides,
  };
}

describe('median', () => {
  test('takes the middle of an odd count and the mean of the middle two of an even count', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  test('refuses no values', () => {
    expect(() => median([])).toThrow('no values');
  });
});

describe('parseBenchArgs', () => {
  test('defaults to the full curve on both compilers', () => {
    const options = parseBenchArgs([]);
    expect(options.sizes).toEqual([10, 50, 100, 250, 500, 1000, 1250, 1500]);
    expect(options.runs).toBe(3);
    expect(options.compilers).toEqual(['5.9', '7']);
    expect(options.heapMb).toBe(4096);
    expect(options.ceiling).toBeNull();
  });

  test('reads every flag', () => {
    const options = parseBenchArgs([
      '--sizes',
      '10,50',
      '--runs',
      '1',
      '--compiler',
      '7',
      '--fields',
      '20',
      '--json',
      'out.json',
    ]);
    expect(options).toMatchObject({ sizes: [10, 50], runs: 1, compilers: ['7'], fields: 20, json: 'out.json' });
  });

  test('a ceiling alone measures that size only, and is added to explicit sizes', () => {
    expect(parseBenchArgs(['--ceiling', '1500']).sizes).toEqual([1500]);
    expect(parseBenchArgs(['--sizes', '10', '--ceiling', '50']).sizes).toEqual([10, 50]);
  });

  test('refuses unknown flags, missing values and bad numbers', () => {
    expect(() => parseBenchArgs(['--bogus', '1'])).toThrow('unknown argument');
    expect(() => parseBenchArgs(['--runs'])).toThrow('needs a value');
    expect(() => parseBenchArgs(['--runs', '0'])).toThrow('at least 1');
    expect(() => parseBenchArgs(['--sizes', '10,two'])).toThrow('--sizes');
    expect(() => parseBenchArgs(['--sizes', '2'])).toThrow('at least 3');
    expect(() => parseBenchArgs(['--compiler', '6'])).toThrow('5.9, 7 or all');
  });
});

describe('assertDistFresh', () => {
  function tree(distAgeSeconds: number): { dist: string; src: string } {
    const dir = tempDir();
    const src = join(dir, 'src');
    mkdirSync(src);
    writeFileSync(join(src, 'a.ts'), '');
    const dist = join(dir, 'index.d.mts');
    writeFileSync(dist, '');
    const now = Date.now() / 1000;
    utimesSync(join(src, 'a.ts'), now - 100, now - 100);
    utimesSync(dist, now - distAgeSeconds, now - distAgeSeconds);

    return { dist, src };
  }

  test('passes when dist is newer than every source file', () => {
    const { dist, src } = tree(10);
    expect(() => assertDistFresh(dist, src)).not.toThrow();
  });

  test('refuses a dist older than a source file and names the fix', () => {
    const { dist, src } = tree(500);
    expect(() => assertDistFresh(dist, src)).toThrow('bun run build');
  });

  test('refuses a missing dist', () => {
    expect(() => assertDistFresh(join(tempDir(), 'none.d.mts'), tempDir())).toThrow('bun run build');
  });
});

describe('ceilingFailures', () => {
  test('reports heap exhaustion at the ceiling size only', () => {
    const rows = [row({ size: 10, state: 'heap-exhausted' }), row({ size: 50, state: 'heap-exhausted' })];
    expect(ceilingFailures(rows, 50)).toEqual(['5.9 ran out of heap at 50 models']);
  });

  test('is silent without a ceiling, and when the ceiling size fits', () => {
    expect(ceilingFailures([row({ state: 'heap-exhausted' })], null)).toEqual([]);
    expect(ceilingFailures([row({ size: 50 })], 50)).toEqual([]);
  });
});

describe('formatCurve', () => {
  test('prints a header and one line per row, with the reported state', () => {
    const lines = formatCurve([
      row({}),
      row({ name: 'corpus', size: null, state: 'heap-exhausted', checkSeconds: null }),
    ]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('instantiations');
    expect(lines[2]).toContain('heap-exhausted');
  });
});

describe('consumer', () => {
  test('holds the five fixed queries and gives every drawn scalar a value', () => {
    const schema = syntheticSchema({ models: 3, fieldsPerModel: 4, seed: 1 });
    const source = consumerSource(syntheticConsumerSpec(schema));
    for (const call of ['findMany({ select', 'findMany({ include', 'findOne', 'updateMany', 'create']) {
      expect(source).toContain(call);
    }
    for (const field of ['field0:', 'field1:', 'field2:', 'field3:']) expect(source).toContain(field);
  });
});

withDist('runBench', () => {
  test('reports the same types and instantiations on two runs of one tree', async () => {
    const [first, second] = [await runBench(SMALL, { allowStale: true }), await runBench(SMALL, { allowStale: true })];
    expect(first.failures).toEqual([]);
    const key = (rows: readonly CaseRow[]): unknown[] => rows.map((r) => [r.name, r.types, r.instantiations]);
    expect(key(first.rows)).toEqual(key(second.rows));
    expect(first.rows.map((r) => r.name)).toEqual(['10', 'corpus']);
    expect(first.rows[0]!.types).toBeGreaterThan(0);
  }, 120_000);

  test('a broken consumer query fails the run with the compiler error', async () => {
    const consumer = `import type { CerialClient } from './gen';
declare const client: CerialClient;
export const broken = client.db.BenchModel0.findMany({ select: { notAField: true } });
`;
    await expect(runBench({ ...SMALL, runs: 1 }, { allowStale: true, consumer })).rejects.toThrow('consumer.ts');
  }, 120_000);

  test('a ceiling at a size that runs out of heap reports a failure, and without it the state is only reported', async () => {
    const starved = { ...SMALL, runs: 1, heapMb: 8 };
    const reported = await runBench(starved, { allowStale: true });
    expect(reported.rows[0]!.state).toBe('heap-exhausted');
    expect(reported.failures).toEqual([]);

    const ceiling = await runBench({ ...starved, ceiling: 10 }, { allowStale: true });
    expect(ceiling.failures).toEqual(['5.9 ran out of heap at 10 models']);
  }, 120_000);
});
