/**
 * Unit Tests: write values for sized number fields
 *
 * Uint64 goes as a bigint up to the signed 64-bit maximum and as the SDK U64 above it. Float16 and Float32
 * go as F16 and F32, so a write and a filter on the same number round it alike, and the other integer kinds
 * go as plain numbers.
 */

import { describe, expect, test } from 'bun:test';
import { F16, F32, U64 } from 'surrealdb';
import { transformData, transformValue } from '../../../../src/query/transformers/data-transformer';
import { SIZED_CASES, sizedModel } from './helpers';

const I64_MAX = 2n ** 63n - 1n;

/** A u64 goes as a plain bigint up to the signed maximum (the encoder takes it) and as a U64 above. */
function expectU64(value: unknown, expected: bigint): void {
  if (expected <= I64_MAX) {
    expect(typeof value).toBe('bigint');
    expect(value).toBe(expected);

    return;
  }
  expect(value).toBeInstanceOf(U64);
  expect((value as U64).value).toBe(expected);
}

describe('sized number write transform', () => {
  test.each(SIZED_CASES)('$name passes through as a plain number', ({ type, max }) => {
    expect(transformValue(max, type)).toBe(max);
  });

  test.each([
    ['float16', F16],
    ['float32', F32],
  ] as const)('%s goes as the SDK class holding the rounded number', (type, Klass) => {
    const out = transformValue(0.1, type);

    expect(out).toBeInstanceOf(Klass);
    expect((out as F16).value).toBe(new Klass(0.1).value);
  });

  test.each(['float16', 'float32'] as const)('%s leaves a non-number as it is', (type) => {
    expect(transformValue(null, type)).toBeNull();
    expect(transformValue('x', type)).toBe('x');
  });

  test('Uint64 sends a bigint as is up to the signed maximum, wraps one above it, and converts a number to a bigint', () => {
    expectU64(transformValue(2n ** 64n - 1n, 'uint64'), 2n ** 64n - 1n);
    expectU64(transformValue(7, 'uint64'), 7n);
    expectU64(transformValue(0n, 'uint64'), 0n);
  });

  test.each([
    ['0', 0n],
    ['2^53 - 1', 2n ** 53n - 1n],
    ['2^53', 2n ** 53n],
    ['2^53 + 1', 2n ** 53n + 1n],
    ['the signed maximum', 2n ** 63n - 1n],
    ['one above the signed maximum', 2n ** 63n],
    ['the unsigned maximum', 2n ** 64n - 1n],
  ])('Uint64 %s: bigint input keeps its value and takes the right wire type', (_name, v) => {
    expectU64(transformValue(v, 'uint64'), v);
  });

  test('Uint64 converts the number 2 ** 53, which new U64 refuses, to a bigint', () => {
    expect(transformValue(2 ** 53, 'uint64')).toBe(2n ** 53n);
    expect(transformValue(Number.MAX_SAFE_INTEGER, 'uint64')).toBe(BigInt(Number.MAX_SAFE_INTEGER));
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
      expectU64(transformData({ value: 2n ** 64n - 1n }, model, 'update').value, 2n ** 64n - 1n);
    });

    test('Uint64 converts every member of a pushed, set and unset list the same way', () => {
      for (const op of ['push', 'set', 'unset']) {
        const out = transformData({ list: { [op]: [1n, 2 ** 53, 2n ** 63n] } }, sizedModel('uint64'), 'update') as {
          list: Record<string, unknown[]>;
        };

        expectU64(out.list[op]![0], 1n);
        expectU64(out.list[op]![1], 2n ** 53n);
        expectU64(out.list[op]![2], 2n ** 63n);
      }
    });

    test.each(SIZED_CASES.map((c) => c.type))('%s data is not wrapped', (type) => {
      const out = transformData(
        { value: 5, list: [1, 2], calib: { gain: 3 }, pair: [4, 5] },
        sizedModel(type),
        'create',
      );

      expect(out).toEqual({ value: 5, list: [1, 2], calib: { gain: 3 }, pair: [4, 5] });
    });

    test.each([
      ['float16', F16],
      ['float32', F32],
    ] as const)('%s wraps required, optional, array, object and tuple values', (type, Klass) => {
      const out = transformData(
        { value: 5, list: [1, 2], calib: { gain: 3 }, pair: [4, 5] },
        sizedModel(type),
        'create',
      ) as Record<string, unknown>;

      expect(out.value).toBeInstanceOf(Klass);
      for (const item of out.list as unknown[]) expect(item).toBeInstanceOf(Klass);
      expect((out.calib as { gain: unknown }).gain).toBeInstanceOf(Klass);
      for (const item of out.pair as unknown[]) expect(item).toBeInstanceOf(Klass);
    });
  });
});
