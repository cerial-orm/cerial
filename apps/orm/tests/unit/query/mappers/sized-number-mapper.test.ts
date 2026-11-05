/**
 * Unit Tests: result mapping for sized number fields
 *
 * Over cbor.2 the SDK returns every sized value as a SizedNumber. The mapper unwraps them to a
 * number, or a bigint for Uint64 whatever its size.
 */

import { describe, expect, test } from 'bun:test';
import { F16, F32, I16, I32, I8, U16, U32, U64, U8 } from 'surrealdb';
import { mapFieldValue, mapRecord } from '../../../../src/query/mappers/result-mapper';
import type { SchemaFieldType } from '../../../../src/types';
import { sizedModel } from '../sized-numbers/helpers';

const WRAPPED: ReadonlyArray<[SchemaFieldType, unknown, number | bigint]> = [
  ['int8', new I8(-5), -5],
  ['uint8', new U8(200), 200],
  ['int16', new I16(-300), -300],
  ['uint16', new U16(60000), 60000],
  ['int32', new I32(-70000), -70000],
  ['uint32', new U32(4000000000), 4000000000],
  ['uint64', new U64(5), 5n],
  ['float16', new F16(0.1), 0.0999755859375],
  ['float32', new F32(0.1), 0.10000000149011612],
];

describe('sized number result mapping', () => {
  test.each(WRAPPED)('%s unwraps to its value', (type, wrapped, expected) => {
    expect(mapFieldValue(wrapped, type)).toBe(expected);
  });

  test('Uint64 is a bigint even when small, and exact above 2^53 and 2^63', () => {
    expect(mapFieldValue(new U64(0), 'uint64')).toBe(0n);
    expect(mapFieldValue(new U64(2n ** 53n + 1n), 'uint64')).toBe(2n ** 53n + 1n);
    expect(mapFieldValue(new U64(2n ** 64n - 1n), 'uint64')).toBe(2n ** 64n - 1n);
  });

  test('a plain number from an older server takes the same shape', () => {
    expect(mapFieldValue(7, 'uint64')).toBe(7n);
    expect(mapFieldValue(7, 'uint8')).toBe(7);
    expect(mapFieldValue(0.5, 'float32')).toBe(0.5);
  });

  test('null and undefined keep their meaning, and an unreadable value becomes null', () => {
    expect(mapFieldValue(null, 'uint8')).toBeNull();
    expect(mapFieldValue(undefined, 'uint8')).toBeUndefined();
    expect(mapFieldValue('x', 'uint8')).toBeNull();
    expect(mapFieldValue(1.5, 'uint64')).toBeNull();
  });

  describe('inside a record', () => {
    test('unwraps required, optional, array, object and tuple positions', () => {
      const row = {
        value: new U8(1),
        maybe: new U8(2),
        list: [new U8(3), new U8(4)],
        calib: { gain: new U8(5) },
        pair: [new U8(6), new U8(7)],
      };

      expect(mapRecord(row, sizedModel('uint8'))).toEqual({
        value: 1,
        maybe: 2,
        list: [3, 4],
        calib: { gain: 5 },
        pair: [6, 7],
      });
    });

    test('unwraps a set returned as a native Set', () => {
      const out = mapRecord({ list: new Set([new U16(1), new U16(2)]) }, sizedModel('uint16'));

      expect(out.list).toEqual([1, 2]);
    });

    test('Uint64 positions are bigints everywhere', () => {
      const row = {
        value: new U64(1),
        list: [new U64(2)],
        calib: { gain: new U64(3) },
        pair: [new U64(4), new U64(5)],
      };

      expect(mapRecord(row, sizedModel('uint64'))).toEqual({
        value: 1n,
        list: [2n],
        calib: { gain: 3n },
        pair: [4n, 5n],
      });
    });

    test('unwraps object arrays and tuple arrays', () => {
      const model = sizedModel('float32');
      const out = mapRecord({ calib: { gain: new F32(0.5) } }, model) as { calib: { gain: number } };

      expect(out.calib.gain).toBe(0.5);
    });

    test('keeps null and absent optional values', () => {
      const out = mapRecord({ value: new I8(1), maybe: null }, sizedModel('int8'));

      expect(out).toEqual({ value: 1, maybe: null });
    });

    test('unwraps a sized value inside an included relation row', () => {
      const out = mapRecord(
        { owner: { id: 'user:1', age: new U8(30), tags: [new U64(2)] } },
        {
          name: 'Post',
          tableName: 'post',
          fields: [{ name: 'owner', type: 'relation', isId: false, isUnique: false, isRequired: false }],
        },
      ) as { owner: { age: number; tags: bigint[] } };

      expect(out.owner.age).toBe(30);
      expect(out.owner.tags).toEqual([2n]);
    });
  });
});
