import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchOptions } from '../../../bench/curve';
import {
  assertDepth,
  extractIncludeDepthArgs,
  includeDepthConsumer,
  includeSource,
  runIncludeDepth,
} from '../../../bench/include-depth';

const DIST = join(import.meta.dir, '..', '..', '..', 'dist', 'index.d.mts');
const withDist = existsSync(DIST) ? describe : describe.skip;

const BENCH: BenchOptions = {
  sizes: [],
  runs: 2,
  compilers: ['5.9'],
  fields: 3,
  json: null,
  ceiling: null,
  heapMb: 4096,
};

describe('include depth consumer', () => {
  test.each([1, 2, 3, 4])('forward depth %i nests exactly that many includes', (depth) => {
    const source = includeSource(depth, 'forward');

    expect(source.match(/include:/g) ?? []).toHaveLength(depth - 1);
    expect(source.match(/next/g)).toHaveLength(depth);
    expect(source.match(/\{/g)).toHaveLength(2 * depth - 1);
    expect(source.match(/\}/g)).toHaveLength(2 * depth - 1);
    expect(includeDepthConsumer(depth, 'forward', 50)).toContain(`rows[0]!${'.next!'.repeat(depth)}.field0`);
  });

  test('depth 3 forward is the expected text', () => {
    expect(includeSource(3, 'forward')).toBe('{ next: { include: { next: { include: { next: true } } } } }');
  });

  test('mixed alternates the forward and reverse relation and reads through the array', () => {
    expect(includeSource(4, 'mixed')).toBe(
      '{ next: { include: { previous: { include: { next: { include: { previous: true } } } } } } }',
    );
    expect(includeDepthConsumer(4, 'mixed', 50)).toContain('rows[0]!.next!.previous[0]!.next!.previous[0]!.field0');
  });

  test('the deepest field is read, so the type is resolved and not only declared', () => {
    expect(includeDepthConsumer(2, 'forward', 50)).toMatch(/export const deepField = rows\[0\]!.*\.field0;/);
  });
});

describe('depth validation', () => {
  test.each([0, 5, 9, -1, 1.5, Number.NaN])('depth %p is refused', (depth) => {
    expect(() => assertDepth(depth, 50)).toThrow('include depth must be an integer from 1 to 4');
  });

  test('a ring no larger than the depth is refused, a larger one accepted', () => {
    expect(() => assertDepth(4, 4)).toThrow('would revisit a model');
    expect(() => assertDepth(4, 3)).toThrow('would revisit a model');
    expect(() => assertDepth(4, 5)).not.toThrow();
  });

  test('a size below the generator minimum or a non-integer is refused', () => {
    expect(() => assertDepth(1, 2)).toThrow('schema size must be an integer of at least 3');
    expect(() => assertDepth(1, 10.5)).toThrow('schema size must be an integer of at least 3');
  });

  test('the consumer builder refuses before writing anything', () => {
    expect(() => includeDepthConsumer(5, 'forward', 50)).toThrow('include depth');
    expect(() => includeDepthConsumer(4, 'mixed', 4)).toThrow('would revisit');
  });
});

describe('argument parsing', () => {
  test('defaults to depths 1 to 4 at size 50 and passes other flags on', () => {
    expect(extractIncludeDepthArgs(['--runs', '2'])).toEqual({ depths: [1, 2, 3, 4], size: 50, rest: ['--runs', '2'] });
  });

  test('reads depths and size', () => {
    expect(extractIncludeDepthArgs(['--depths', '2,3', '--size', '10'])).toEqual({
      depths: [2, 3],
      size: 10,
      rest: [],
    });
  });

  test('refuses a bad depth, a missing value and a too-small size', () => {
    expect(() => extractIncludeDepthArgs(['--depths', '0,1'])).toThrow('include depth');
    expect(() => extractIncludeDepthArgs(['--depths', '1.5'])).toThrow('include depth');
    expect(() => extractIncludeDepthArgs(['--depths', '5'])).toThrow('include depth');
    expect(() => extractIncludeDepthArgs(['--size'])).toThrow('needs a value');
    expect(() => extractIncludeDepthArgs(['--depths', '4', '--size', '4'])).toThrow('would revisit');
  });
});

withDist('include depth measurement', () => {
  test('measures depths 1 to 4 on 5.9, both variants, and two runs agree', async () => {
    const rows = await runIncludeDepth({ depths: [1, 2, 3, 4], size: 6, bench: BENCH }, true);

    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.state).toBe('ok');
      expect(row.instantiations).toBeGreaterThan(0);
      expect(row.types).toBeGreaterThan(0);
    }
    const forward = rows.filter((row) => row.variant === 'forward');
    expect(forward.map((row) => row.depth)).toEqual([1, 2, 3, 4]);
  }, 300_000);

  test('a refused depth stops the run before any measurement', async () => {
    await expect(runIncludeDepth({ depths: [5], size: 50, bench: BENCH }, true)).rejects.toThrow('include depth');
    await expect(runIncludeDepth({ depths: [4], size: 4, bench: BENCH }, true)).rejects.toThrow('would revisit');
  });
});
