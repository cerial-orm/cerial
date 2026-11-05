/**
 * Unit Tests: a sized value in a `Number` or `Any` field
 *
 * Only a raw write puts a sized value in either, since Cerial sends plain int and float. Before the
 * fix a `Number` field read it back as null and an `Any` field leaked the SDK's wrapper object.
 */

import { describe, expect, test } from 'bun:test';
import { F32, SizedNumber, U64, U8 } from 'surrealdb';
import { mapFieldValue, mapRecord } from '../../../../src/query/mappers/result-mapper';
import { field, model } from '../helpers';

describe('Number field', () => {
  test.each([
    [new U8(7), 7],
    [new F32(0.5), 0.5],
    [new U64(9), 9],
  ])('unwraps %p to a plain number', (wrapped, expected) => {
    expect(mapFieldValue(wrapped, 'number')).toBe(expected);
  });

  test('a u64 loses precision past 2^53 and still reads as a number', () => {
    expect(mapFieldValue(new U64(2n ** 53n + 1n), 'number')).toBe(Number(2n ** 53n));
  });

  test('plain numbers are unchanged and a non-number is still null', () => {
    expect(mapFieldValue(3.5, 'number')).toBe(3.5);
    expect(mapFieldValue('3', 'number')).toBeNull();
    expect(mapFieldValue({ value: 3 }, 'number')).toBeNull();
  });

  test('maps inside a record', () => {
    const m = model('T', [field({ name: 'n', type: 'number' }), field({ name: 'ns', type: 'number', isArray: true })]);

    expect(mapRecord({ n: new U8(1), ns: [new U8(2), 3] }, m)).toEqual({ n: 1, ns: [2, 3] });
  });
});

describe('Any field', () => {
  test('unwraps a sized value; u64 becomes a bigint even when small', () => {
    expect(mapFieldValue(new U8(7), 'any')).toBe(7);
    expect(mapFieldValue(new F32(0.5), 'any')).toBe(0.5);
    expect(mapFieldValue(new U64(7), 'any')).toBe(7n);
  });

  test('unwraps at any depth in arrays and plain objects', () => {
    const out = mapFieldValue({ a: [new U8(1), { b: new U64(2) }], c: 'x', d: null }, 'any');

    expect(out).toEqual({ a: [1, { b: 2n }], c: 'x', d: null });
  });

  test('leaves the result free of SizedNumber instances', () => {
    const out = JSON.stringify(mapFieldValue([new U8(1), { x: new F32(2) }], 'any'));

    expect(out).toBe('[1,{"x":2}]');
    expect((mapFieldValue([new U8(1)], 'any') as unknown[]).some((v) => v instanceof SizedNumber)).toBe(false);
  });

  test('passes other values through unchanged', () => {
    const date = new Date(0);

    expect(mapFieldValue(date, 'any')).toBe(date);
    expect(mapFieldValue('s', 'any')).toBe('s');
    expect(mapFieldValue(5, 'any')).toBe(5);
    expect(mapFieldValue(null, 'any')).toBeNull();
    expect(mapFieldValue(undefined, 'any')).toBeUndefined();
  });

  test('maps inside a record, including an array of any', () => {
    const m = model('T', [field({ name: 'v', type: 'any' }), field({ name: 'vs', type: 'any', isArray: true })]);

    expect(mapRecord({ v: new U8(1), vs: [new U64(2), 'y'] }, m)).toEqual({ v: 1, vs: [2n, 'y'] });
  });
});
