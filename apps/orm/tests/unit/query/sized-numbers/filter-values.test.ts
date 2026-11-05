/**
 * Unit Tests: values bound for filters on sized number fields
 *
 * Uint64 binds as a bigint up to the signed maximum and as the SDK U64 above it, Float16 and Float32 as F16 and F32 (so 0.1 finds the row the server
 * rounded), and the other integer kinds bind as plain numbers.
 */

import { describe, expect, test } from 'bun:test';
import { F16, F32, U64 } from 'surrealdb';
import { compileWhere, SIZED_CASES } from './helpers';

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

describe('sized number filter values', () => {
  describe('integer kinds bind plain numbers', () => {
    test.each(SIZED_CASES)('$name', ({ type, max }) => {
      const { text, values } = compileWhere(type, { value: max });

      expect(text).toMatch(/^value = \$\w+$/);
      expect(values).toEqual([max]);
    });
  });

  describe('Uint64', () => {
    test('binds a bigint above the signed range as U64', () => {
      const { text, values } = compileWhere('uint64', { value: 2n ** 64n - 1n });

      expect(text).toMatch(/^value = \$\w+$/);
      expect(values).toHaveLength(1);
      expectU64(values[0], 2n ** 64n - 1n);
    });

    test('binds a safe-integer number as a bigint holding the same value', () => {
      expectU64(compileWhere('uint64', { value: 5 }).values[0], 5n);
    });

    test('binds exactly 2^53 as a bigint, whether it arrives as a bigint or a number', () => {
      expect(compileWhere('uint64', { value: 2n ** 53n }).values[0]).toBe(2n ** 53n);
      expect(compileWhere('uint64', { value: 2 ** 53 }).values[0]).toBe(2n ** 53n);
    });

    test('the signed maximum binds as a bigint and one above it as U64', () => {
      expect(compileWhere('uint64', { value: 2n ** 63n - 1n }).values[0]).toBe(2n ** 63n - 1n);
      expectU64(compileWhere('uint64', { value: 2n ** 63n }).values[0], 2n ** 63n);
    });

    test.each([
      ['eq', '='],
      ['neq', '!='],
      ['not', '!='],
      ['gt', '>'],
      ['gte', '>='],
      ['lt', '<'],
      ['lte', '<='],
    ])('%s binds a U64', (op, symbol) => {
      const { text, values } = compileWhere('uint64', { value: { [op]: 7n } });

      expect(text.startsWith(`value ${symbol} $`)).toBe(true);
      expectU64(values[0], 7n);
    });

    test.each(['in', 'notIn'])('%s binds every member as U64', (op) => {
      const { values } = compileWhere('uint64', { value: { [op]: [1n, 2, 2n ** 63n] } });

      expect(values).toHaveLength(1);
      const list = values[0] as unknown[];
      expectU64(list[0], 1n);
      expectU64(list[1], 2n);
      expectU64(list[2], 2n ** 63n);
    });

    test('between binds both ends as U64', () => {
      const { values } = compileWhere('uint64', { value: { between: [1n, 9n] } });

      expect(values).toHaveLength(2);
      expectU64(values[0], 1n);
      expectU64(values[1], 9n);
    });

    test('array operators bind U64', () => {
      expectU64(compileWhere('uint64', { list: { has: 3n } }).values[0], 3n);
      const all = compileWhere('uint64', { list: { hasAll: [1n, 2n] } }).values[0] as unknown[];
      const any = compileWhere('uint64', { list: { hasAny: [4] } }).values[0] as unknown[];

      expectU64(all[1], 2n);
      expectU64(any[0], 4n);
    });

    test('object sub-field and tuple element filters bind U64', () => {
      expectU64(compileWhere('uint64', { calib: { gain: { gt: 5n } } }).values[0], 5n);
      expectU64(compileWhere('uint64', { calib: { gain: 5n } }).values[0], 5n);
      expectU64(compileWhere('uint64', { pair: { first: { lte: 6n } } }).values[0], 6n);
      expectU64(compileWhere('uint64', { pair: { 1: 6n } }).values[0], 6n);
    });

    test('null and presence operators bind nothing', () => {
      const { text, values } = compileWhere('uint64', { maybe: { eq: null }, value: { isDefined: true } });

      expect(values).toEqual([]);
      expect(text).toContain('maybe = NULL');
    });
  });

  describe.each([
    ['float16', F16],
    ['float32', F32],
  ] as const)('%s', (type, Klass) => {
    test('binds the rounded filter value so 0.1 finds what the server stored', () => {
      const { values } = compileWhere(type, { value: 0.1 });

      expect(values[0]).toBeInstanceOf(Klass);
      expect((values[0] as F16).value).toBe(new Klass(0.1).value);
      expect((values[0] as F16).value).not.toBe(0.1);
    });

    test('binds every operator, list member, object sub-field and tuple element', () => {
      for (const op of ['eq', 'neq', 'not', 'gt', 'gte', 'lt', 'lte'])
        expect(compileWhere(type, { value: { [op]: 0.1 } }).values[0]).toBeInstanceOf(Klass);
      for (const op of ['in', 'notIn'])
        expect(
          (compileWhere(type, { value: { [op]: [0.1, 0.2] } }).values[0] as unknown[]).every((v) => v instanceof Klass),
        ).toBe(true);
      expect(compileWhere(type, { value: { between: [0.1, 0.2] } }).values.every((v) => v instanceof Klass)).toBe(true);
      expect(compileWhere(type, { list: { has: 0.1 } }).values[0]).toBeInstanceOf(Klass);
      expect(compileWhere(type, { calib: { gain: { gt: 0.1 } } }).values[0]).toBeInstanceOf(Klass);
      expect(compileWhere(type, { pair: { second: 0.1 } }).values[0]).toBeInstanceOf(Klass);
    });

    test('leaves null alone', () => {
      expect(compileWhere(type, { maybe: { not: null } }).values).toEqual([]);
    });
  });
});
