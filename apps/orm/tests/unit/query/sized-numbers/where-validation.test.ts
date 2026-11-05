/**
 * Unit Tests: sized number range validation on Where filter values
 */

import { describe, expect, test } from 'bun:test';
import { validateWhere } from '../../../../src/query/validators/where-validator';
import { SIZED_CASES, sizedModel, U64_MAX } from './helpers';

function messages(type: Parameters<typeof sizedModel>[0], where: Record<string, unknown>): string[] {
  return validateWhere(where, sizedModel(type)).errors.map((e) => e.message);
}

describe('sized number where validation', () => {
  describe.each(SIZED_CASES)('$name', ({ type, name, min, max, above }) => {
    const out = `Field "FIELD" is ${name} and holds ${min} to ${max}, got ${above}`;

    test('accepts in-range values for every operator shape', () => {
      expect(
        messages(type, {
          value: {
            eq: max,
            neq: min,
            not: min,
            gt: min,
            gte: min,
            lt: max,
            lte: max,
            in: [min, max],
            between: [min, max],
          },
          list: { has: max, hasAll: [min, max], hasAny: [max], isEmpty: false },
        }),
      ).toEqual([]);
      expect(messages(type, { value: max })).toEqual([]);
    });

    test.each(['eq', 'neq', 'not', 'gt', 'gte', 'lt', 'lte'])('refuses an out-of-range %s', (op) => {
      expect(messages(type, { value: { [op]: above } })).toEqual([out.replace('FIELD', 'value')]);
    });

    test('refuses an out-of-range direct value', () => {
      expect(messages(type, { value: above })).toEqual([out.replace('FIELD', 'value')]);
    });

    test.each(['in', 'notIn', 'between', 'hasAll', 'hasAny'])('names the bad element of %s', (op) => {
      const field = op.startsWith('has') ? 'list' : 'value';

      expect(messages(type, { [field]: { [op]: [min, above] } })).toEqual([out.replace('FIELD', `${field}[1]`)]);
    });

    test('refuses an out-of-range has on an array field', () => {
      expect(messages(type, { list: { has: above } })).toEqual([out.replace('FIELD', 'list')]);
    });

    test('refuses a fraction', () => {
      expect(messages(type, { value: { gt: 0.5 } })).toEqual([
        `Field "value" is ${name} and expects a whole number, got 0.5`,
      ]);
    });

    test('refuses an out-of-range value on an object sub-field and a tuple element', () => {
      expect(messages(type, { calib: { gain: { gt: above } } })).toEqual([out.replace('FIELD', 'calib.gain')]);
      expect(messages(type, { calib: { gain: above } })).toEqual([out.replace('FIELD', 'calib.gain')]);
      expect(messages(type, { pair: { first: { lte: above } } })).toEqual([out.replace('FIELD', 'pair.first')]);
      expect(messages(type, { pair: { 1: above } })).toEqual([out.replace('FIELD', 'pair.1')]);
    });

    test('refuses a value inside logical operators', () => {
      expect(messages(type, { OR: [{ value: min }, { value: above }] })).toEqual([out.replace('FIELD', 'value')]);
      expect(messages(type, { NOT: { value: { eq: above } } })).toEqual([out.replace('FIELD', 'value')]);
    });

    test('lets null, undefined and presence operators through', () => {
      expect(
        messages(type, { value: { isNull: true, isDefined: true, isNone: false }, maybe: { eq: null, not: null } }),
      ).toEqual([]);
      expect(messages(type, { value: undefined })).toEqual([]);
    });
  });

  test('Uint64 refuses a negative, an overflow, an unsafe number and accepts bigint at both ends', () => {
    expect(messages('uint64', { value: { in: [0n, U64_MAX] } })).toEqual([]);
    expect(messages('uint64', { value: { gt: -1n } })).toEqual([
      'Field "value" is Uint64 and holds 0 to 18446744073709551615, got -1',
    ]);
    expect(messages('uint64', { value: U64_MAX + 1n })).toEqual([
      'Field "value" is Uint64 and holds 0 to 18446744073709551615, got 18446744073709551616',
    ]);
    expect(messages('uint64', { value: Number.MAX_SAFE_INTEGER + 2 })[0]).toContain('pass a bigint');
  });

  test('a bigint on a non-Uint64 field is refused', () => {
    expect(messages('int32', { value: { eq: 5n } })).toEqual([
      'Field "value" is Int32 and expects a number, got a bigint',
    ]);
  });

  test.each([
    ['float16', 'Float16', 65504, 70000],
    ['float32', 'Float32', 3.4028234663852886e38, 3.5e38],
  ] as const)('%s refuses overflow and accepts 0.1', (type, name, max, over) => {
    expect(messages(type, { value: { eq: 0.1, lt: max } })).toEqual([]);
    expect(messages(type, { value: { eq: over } })).toEqual([
      `Field "value" is ${name} and holds at most ±${max}, got ${over}`,
    ]);
  });
});
