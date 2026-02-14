/**
 * Unit Tests: Tuple Select Builder
 *
 * Tests SELECT field building for tuple sub-field selection.
 * Covers object narrowing, nested tuple reconstruction, mixed fields,
 * and the explicit object construction strategy.
 */

import { describe, expect, test } from 'bun:test';
import { buildSelectFields, buildTupleSelect } from '../../../src/query/builders/select-builder';
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

// Address object fields
const addrFields: FieldMetadata[] = [
  field({ name: 'street', type: 'string', isRequired: true }),
  field({ name: 'city', type: 'string', isRequired: true }),
  field({ name: 'zip', type: 'string', isRequired: true }),
];

// Located: [string, TupleAddress]
const locatedInfo = tupleInfo('Located', [
  elem({ index: 0, type: 'string', name: 'tag' }),
  elem({
    index: 1,
    type: 'object',
    objectInfo: { objectName: 'TupleAddress', fields: addrFields },
  }),
]);

// Coordinate: [float, float]
const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

// Inner: [int, Address]
const innerInfo = tupleInfo('Inner', [
  elem({ index: 0, type: 'int' }),
  elem({
    index: 1,
    type: 'object',
    objectInfo: { objectName: 'Address', fields: addrFields },
  }),
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

// Person object with nested tuple field
const personFields: FieldMetadata[] = [
  field({ name: 'name', type: 'string', isRequired: true }),
  field({ name: 'pos', type: 'tuple', isRequired: true, tupleInfo: innerInfo }),
];

// Deep tuple: [string, [int, { name: string, pos: [int, Address] }]]
const deepMidObj = {
  objectName: 'DeepMidObj',
  fields: personFields,
};
const deepMidTupleInfo = tupleInfo('DeepMidTuple', [
  elem({ index: 0, type: 'int' }),
  elem({
    index: 1,
    type: 'object',
    objectInfo: deepMidObj,
  }),
]);
const deepOuterInfo = tupleInfo('DeepOuterTuple', [
  elem({ index: 0, type: 'string' }),
  elem({
    index: 1,
    type: 'tuple',
    tupleInfo: deepMidTupleInfo,
  }),
]);

function makeModel(fields: Partial<FieldMetadata>[]): ModelMetadata {
  return {
    name: 'User',
    tableName: 'user',
    fields: [field({ name: 'id', type: 'record', isId: true }), ...fields.map((f) => field(f))],
  };
}

describe('Tuple Select Builder', () => {
  describe('buildTupleSelect', () => {
    test('should reconstruct full tuple when select is boolean true for all elements', () => {
      const result = buildTupleSelect('loc', { 1: true }, locatedInfo);

      // All elements use their field path reference
      expect(result).toBe('[loc[0], loc[1]] as loc');
    });

    test('should narrow object element with explicit construction', () => {
      const result = buildTupleSelect('loc', { 1: { city: true } }, locatedInfo);

      expect(result).toBe('[loc[0], { city: loc[1].city }] as loc');
    });

    test('should narrow multiple object fields', () => {
      const result = buildTupleSelect('loc', { 1: { city: true, zip: true } }, locatedInfo);

      expect(result).toBe('[loc[0], { city: loc[1].city, zip: loc[1].zip }] as loc');
    });

    test('should handle named key in select', () => {
      // Named elements can be selected by name
      const result = buildTupleSelect('loc', { tag: true }, locatedInfo);

      // tag maps to element 0, element 1 is unchanged
      expect(result).toBe('[loc[0], loc[1]] as loc');
    });

    test('should handle empty select (all elements returned as-is)', () => {
      const result = buildTupleSelect('loc', {}, locatedInfo);

      expect(result).toBe('[loc[0], loc[1]] as loc');
    });

    test('should handle nested tuple select', () => {
      const result = buildTupleSelect('data', { 1: { 1: { city: true } } }, outerInfo);

      // Inner tuple's object element narrowed
      expect(result).toBe('[data[0], [data[1][0], { city: data[1][1].city }]] as data');
    });

    test('should reconstruct nested tuple with all elements when inner select is true', () => {
      const result = buildTupleSelect('data', { 1: true }, outerInfo);

      expect(result).toBe('[data[0], data[1]] as data');
    });
  });

  describe('depth-5 nested tuple select', () => {
    test('should handle deep nesting: outer → tuple → object → tuple → object', () => {
      const result = buildTupleSelect('deep', { 1: { 1: { pos: { 1: { city: true } } } } }, deepOuterInfo);

      // DeepOuterTuple[0] = string (unchanged)
      // DeepOuterTuple[1] = DeepMidTuple
      //   DeepMidTuple[0] = int (unchanged)
      //   DeepMidTuple[1] = DeepMidObj { name, pos }
      //     pos = Inner = [int, Address]
      //       Inner[0] = int (unchanged)
      //       Inner[1] = Address { city }
      expect(result).toBe(
        '[deep[0], [deep[1][0], { pos: [deep[1][1].pos[0], { city: deep[1][1].pos[1].city }] }]] as deep',
      );
    });

    test('should handle deep object-only select at mid level', () => {
      const result = buildTupleSelect('deep', { 1: { 1: { name: true } } }, deepOuterInfo);

      expect(result).toBe('[deep[0], [deep[1][0], { name: deep[1][1].name }]] as deep');
    });
  });

  describe('buildSelectFields with tuple fields', () => {
    test('should use buildTupleSelect when select value is object on tuple field', () => {
      const model = makeModel([{ name: 'loc', type: 'tuple', isRequired: true, tupleInfo: locatedInfo }]);

      const result = buildSelectFields({ loc: { 1: { city: true } } } as any, model);

      expect(result).toBe('[loc[0], { city: loc[1].city }] as loc');
    });

    test('should use boolean true for tuple field (returns field name)', () => {
      const model = makeModel([{ name: 'loc', type: 'tuple', isRequired: true, tupleInfo: locatedInfo }]);

      const result = buildSelectFields({ loc: true }, model);

      expect(result).toBe('loc');
    });

    test('should combine tuple select with primitive and object select', () => {
      const model = makeModel([
        { name: 'name', type: 'string', isRequired: true },
        { name: 'loc', type: 'tuple', isRequired: true, tupleInfo: locatedInfo },
        {
          name: 'address',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Address', fields: addrFields },
        },
      ]);

      const result = buildSelectFields(
        {
          name: true,
          loc: { 1: { city: true } },
          address: { street: true },
        } as any,
        model,
      );

      expect(result).toContain('name');
      expect(result).toContain('[loc[0], { city: loc[1].city }] as loc');
      expect(result).toContain('address.{ street }');
    });

    test('should still use object destructuring for object fields (not tuple path)', () => {
      const model = makeModel([
        {
          name: 'address',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Address', fields: addrFields },
        },
      ]);

      const result = buildSelectFields({ address: { city: true } } as any, model);

      expect(result).toBe('address.{ city }');
    });

    test('should return * when select is undefined', () => {
      const model = makeModel([{ name: 'loc', type: 'tuple', isRequired: true, tupleInfo: locatedInfo }]);

      const result = buildSelectFields(undefined, model);

      expect(result).toBe('*');
    });

    test('should handle all-primitive tuple with boolean select only', () => {
      const model = makeModel([{ name: 'coord', type: 'tuple', isRequired: true, tupleInfo: coordInfo }]);

      const result = buildSelectFields({ coord: true }, model);

      expect(result).toBe('coord');
    });
  });
});
