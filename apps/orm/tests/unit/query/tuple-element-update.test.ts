/**
 * Unit Tests: Per-Element Tuple Update Builder
 *
 * Tests per-element tuple updates via array/object disambiguation.
 * Object form = per-element update, array form = full replace.
 * Covers $this reconstruction, object partial merge, nested tuple recursion,
 * NONE/null handling, and mixed updates.
 */

import { describe, expect, test } from 'bun:test';
import { buildUpdateManyQuery } from '../../../src/query/builders/update-builder';
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

// Coordinate: [float, float] with named elements
const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

// Address object fields
const addrFields: FieldMetadata[] = [
  field({ name: 'street', type: 'string', isRequired: true }),
  field({ name: 'city', type: 'string', isRequired: true }),
];

// Located: [string, TupleAddress] — tuple with object element
const locatedInfo = tupleInfo('Located', [
  elem({ index: 0, type: 'string', name: 'tag' }),
  elem({
    index: 1,
    type: 'object',
    objectInfo: { objectName: 'TupleAddress', fields: addrFields },
  }),
]);

// Inner: [int, int]
const innerInfo = tupleInfo('Inner', [
  elem({ index: 0, type: 'int', name: 'x' }),
  elem({ index: 1, type: 'int', name: 'y' }),
]);

// Outer: [string, Inner] — nested tuple
const outerInfo = tupleInfo('Outer', [
  elem({ index: 0, type: 'string' }),
  elem({
    index: 1,
    type: 'tuple',
    tupleInfo: innerInfo,
  }),
]);

// Optional coordinate tuple: [float, float?]
const optCoordInfo = tupleInfo('OptCoord', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng', isOptional: true }),
]);

function makeModel(tupleField: Partial<FieldMetadata>): ModelMetadata {
  return {
    name: 'User',
    tableName: 'user',
    fields: [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'name', type: 'string', isRequired: true }),
      field({
        name: 'data',
        type: 'tuple',
        isRequired: true,
        ...tupleField,
      }),
    ],
  };
}

describe('Per-Element Tuple Update Builder', () => {
  describe('primitive element updates', () => {
    test('should update single named element with $this reconstruction', () => {
      const model = makeModel({ tupleInfo: coordInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { lat: 5 } });

      // Should use $this reconstruction for the full tuple
      expect(result.text).toContain('data = [$');
      // Changed element should be a bound variable, unchanged should be $this reference
      expect(result.text).toContain('$this.data[1]');
    });

    test('should update element by index key', () => {
      const model = makeModel({ tupleInfo: coordInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { '0': 10 } });

      expect(result.text).toContain('data = [');
      expect(result.text).toContain('$this.data[1]');
    });

    test('should update multiple elements', () => {
      const model = makeModel({ tupleInfo: coordInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { lat: 5, lng: 10 } });

      expect(result.text).toContain('data = [');
      // Both elements should be bound variables (no $this references)
      expect(result.text).not.toContain('$this.data[0]');
      expect(result.text).not.toContain('$this.data[1]');
    });

    test('should preserve unchanged elements with $this reference', () => {
      const tripleInfo = tupleInfo('Triple', [
        elem({ index: 0, type: 'string', name: 'a' }),
        elem({ index: 1, type: 'string', name: 'b' }),
        elem({ index: 2, type: 'string', name: 'c' }),
      ]);
      const model = makeModel({ tupleInfo: tripleInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { b: 'new' } });

      // Elements 0 and 2 should use $this, element 1 should be bound
      expect(result.text).toContain('$this.data[0]');
      expect(result.text).toContain('$this.data[2]');
      expect(result.text).not.toContain('$this.data[1]');
    });
  });

  describe('NONE and null handling', () => {
    test('should emit NONE for NONE sentinel on optional element', () => {
      const model = makeModel({ tupleInfo: optCoordInfo });
      const { NONE } = require('../../../src/utils/none');
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { lng: NONE } });

      expect(result.text).toContain('data = [');
      expect(result.text).toContain('NONE');
    });

    test('should emit NULL for null on nullable element', () => {
      const nullableCoord = tupleInfo('NullCoord', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng', isNullable: true }),
      ]);
      const model = makeModel({ tupleInfo: nullableCoord });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { lng: null } });

      expect(result.text).toContain('data = [');
      expect(result.text).toContain('NULL');
    });
  });

  describe('object element updates', () => {
    test('should partial merge object element with dot-notation', () => {
      const model = makeModel({ tupleInfo: locatedInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { 1: { city: 'NYC' } } });

      // Phase 1: $this reconstruction (object element uses $this)
      expect(result.text).toContain('data = [');
      expect(result.text).toContain('$this.data[1]');
      // Phase 2: dot-notation merge for the object field
      expect(result.text).toContain('data[1].city =');
    });

    test('should full replace object element with { set } wrapper', () => {
      const model = makeModel({ tupleInfo: locatedInfo });
      const result = buildUpdateManyQuery(
        model,
        { name: 'Alice' },
        { data: { 1: { set: { street: '123 Main', city: 'NYC' } } } },
      );

      // Full replace: bound variable in reconstruction, no dot-notation
      expect(result.text).toContain('data = [');
      expect(result.text).not.toContain('data[1].city');
      expect(result.text).not.toContain('data[1].street');
    });
  });

  describe('nested tuple updates', () => {
    test('should handle nested per-element update with recursive $this', () => {
      const model = makeModel({ tupleInfo: outerInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { 1: { x: 42 } } });

      // Outer tuple: $this reconstruction
      expect(result.text).toContain('data = [');
      expect(result.text).toContain('$this.data[1]');
      // Inner tuple: nested $this reconstruction
      expect(result.text).toContain('data[1] = [');
      expect(result.text).toContain('$this.data[1][1]');
    });

    test('should handle nested full replace without recursion', () => {
      const model = makeModel({ tupleInfo: outerInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { data: { 1: [99, 100] } });

      // Full replace: bound variable, no nested $this
      expect(result.text).toContain('data = [');
      expect(result.text).not.toContain('data[1] = [');
    });
  });

  describe('mixed per-element update with other fields', () => {
    test('should combine per-element update with primitive field update', () => {
      const model = makeModel({ tupleInfo: coordInfo });
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { name: 'Bob', data: { lat: 5 } });

      expect(result.text).toContain('name =');
      expect(result.text).toContain('data = [');
    });

    test('should not trigger per-element path for array tuples', () => {
      const model: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field({ name: 'id', type: 'record', isId: true }),
          field({ name: 'name', type: 'string', isRequired: true }),
          field({ name: 'coords', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
        ],
      };
      // Array tuples use push/set, not per-element update
      const result = buildUpdateManyQuery(model, { name: 'Alice' }, { coords: { push: [5, 10] } });

      expect(result.text).toContain('coords +=');
      expect(result.text).not.toContain('$this.coords');
    });
  });
});
