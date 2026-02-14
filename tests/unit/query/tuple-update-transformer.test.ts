/**
 * Unit Tests: Per-Element Tuple Update Transformer
 *
 * Tests data transformation for per-element tuple updates via array/object disambiguation.
 * Object form = per-element update, array form = full replace.
 * Covers element resolution, object partial/set transforms,
 * nested tuple recursion, NONE/null passthrough, and record element handling.
 */

import { describe, expect, test } from 'bun:test';
import { transformData } from '../../../src/query/transformers/data-transformer';
import { NONE } from '../../../src/utils/none';
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

function model(name: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields };
}

// Coordinate: [float, float]
const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

// Address object fields
const addrFields: FieldMetadata[] = [
  field({ name: 'street', type: 'string', isRequired: true }),
  field({ name: 'city', type: 'string', isRequired: true }),
];

// Located: [string, Address]
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

// Outer: [string, Inner]
const outerInfo = tupleInfo('Outer', [
  elem({ index: 0, type: 'string' }),
  elem({
    index: 1,
    type: 'tuple',
    tupleInfo: innerInfo,
  }),
]);

describe('Per-Element Tuple Update Transformer', () => {
  describe('primitive element transforms', () => {
    test('should pass through primitive per-element update data', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { lat: 5 } }, m, 'update');

      expect(result.location).toEqual({ lat: 5 });
    });

    test('should transform per-element update with index key', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { '0': 10 } }, m, 'update');

      expect(result.location).toEqual({ '0': 10 });
    });

    test('should transform per-element update with multiple elements', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { lat: 5, lng: 10 } }, m, 'update');

      expect(result.location).toEqual({ lat: 5, lng: 10 });
    });
  });

  describe('NONE and null passthrough', () => {
    test('should pass NONE through in per-element update', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({
          name: 'data',
          type: 'tuple',
          isRequired: true,
          tupleInfo: tupleInfo('OptCoord', [
            elem({ index: 0, type: 'float', name: 'lat' }),
            elem({ index: 1, type: 'float', name: 'lng', isOptional: true }),
          ]),
        }),
      ]);

      const result = transformData({ data: { lng: NONE } }, m, 'update');
      const updateData = result.data as Record<string, unknown>;

      expect(updateData.lng).toBe(NONE);
    });

    test('should pass null through in per-element update', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { lng: null } }, m, 'update');
      const updateData = result.location as Record<string, unknown>;

      expect(updateData.lng).toBeNull();
    });

    test('should skip undefined elements in per-element update', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { lat: 5, lng: undefined } }, m, 'update');
      const updateData = result.location as Record<string, unknown>;

      expect(updateData.lat).toBe(5);
      expect(updateData.lng).toBeUndefined();
    });
  });

  describe('object element transforms', () => {
    test('should transform partial object merge in per-element update', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'place', type: 'tuple', isRequired: true, tupleInfo: locatedInfo }),
      ]);

      const result = transformData({ place: { 1: { city: 'NYC' } } }, m, 'update');
      const updateData = result.place as Record<string, unknown>;

      expect(updateData['1']).toEqual({ city: 'NYC' });
    });

    test('should transform { set } wrapper for object element', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'place', type: 'tuple', isRequired: true, tupleInfo: locatedInfo }),
      ]);

      const result = transformData({ place: { 1: { set: { street: '123 Main', city: 'NYC' } } } }, m, 'update');
      const updateData = result.place as Record<string, unknown>;

      expect(updateData['1']).toEqual({ set: { street: '123 Main', city: 'NYC' } });
    });
  });

  describe('nested tuple transforms', () => {
    test('should recursively transform nested per-element update', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'data', type: 'tuple', isRequired: true, tupleInfo: outerInfo }),
      ]);

      const result = transformData({ data: { 1: { x: 42 } } }, m, 'update');
      const updateData = result.data as Record<string, unknown>;

      // Nested per-element update is a flat object
      expect(updateData['1']).toEqual({ x: 42 });
    });

    test('should transform nested full replace (array form)', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'data', type: 'tuple', isRequired: true, tupleInfo: outerInfo }),
      ]);

      const result = transformData({ data: { 1: [99, 100] } }, m, 'update');
      const updateData = result.data as Record<string, unknown>;

      // Full replace — array form normalized
      expect(updateData['1']).toEqual([99, 100]);
    });
  });

  describe('skip unknown elements', () => {
    test('should skip unknown keys in per-element update', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ location: { lat: 5, unknown: 'bad' } }, m, 'update');
      const updateData = result.location as Record<string, unknown>;

      expect(updateData.lat).toBe(5);
      expect(updateData).not.toHaveProperty('unknown');
    });
  });

  describe('mixed per-element update with regular fields', () => {
    test('should transform per-element update alongside primitive fields', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = transformData({ name: 'Alice', location: { lat: 5 } }, m, 'update');

      expect(result.name).toBe('Alice');
      expect(result.location).toEqual({ lat: 5 });
    });
  });
});
