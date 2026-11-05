/**
 * Unit Tests: sized number range validation on create and update data
 *
 * Every refusal is paired with the value just inside the range that must pass, and each location
 * (field, array element, object sub-field, tuple element) reports its own path.
 */

import { describe, expect, test } from 'bun:test';
import { validateCreateData, validateUpdateData } from '../../../../src/query/validators/data-validator';
import { ALL_SIZED_TYPES, SIZED_CASES, sizedModel, U64_MAX } from './helpers';

function createData(overrides: Record<string, unknown>): Record<string, unknown> {
  return { value: 1, list: [1], calib: { gain: 1 }, pair: [1, 1], ...overrides };
}

function messagesFor(type: Parameters<typeof sizedModel>[0], data: Record<string, unknown>): string[] {
  return validateCreateData(data, sizedModel(type)).errors.map((e) => e.message);
}

describe('sized number data validation', () => {
  test('every sized type has a case in this suite', () => {
    const covered = [...SIZED_CASES.map((c) => c.type), 'uint64', 'float16', 'float32'].sort();

    expect(covered).toEqual([...ALL_SIZED_TYPES].sort());
  });

  describe.each(SIZED_CASES)('$name', ({ type, name, min, max, below, above }) => {
    test('accepts the minimum and the maximum', () => {
      expect(messagesFor(type, createData({ value: min }))).toEqual([]);
      expect(messagesFor(type, createData({ value: max }))).toEqual([]);
    });

    test('refuses one below the minimum and one above the maximum with the range', () => {
      expect(messagesFor(type, createData({ value: below }))).toEqual([
        `Field "value" is ${name} and holds ${min} to ${max}, got ${below}`,
      ]);
      expect(messagesFor(type, createData({ value: above }))).toEqual([
        `Field "value" is ${name} and holds ${min} to ${max}, got ${above}`,
      ]);
    });

    test('refuses a fraction', () => {
      expect(messagesFor(type, createData({ value: 1.5 }))).toEqual([
        `Field "value" is ${name} and expects a whole number, got 1.5`,
      ]);
    });

    test('refuses a bigint, since only Uint64 takes one', () => {
      expect(messagesFor(type, createData({ value: 1n }))).toEqual([
        `Field "value" is ${name} and expects a number, got a bigint`,
      ]);
    });

    test('refuses a string and NaN through the type check', () => {
      expect(messagesFor(type, createData({ value: '5' }))[0]).toBe(`value must be of type ${type}`);
      expect(messagesFor(type, createData({ value: Number.NaN }))[0]).toBe(`value must be of type ${type}`);
    });

    test('names the array element', () => {
      expect(messagesFor(type, createData({ list: [min, above, max] }))).toEqual([
        `Field "list[1]" is ${name} and holds ${min} to ${max}, got ${above}`,
      ]);
      expect(messagesFor(type, createData({ list: [min, max] }))).toEqual([]);
    });

    test('names the object sub-field', () => {
      expect(messagesFor(type, createData({ calib: { gain: above } }))).toEqual([
        `Field "calib.gain" is ${name} and holds ${min} to ${max}, got ${above}`,
      ]);
      expect(messagesFor(type, createData({ calib: { gain: max } }))).toEqual([]);
    });

    test('names the tuple element, in array and object form', () => {
      expect(messagesFor(type, createData({ pair: [1, above] }))).toEqual([
        `Field "pair[1]" is ${name} and holds ${min} to ${max}, got ${above}`,
      ]);
      expect(messagesFor(type, createData({ pair: { first: above, second: 1 } }))).toEqual([
        `Field "pair.first" is ${name} and holds ${min} to ${max}, got ${above}`,
      ]);
      expect(messagesFor(type, createData({ pair: [min, max] }))).toEqual([]);
    });

    test('checks an optional field only when it has a value', () => {
      expect(messagesFor(type, createData({ maybe: undefined }))).toEqual([]);
      expect(messagesFor(type, createData({ maybe: above }))).toEqual([
        `Field "maybe" is ${name} and holds ${min} to ${max}, got ${above}`,
      ]);
    });

    test.each([
      ['updateMany/updateUnique data', (v: unknown) => validateUpdateData({ value: v }, sizedModel(type))],
      ['an object sub-field merge', (v: unknown) => validateUpdateData({ calib: { gain: v } }, sizedModel(type))],
      ['a tuple element merge', (v: unknown) => validateUpdateData({ pair: { first: v } }, sizedModel(type))],
      ['an array replacement', (v: unknown) => validateUpdateData({ list: [v] }, sizedModel(type))],
    ])('refuses the same value on %s and accepts one in range', (_label, validate) => {
      expect(validate(above).errors).toHaveLength(1);
      expect(validate(above).errors[0]!.message).toContain(`is ${name} and holds ${min} to ${max}, got ${above}`);
      expect(validate(max).errors).toEqual([]);
    });
  });

  describe('Uint64', () => {
    const holds = 'holds 0 to 18446744073709551615';

    test('accepts 0 and 2^64-1 as bigint, and a safe-integer number', () => {
      expect(messagesFor('uint64', createData({ value: 0n }))).toEqual([]);
      expect(messagesFor('uint64', createData({ value: U64_MAX }))).toEqual([]);
      expect(messagesFor('uint64', createData({ value: Number.MAX_SAFE_INTEGER }))).toEqual([]);
      expect(messagesFor('uint64', createData({ value: 0 }))).toEqual([]);
    });

    test('refuses a negative bigint and a negative number', () => {
      expect(messagesFor('uint64', createData({ value: -1n }))).toEqual([
        `Field "value" is Uint64 and ${holds}, got -1`,
      ]);
      expect(messagesFor('uint64', createData({ value: -1 }))).toEqual([
        `Field "value" is Uint64 and ${holds}, got -1`,
      ]);
    });

    test('refuses a bigint above 2^64-1', () => {
      expect(messagesFor('uint64', createData({ value: U64_MAX + 1n }))).toEqual([
        `Field "value" is Uint64 and ${holds}, got 18446744073709551616`,
      ]);
    });

    test('refuses an unsafe-integer number and tells the caller to pass a bigint', () => {
      const unsafe = Number.MAX_SAFE_INTEGER + 2;

      expect(messagesFor('uint64', createData({ value: unsafe }))).toEqual([
        `Field "value" is Uint64: ${unsafe} is past Number.MAX_SAFE_INTEGER and may already be rounded; pass a bigint`,
      ]);
    });

    test('refuses a number at or above 2^64 as out of range, not as unsafe', () => {
      expect(messagesFor('uint64', createData({ value: 2 ** 64 }))[0]).toContain(`${holds}, got`);
    });

    test('refuses a fraction and Infinity as not whole', () => {
      expect(messagesFor('uint64', createData({ value: 0.5 }))).toEqual([
        'Field "value" is Uint64 and expects a whole number, got 0.5',
      ]);
      expect(messagesFor('uint64', createData({ value: Infinity }))).toEqual([
        'Field "value" is Uint64 and expects a whole number, got Infinity',
      ]);
    });

    test('names array, object and tuple positions', () => {
      expect(messagesFor('uint64', createData({ list: [1n, -1n] }))).toEqual([
        `Field "list[1]" is Uint64 and ${holds}, got -1`,
      ]);
      expect(messagesFor('uint64', createData({ calib: { gain: -1n } }))).toEqual([
        `Field "calib.gain" is Uint64 and ${holds}, got -1`,
      ]);
      expect(messagesFor('uint64', createData({ pair: [U64_MAX, -1n] }))).toEqual([
        `Field "pair[1]" is Uint64 and ${holds}, got -1`,
      ]);
    });
  });

  describe.each([
    { type: 'float16', name: 'Float16', max: 65504, ok: 65519, over: 65520 },
    { type: 'float32', name: 'Float32', max: 3.4028234663852886e38, ok: 3.4028235e38, over: 3.4028235677973366e38 },
  ] as const)('$name', ({ type, name, max, ok, over }) => {
    test('accepts ordinary decimals, the largest finite value and values that round down to it', () => {
      for (const value of [0.1, -0.1, 0, max, -max, ok]) expect(messagesFor(type, createData({ value }))).toEqual([]);
    });

    test('refuses a finite value that rounds to infinity, in both signs', () => {
      expect(messagesFor(type, createData({ value: over }))).toEqual([
        `Field "value" is ${name} and holds at most ±${max}, got ${over}`,
      ]);
      expect(messagesFor(type, createData({ value: -over }))).toEqual([
        `Field "value" is ${name} and holds at most ±${max}, got ${-over}`,
      ]);
    });

    test('follows Float for NaN (refused) and infinity (accepted)', () => {
      expect(messagesFor(type, createData({ value: Number.NaN }))).toEqual([`value must be of type ${type}`]);
      expect(messagesFor(type, createData({ value: Infinity }))).toEqual([]);
      expect(messagesFor(type, createData({ value: -Infinity }))).toEqual([]);
    });

    test('accepts a fraction and refuses a bigint', () => {
      expect(messagesFor(type, createData({ value: 1.5 }))).toEqual([]);
      expect(messagesFor(type, createData({ value: 1n }))).toEqual([
        `Field "value" is ${name} and expects a number, got a bigint`,
      ]);
    });

    test('names array, object, tuple and update positions', () => {
      const text = `is ${name} and holds at most ±${max}, got ${over}`;

      expect(messagesFor(type, createData({ list: [0.1, over] }))).toEqual([`Field "list[1]" ${text}`]);
      expect(messagesFor(type, createData({ calib: { gain: over } }))).toEqual([`Field "calib.gain" ${text}`]);
      expect(messagesFor(type, createData({ pair: [1, over] }))).toEqual([`Field "pair[1]" ${text}`]);
      expect(validateUpdateData({ value: over }, sizedModel(type)).errors.map((e) => e.message)).toEqual([
        `Field "value" ${text}`,
      ]);
      expect(validateUpdateData({ value: 0.1 }, sizedModel(type)).errors).toEqual([]);
    });
  });
});
