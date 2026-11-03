import { describe, expect, test } from 'bun:test';
import { formatLive, isPreRead, parseLiveArgs, percentile, summarise } from '../../../bench/live/nested-preread';

describe('live nested pre-read harness, pure parts', () => {
  test('--iterations defaults and parses', () => {
    expect(parseLiveArgs([]).iterations).toBe(100);
    expect(parseLiveArgs(['--iterations', '20']).iterations).toBe(20);
  });

  test('bad arguments are refused', () => {
    expect(() => parseLiveArgs(['--iterations', '0'])).toThrow('at least 1');
    expect(() => parseLiveArgs(['--iterations'])).toThrow('needs a value');
    expect(() => parseLiveArgs(['--runs', '3'])).toThrow('unknown argument');
  });

  test('percentile is nearest-rank', () => {
    const values = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(percentile(values, 95)).toBe(19);
    expect(percentile(values, 100)).toBe(20);
    expect(percentile([7], 95)).toBe(7);
    expect(() => percentile([], 95)).toThrow();
    expect(() => percentile([1], 0)).toThrow();
  });

  test('the pre-read is told apart from the write', () => {
    expect(isPreRead('SELECT id FROM $ids;')).toBe(true);
    expect(isPreRead('BEGIN TRANSACTION; CREATE bench_post SET title = $t;')).toBe(false);
  });

  test('added latency is with minus alone', () => {
    const row = summarise(10, [3, 4, 5], [1, 2, 3]);
    expect(row.addedMedianMs).toBe(2);
    expect(row.addedP95Ms).toBe(2);
    expect(formatLive([row])).toContain('+med');
  });
});
