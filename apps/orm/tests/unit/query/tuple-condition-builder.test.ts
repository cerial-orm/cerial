/**
 * Unit Tests: Tuple Condition Builder
 *
 * Tests WHERE clause building for tuple fields, including
 * index access notation, named key resolution, nested tuples/objects.
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import {
  buildArrayTupleCondition,
  buildConditions,
  buildTupleCondition,
} from '../../../src/query/filters/condition-builder';
import type { FieldMetadata, ModelMetadata, TupleElementMetadata, TupleFieldMetadata } from '../../../src/types';

// Helper to create a minimal FieldMetadata
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

// Coordinate: named float elements
const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

// Unnamed Point
const pointInfo = tupleInfo('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

// Entry: mixed named/unnamed
const entryInfo = tupleInfo('Entry', [
  elem({ index: 0, type: 'string', name: 'label' }),
  elem({ index: 1, type: 'int' }),
]);

// Nested tuple
const innerInfo = tupleInfo('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);
const nestedInfo = tupleInfo('Outer', [
  elem({ index: 0, type: 'string' }),
  elem({ index: 1, type: 'tuple', tupleInfo: innerInfo, name: 'coords' }),
]);

// Tuple with object element
const addrFields: FieldMetadata[] = [
  field({ name: 'city', type: 'string', isRequired: true }),
  field({ name: 'state', type: 'string', isRequired: true }),
];
const withObjInfo = tupleInfo('Located', [
  elem({ index: 0, type: 'string' }),
  elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: addrFields }, name: 'addr' }),
]);

describe('Tuple Condition Builder', () => {
  describe('buildTupleCondition - named key access', () => {
    test('should build index access via named key', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'location', { lat: 40.7 }, coordInfo);

      expect(result.text).toContain('location[0]');
      expect(Object.values(result.vars).some((v) => v === 40.7)).toBe(true);
    });

    test('should build index access for second named element', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'location', { lng: -74 }, coordInfo);

      expect(result.text).toContain('location[1]');
      expect(Object.values(result.vars).some((v) => v === -74)).toBe(true);
    });

    test('should build multiple conditions with AND', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'location', { lat: 40.7, lng: -74 }, coordInfo);

      expect(result.text).toContain('location[0]');
      expect(result.text).toContain(' AND ');
      expect(result.text).toContain('location[1]');
    });
  });

  describe('buildTupleCondition - index key access', () => {
    test('should build condition using numeric index key', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'point', { '0': 1.5 }, pointInfo);

      expect(result.text).toContain('point[0]');
    });

    test('should build condition using second index', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'point', { '1': 2.5 }, pointInfo);

      expect(result.text).toContain('point[1]');
    });

    test('should build conditions with both index and name on same tuple', () => {
      const ctx = createCompileContext();
      // Named key 'lat' and index key '1' (which is lng)
      const result = buildTupleCondition(ctx, 'location', { lat: 40, '1': -74 }, coordInfo);

      expect(result.text).toContain('location[0]');
      expect(result.text).toContain('location[1]');
    });
  });

  describe('buildTupleCondition - operator objects', () => {
    test('should build gt operator', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'location', { lat: { gt: 35 } }, coordInfo);

      expect(result.text).toContain('location[0]');
      expect(result.text).toContain('>');
    });

    test('should build between operator', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'location', { lat: { between: [30, 50] } }, coordInfo);

      expect(result.text).toContain('location[0]');
      // between generates >= AND <=
      expect(result.text).toContain('>=');
      expect(result.text).toContain('<=');
    });

    test('should build eq operator', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'entry', { label: { eq: 'hello' } }, entryInfo);

      expect(result.text).toContain('entry[0]');
      expect(result.text).toContain('=');
    });

    test('should build neq operator on index key', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'entry', { '1': { neq: 5 } }, entryInfo);

      expect(result.text).toContain('entry[1]');
      expect(result.text).toContain('!=');
    });
  });

  describe('buildTupleCondition - nested tuple', () => {
    test('should build nested tuple condition with double index', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'data', { coords: { '0': 10 } }, nestedInfo);

      expect(result.text).toContain('data[1][0]');
    });

    test('should build nested tuple condition via index key', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'data', { '1': { '0': 10 } }, nestedInfo);

      expect(result.text).toContain('data[1][0]');
    });
  });

  describe('buildTupleCondition - object in tuple', () => {
    test('should build dot notation for object sub-field in tuple', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'place', { addr: { city: 'NYC' } }, withObjInfo);

      expect(result.text).toContain('place[1].city');
      expect(Object.values(result.vars).some((v) => v === 'NYC')).toBe(true);
    });

    test('should build object condition via index key', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'place', { '1': { city: 'NYC' } }, withObjInfo);

      expect(result.text).toContain('place[1].city');
    });
  });

  describe('buildTupleCondition - skip undefined', () => {
    test('should skip undefined values', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'location', { lat: 40, lng: undefined }, coordInfo);

      expect(result.text).toContain('location[0]');
      expect(result.text).not.toContain('location[1]');
    });

    test('should skip unknown keys', () => {
      const ctx = createCompileContext();
      const result = buildTupleCondition(ctx, 'location', { unknown: 99 } as any, coordInfo);

      // Should produce empty or no condition
      expect(result.text).toBe('');
    });
  });

  describe('buildArrayTupleCondition', () => {
    test('should build some quantifier with closure syntax', () => {
      const ctx = createCompileContext();
      const result = buildArrayTupleCondition(ctx, 'history', { some: { lat: { gt: 35 } } }, coordInfo);

      expect(result.text).toContain('.any(');
      expect(result.text).toContain('$v');
    });

    test('should build every quantifier', () => {
      const ctx = createCompileContext();
      const result = buildArrayTupleCondition(ctx, 'history', { every: { lat: { gte: 0 } } }, coordInfo);

      expect(result.text).toContain('.all(');
    });

    test('should build none quantifier with negation', () => {
      const ctx = createCompileContext();
      const result = buildArrayTupleCondition(ctx, 'history', { none: { lat: { gt: 90 } } }, coordInfo);

      expect(result.text).toContain('!(');
      expect(result.text).toContain('.any(');
    });

    test('should build multiple quantifiers with AND', () => {
      const ctx = createCompileContext();
      const result = buildArrayTupleCondition(
        ctx,
        'history',
        { some: { lat: { gt: 0 } }, every: { lng: { lt: 180 } } },
        coordInfo,
      );

      expect(result.text).toContain('.any(');
      expect(result.text).toContain('.all(');
      expect(result.text).toContain(' AND ');
    });
  });

  describe('buildConditions - tuple integration', () => {
    test('should handle single tuple field in model conditions', () => {
      const userModel: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({
            name: 'location',
            type: 'tuple',
            isRequired: true,
            tupleInfo: coordInfo,
          }),
        ],
      };

      const ctx = createCompileContext();
      const result = buildConditions(ctx, { location: { lat: { gt: 35 } } }, userModel);

      expect(result.text).toContain('location[0]');
      expect(result.text).toContain('>');
    });

    test('should handle array tuple field with some quantifier', () => {
      const userModel: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({
            name: 'history',
            type: 'tuple',
            isRequired: true,
            isArray: true,
            tupleInfo: coordInfo,
          }),
        ],
      };

      const ctx = createCompileContext();
      const result = buildConditions(ctx, { history: { some: { lat: { gt: 35 } } } }, userModel);

      expect(result.text).toContain('.any(');
    });

    test('should handle tuple alongside primitive fields', () => {
      const userModel: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'name', type: 'string', isRequired: true }),
          field({
            name: 'location',
            type: 'tuple',
            isRequired: true,
            tupleInfo: coordInfo,
          }),
        ],
      };

      const ctx = createCompileContext();
      const result = buildConditions(ctx, { name: 'Alice', location: { lat: 40 } }, userModel);

      expect(result.text).toContain('name =');
      expect(result.text).toContain('location[0]');
    });
  });
});
