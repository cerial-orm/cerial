/**
 * Unit Tests: Tuple Data Transformer
 *
 * Tests data transformation for tuple fields: array normalization,
 * object-to-array conversion, nested tuple/object transformation.
 */

import { describe, expect, test } from 'bun:test';
import { TIME_NOW } from '../../../src/query/compile/inline-expression';
import { transformData } from '../../../src/query/transformers/data-transformer';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';
import { elem, field, tupleInfo } from './helpers';

// Coordinate tuple
const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

// Entry with mixed types
const _entryInfo = tupleInfo('Entry', [
  elem({ index: 0, type: 'string', name: 'label' }),
  elem({ index: 1, type: 'int' }),
  elem({ index: 2, type: 'bool' }),
]);

// Nested tuple
const innerInfo = tupleInfo('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);
const nestedInfo = tupleInfo('Outer', [
  elem({ index: 0, type: 'string' }),
  elem({ index: 1, type: 'tuple', tupleInfo: innerInfo }),
]);

// Tuple with object element
const addrFields: FieldMetadata[] = [
  field({ name: 'street', type: 'string', isRequired: true }),
  field({ name: 'city', type: 'string', isRequired: true }),
];
const withObjInfo = tupleInfo('Located', [
  elem({ index: 0, type: 'string' }),
  elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: addrFields } }),
]);

function model(name: string, fields: FieldMetadata[]): ModelMetadata {
  return {
    name,
    tableName: name.toLowerCase(),
    fields,
  };
}

describe('Tuple Data Transformer', () => {
  describe('array input passthrough', () => {
    test('should pass through array form unchanged for primitive tuple', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: [1.5, 2.5] }, m);

      expect(result.location).toEqual([1.5, 2.5]);
    });

    test('should pass through single-element array', () => {
      const singleInfo = tupleInfo('Single', [elem({ index: 0, type: 'string' })]);
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'tag', type: 'tuple', isRequired: true, tupleInfo: singleInfo }),
      ]);

      const result = transformData({ tag: ['hello'] }, m);

      expect(result.tag).toEqual(['hello']);
    });
  });

  describe('object input normalization', () => {
    test('should convert named object form to array', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { lat: 1.5, lng: 2.5 } }, m);

      expect(result.location).toEqual([1.5, 2.5]);
    });

    test('should convert index-based object form to array', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { '0': 1.5, '1': 2.5 } }, m);

      expect(result.location).toEqual([1.5, 2.5]);
    });

    test('should prefer named key over index key when both present', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      // Named key 'lat' should take precedence
      const result = transformData({ location: { lat: 10, '0': 99 } }, m);

      // lat (named) = 10, lng should be undefined
      expect((result.location as unknown[])[0]).toBe(10);
    });
  });

  describe('null/undefined handling', () => {
    test('should pass null through for tuple value (update builder converts to NONE)', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: null }, m);

      // null passes through — update builder converts null → NONE for optional tuples
      expect(result.location).toBeNull();
    });

    test('should skip undefined tuple value', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: undefined }, m);

      expect(result.location).toBeUndefined();
    });

    test('should handle null element within tuple array', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({
          name: 'point',
          type: 'tuple',
          isRequired: true,
          tupleInfo: tupleInfo('MaybePoint', [
            elem({ index: 0, type: 'float' }),
            elem({ index: 1, type: 'float', isOptional: true }),
          ]),
        }),
      ]);

      const result = transformData({ point: [1.0, null] }, m);

      expect(result.point).toEqual([1.0, null]);
    });
  });

  describe('array of tuples', () => {
    test('should transform each element in array of tuples', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData(
        {
          history: [
            [1, 2],
            [3, 4],
          ],
        },
        m,
      );

      expect(result.history).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    test('should transform object form in array of tuples', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData(
        {
          history: [
            { lat: 1, lng: 2 },
            { lat: 3, lng: 4 },
          ],
        },
        m,
      );

      expect(result.history).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    test('should handle empty array of tuples', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ history: [] }, m);

      expect(result.history).toEqual([]);
    });
  });

  describe('nested tuple transformation', () => {
    test('should recursively transform nested tuple elements', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'data', type: 'tuple', isRequired: true, tupleInfo: nestedInfo }),
      ]);

      const result = transformData({ data: ['hello', [10, 20]] }, m);

      expect(result.data).toEqual(['hello', [10, 20]]);
    });
  });

  describe('object-in-tuple transformation', () => {
    test('should transform object element within tuple', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'place', type: 'tuple', isRequired: true, tupleInfo: withObjInfo }),
      ]);

      const result = transformData({ place: ['NYC', { street: '1 Main', city: 'NYC' }] }, m);

      expect(result.place).toEqual(['NYC', { street: '1 Main', city: 'NYC' }]);
    });
  });

  describe('mixed tuple and other fields', () => {
    test('should transform tuple alongside primitive fields', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ name: 'Alice', location: [40, -74] }, m);

      expect(result.name).toBe('Alice');
      expect(result.location).toEqual([40, -74]);
    });
  });
  describe('element decorator defaults', () => {
    // [label, born @createdAt, touched @updatedAt, hits @defaultAlways(7), tag @default('x')]
    const stampInfo = tupleInfo('Stamped', [
      elem({ index: 0, type: 'string', name: 'label' }),
      elem({ index: 1, type: 'date', name: 'born', timestampDecorator: 'createdAt' }),
      elem({ index: 2, type: 'date', name: 'touched', timestampDecorator: 'updatedAt' }),
      elem({ index: 3, type: 'int', name: 'hits', defaultAlwaysValue: 7 }),
      elem({ index: 4, type: 'string', name: 'tag', defaultValue: 'x' }),
    ]);
    const stampModel = model('Stamped', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'stamp', type: 'tuple', isRequired: true, tupleInfo: stampInfo }),
    ]);

    test('should fill every omitted decorated position', () => {
      const result = transformData({ stamp: ['a'] }, stampModel);

      expect(result.stamp).toEqual(['a', TIME_NOW, TIME_NOW, 7, 'x']);
    });

    test('should fill omitted positions from object input form', () => {
      const result = transformData({ stamp: { label: 'a' } }, stampModel);

      expect(result.stamp).toEqual(['a', TIME_NOW, TIME_NOW, 7, 'x']);
    });

    test('should never overwrite a supplied value', () => {
      const born = new Date('2020-01-01T00:00:00Z');
      const touched = new Date('2021-01-01T00:00:00Z');
      const result = transformData({ stamp: ['a', born, touched, 99, 'own'] }, stampModel);

      expect(result.stamp).toEqual(['a', born, touched, 99, 'own']);
    });

    test('should leave an omitted position with no decorator untouched', () => {
      const plainInfo = tupleInfo('Plain', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'int', isOptional: true }),
      ]);
      const m = model('Plain', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'plain', type: 'tuple', isRequired: true, tupleInfo: plainInfo }),
      ]);

      const result = transformData({ plain: ['a'] }, m);

      expect(result.plain).toEqual(['a', undefined]);
    });

    test('should prefer the timestamp over @defaultAlways and @default on one element', () => {
      const mixedInfo = tupleInfo('Mixed', [
        elem({ index: 0, type: 'date', timestampDecorator: 'createdAt', defaultAlwaysValue: 1, defaultValue: 2 }),
      ]);
      const m = model('Mixed', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'mixed', type: 'tuple', isRequired: true, tupleInfo: mixedInfo }),
      ]);

      const result = transformData({ mixed: [] }, m);

      expect(result.mixed).toEqual([TIME_NOW]);
    });

    test('should prefer @defaultAlways over @default on one element', () => {
      const mixedInfo = tupleInfo('Mixed', [elem({ index: 0, type: 'int', defaultAlwaysValue: 1, defaultValue: 2 })]);
      const m = model('Mixed', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'mixed', type: 'tuple', isRequired: true, tupleInfo: mixedInfo }),
      ]);

      const result = transformData({ mixed: [] }, m);

      expect(result.mixed).toEqual([1]);
    });

    test('should fill a @nullable element with its default, not null', () => {
      const nullableInfo = tupleInfo('Nullable', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'int', isNullable: true, defaultValue: 5 }),
      ]);
      const m = model('Nullable', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'n', type: 'tuple', isRequired: true, tupleInfo: nullableInfo }),
      ]);

      const result = transformData({ n: ['a'] }, m);

      expect(result.n).toEqual(['a', 5]);
    });

    test('should keep the null fill for a @nullable element with no default', () => {
      const nullableInfo = tupleInfo('Nullable', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'int', isNullable: true }),
      ]);
      const m = model('Nullable', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'n', type: 'tuple', isRequired: true, tupleInfo: nullableInfo }),
      ]);

      const result = transformData({ n: ['a'] }, m);

      expect(result.n).toEqual(['a', null]);
    });

    test('should fill a decorated element of a nested tuple', () => {
      const innerStamp = tupleInfo('InnerStamp', [
        elem({ index: 0, type: 'int' }),
        elem({ index: 1, type: 'date', timestampDecorator: 'createdAt' }),
      ]);
      const outer = tupleInfo('OuterStamp', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: innerStamp }),
      ]);
      const m = model('Outer', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'outer', type: 'tuple', isRequired: true, tupleInfo: outer }),
      ]);

      const result = transformData({ outer: ['a', [1]] }, m);

      expect(result.outer).toEqual(['a', [1, TIME_NOW]]);
    });

    test('should fill each tuple of a tuple array independently', () => {
      const stampArrayModel = model('Stamped', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'stamps', type: 'tuple', isRequired: true, isArray: true, tupleInfo: stampInfo }),
      ]);

      const result = transformData({ stamps: [['a'], ['b', undefined, undefined, 3]] }, stampArrayModel);

      expect(result.stamps).toEqual([
        ['a', TIME_NOW, TIME_NOW, 7, 'x'],
        ['b', TIME_NOW, TIME_NOW, 3, 'x'],
      ]);
    });
  });
});
