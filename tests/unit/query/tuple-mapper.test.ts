/**
 * Unit Tests: Tuple Result Mapper
 *
 * Tests result mapping for tuple fields via the public mapRecord function,
 * including nested tuples, objects in tuples, and array-of-tuples.
 */

import { describe, expect, test } from 'bun:test';
import { mapRecord } from '../../../src/query/mappers/result-mapper';
import { RecordId } from 'surrealdb';
import type { FieldMetadata, ModelMetadata, TupleElementMetadata, TupleFieldMetadata } from '../../../src/types';

function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

function elem(
  overrides: Partial<TupleElementMetadata> & { index: number; type: TupleElementMetadata['type'] },
): TupleElementMetadata {
  return {
    isOptional: false,
    ...overrides,
  };
}

function tupleInfo(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

// Coordinate: two named floats
const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

// Tuple with a record element
const refInfo = tupleInfo('Ref', [elem({ index: 0, type: 'string' }), elem({ index: 1, type: 'record' })]);

// Nested tuple
const innerInfo = tupleInfo('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);
const outerInfo = tupleInfo('Outer', [
  elem({ index: 0, type: 'string' }),
  elem({ index: 1, type: 'tuple', tupleInfo: innerInfo }),
]);

// Tuple with object element
const addrFields: FieldMetadata[] = [
  field({ name: 'city', type: 'string', isRequired: true }),
  field({ name: 'state', type: 'string', isRequired: true }),
];
const withObjInfo = tupleInfo('Located', [
  elem({ index: 0, type: 'string' }),
  elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: addrFields } }),
]);

describe('Tuple Result Mapper', () => {
  describe('primitive tuple passthrough', () => {
    test('should pass through tuple array of primitives unchanged', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), location: [40.7, -74.0] }, m);

      expect(result.location).toEqual([40.7, -74.0]);
    });

    test('should handle null tuple value', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'backup', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), backup: null }, m);

      expect(result.backup).toBeNull();
    });

    test('should handle undefined tuple value', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'backup', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1') }, m);

      expect(result.backup).toBeUndefined();
    });
  });

  describe('record element mapping', () => {
    test('should convert RecordId to CerialId in tuple element', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'ref', type: 'tuple', isRequired: true, tupleInfo: refInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), ref: ['hello', new RecordId('post', '42')] }, m);

      const mapped = result.ref as unknown[];
      expect(mapped[0]).toBe('hello');
      // RecordId should be converted to CerialId
      expect(mapped[1]).toBeDefined();
      expect(typeof (mapped[1] as any).toString).toBe('function');
      expect((mapped[1] as any).table).toBe('post');
      expect((mapped[1] as any).id).toBe('42');
    });
  });

  describe('nested tuple mapping', () => {
    test('should recursively map nested tuple', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'data', type: 'tuple', isRequired: true, tupleInfo: outerInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), data: ['hello', [10, 20]] }, m);

      expect(result.data).toEqual(['hello', [10, 20]]);
    });

    test('should handle null element in nested position', () => {
      const optionalInner = tupleInfo('OptInner', [
        elem({ index: 0, type: 'int' }),
        elem({ index: 1, type: 'int', isOptional: true }),
      ]);
      const optOuter = tupleInfo('OptOuter', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: optionalInner, isOptional: true }),
      ]);
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'data', type: 'tuple', isRequired: true, tupleInfo: optOuter }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), data: ['hello', null] }, m);

      const mapped = result.data as unknown[];
      expect(mapped[0]).toBe('hello');
      expect(mapped[1]).toBeNull();
    });
  });

  describe('object in tuple mapping', () => {
    test('should map object element within tuple', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'place', type: 'tuple', isRequired: true, tupleInfo: withObjInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), place: ['NYC', { city: 'NYC', state: 'NY' }] }, m);

      const mapped = result.place as unknown[];
      expect(mapped[0]).toBe('NYC');
      expect(mapped[1]).toEqual({ city: 'NYC', state: 'NY' });
    });
  });

  describe('array of tuples', () => {
    test('should map each tuple in array', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
        ],
      };

      const result = mapRecord(
        {
          id: new RecordId('user', '1'),
          history: [
            [40.7, -74.0],
            [34.0, -118.2],
          ],
        },
        m,
      );

      expect(result.history).toEqual([
        [40.7, -74.0],
        [34.0, -118.2],
      ]);
    });

    test('should handle empty array of tuples', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), history: [] }, m);

      expect(result.history).toEqual([]);
    });

    test('should map record elements within array of tuples', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'refs', type: 'tuple', isRequired: true, isArray: true, tupleInfo: refInfo }),
        ],
      };

      const result = mapRecord(
        {
          id: new RecordId('user', '1'),
          refs: [
            ['first', new RecordId('post', '1')],
            ['second', new RecordId('post', '2')],
          ],
        },
        m,
      );

      const mapped = result.refs as unknown[][];
      expect(mapped[0]![0]).toBe('first');
      expect((mapped[0]![1] as any).table).toBe('post');
      expect((mapped[0]![1] as any).id).toBe('1');
      expect(mapped[1]![0]).toBe('second');
      expect((mapped[1]![1] as any).table).toBe('post');
      expect((mapped[1]![1] as any).id).toBe('2');
    });
  });

  describe('tuple alongside other fields', () => {
    test('should map tuple and primitive fields together', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'name', type: 'string', isRequired: true }),
          field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), name: 'Alice', location: [40.7, -74.0] }, m);

      expect(result.name).toBe('Alice');
      expect(result.location).toEqual([40.7, -74.0]);
    });

    test('should map id field as CerialId alongside tuple', () => {
      const m: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
        ],
      };

      const result = mapRecord({ id: new RecordId('user', '1'), location: [40.7, -74.0] }, m);

      expect((result.id as any).table).toBe('user');
      expect((result.id as any).id).toBe('1');
    });
  });
});
