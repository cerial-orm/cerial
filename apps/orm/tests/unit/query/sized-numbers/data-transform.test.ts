/**
 * Unit Tests: write values for sized number fields
 *
 * Uint64 goes as the SDK U64 (the SDK refuses a bigint above the signed maximum). Float16 and Float32
 * go unchanged so the server does the rounding, and the other integer kinds go as plain numbers.
 */

import { describe, expect, test } from 'bun:test';
import { U64 } from 'surrealdb';
import { transformData, transformValue } from '../../../../src/query/transformers/data-transformer';
import { SIZED_CASES, sizedModel } from './helpers';

function expectU64(value: unknown, expected: bigint): void {
  expect(value).toBeInstanceOf(U64);
  expect((value as U64).value).toBe(expected);
}

describe('sized number write transform', () => {
  test.each(SIZED_CASES)('$name passes through as a plain number', ({ type, max }) => {
    expect(transformValue(max, type)).toBe(max);
  });

  test.each(['float16', 'float32'] as const)('%s passes the caller number unchanged', (type) => {
    expect(transformValue(0.1, type)).toBe(0.1);
  });

  test('Uint64 wraps a bigint above the signed range and a number', () => {
    expectU64(transformValue(2n ** 64n - 1n, 'uint64'), 2n ** 64n - 1n);
    expectU64(transformValue(7, 'uint64'), 7n);
    expectU64(transformValue(0n, 'uint64'), 0n);
  });

  test('null and undefined pass through', () => {
    expect(transformValue(null, 'uint64')).toBeNull();
    expect(transformValue(undefined, 'uint64')).toBeUndefined();
  });

  describe('transformData', () => {
    const data = { value: 5n, maybe: 6, list: [1n, 2], calib: { gain: 3n }, pair: [4n, 5] };

    test('Uint64 wraps required, optional, array, object and tuple values', () => {
      const out = transformData(data, sizedModel('uint64'), 'create') as Record<string, unknown>;

      expectU64(out.value, 5n);
      expectU64(out.maybe, 6n);
      expectU64((out.list as unknown[])[0], 1n);
      expectU64((out.list as unknown[])[1], 2n);
      expectU64((out.calib as { gain: unknown }).gain, 3n);
      expectU64((out.pair as unknown[])[0], 4n);
      expectU64((out.pair as unknown[])[1], 5n);
    });

    test('Uint64 wraps on the update path, including a tuple element merge and an object sub-field', () => {
      const model = sizedModel('uint64');
      const update = transformData({ calib: { gain: 9n } }, model, 'update') as { calib: { gain: unknown } };

      expectU64(update.calib.gain, 9n);
      expect(transformData({ value: 1n }, model, 'update').value).toBeInstanceOf(U64);
    });

    test('Uint64 wraps the members of a pushed list', () => {
      const out = transformData({ list: { push: [1n, 2n] } }, sizedModel('uint64'), 'update') as {
        list: { push: unknown[] };
      };

      expect(out.list.push.every((v) => v instanceof U64)).toBe(true);
    });

    test.each([...SIZED_CASES.map((c) => c.type), 'float16', 'float32'] as const)('%s data is not wrapped', (type) => {
      const out = transformData(
        { value: 5, list: [1, 2], calib: { gain: 3 }, pair: [4, 5] },
        sizedModel(type),
        'create',
      );

      expect(out).toEqual({ value: 5, list: [1, 2], calib: { gain: 3 }, pair: [4, 5] });
    });
  });
});
