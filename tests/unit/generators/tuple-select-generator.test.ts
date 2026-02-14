/**
 * Unit Tests: Tuple Select Type Generator
 *
 * Tests generation of TupleSelect types for sub-field selection.
 * Only tuples with object elements at any nesting depth get Select types.
 */

import { describe, expect, test } from 'bun:test';
import { generateTupleSelectType } from '../../../src/generators/types/tuples/select-generator';
import { tupleHasObjectElementsDeep } from '../../../src/generators/types/tuples/interface-generator';
import type { FieldMetadata, TupleElementMetadata, TupleMetadata } from '../../../src/types';

function elem(
  overrides: Partial<TupleElementMetadata> & { index: number; type: TupleElementMetadata['type'] },
): TupleElementMetadata {
  return {
    isOptional: false,
    ...overrides,
  };
}

function tuple(name: string, elements: TupleElementMetadata[]): TupleMetadata {
  return { name, elements };
}

const addrFields: FieldMetadata[] = [
  { name: 'street', type: 'string', isId: false, isUnique: false, isRequired: true },
  { name: 'city', type: 'string', isId: false, isUnique: false, isRequired: true },
];

describe('Tuple Select Type Generator', () => {
  describe('tupleHasObjectElementsDeep', () => {
    test('should return false for all-primitive tuple', () => {
      const t = tuple('Coordinate', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng' }),
      ]);

      expect(tupleHasObjectElementsDeep(t)).toBe(false);
    });

    test('should return true for tuple with direct object element', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: { objectName: 'Address', fields: addrFields },
        }),
      ]);

      expect(tupleHasObjectElementsDeep(t)).toBe(true);
    });

    test('should return true for tuple with nested tuple containing object', () => {
      const innerTuple = tuple('Inner', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: { objectName: 'Address', fields: addrFields },
        }),
      ]);

      const t = tuple('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'tuple',
          tupleInfo: { tupleName: 'Inner', elements: innerTuple.elements },
        }),
      ]);

      expect(tupleHasObjectElementsDeep(t)).toBe(true);
    });

    test('should return false for nested tuple without objects', () => {
      const innerTuple = tuple('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);

      const t = tuple('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'tuple',
          tupleInfo: { tupleName: 'Inner', elements: innerTuple.elements },
        }),
      ]);

      expect(tupleHasObjectElementsDeep(t)).toBe(false);
    });

    test('should return true for deeply nested tuple with object at depth 3', () => {
      const deepInner = tuple('DeepInner', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: { objectName: 'Data', fields: addrFields },
        }),
      ]);

      const mid = tuple('Mid', [
        elem({
          index: 0,
          type: 'tuple',
          tupleInfo: { tupleName: 'DeepInner', elements: deepInner.elements },
        }),
      ]);

      const outer = tuple('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'tuple',
          tupleInfo: { tupleName: 'Mid', elements: mid.elements },
        }),
      ]);

      expect(tupleHasObjectElementsDeep(outer)).toBe(true);
    });
  });

  describe('generateTupleSelectType', () => {
    test('should return null for all-primitive tuple', () => {
      const t = tuple('Coordinate', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng' }),
      ]);

      expect(generateTupleSelectType(t)).toBeNull();
    });

    test('should generate select type for tuple with object element', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string', name: 'tag' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: { objectName: 'TupleAddress', fields: addrFields },
        }),
      ]);

      const result = generateTupleSelectType(t);

      expect(result).not.toBeNull();
      expect(result).toContain('export type LocatedSelect');
      // Only object element appears in select type
      expect(result).toContain('1?: boolean | TupleAddressSelect');
      // Primitive elements are NOT in the select type
      expect(result).not.toContain('0?');
      expect(result).not.toContain('tag?');
    });

    test('should include named keys for named object elements', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'object',
          name: 'address',
          objectInfo: { objectName: 'TupleAddress', fields: addrFields },
        }),
      ]);

      const result = generateTupleSelectType(t);

      expect(result).not.toBeNull();
      expect(result).toContain('1?: boolean | TupleAddressSelect');
      expect(result).toContain('address?: boolean | TupleAddressSelect');
    });

    test('should generate select type for nested tuple with objects', () => {
      const innerTuple = tuple('Inner', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: { objectName: 'Data', fields: addrFields },
        }),
      ]);

      const t = tuple('Outer', [
        elem({ index: 0, type: 'int' }),
        elem({
          index: 1,
          type: 'tuple',
          tupleInfo: { tupleName: 'Inner', elements: innerTuple.elements },
        }),
      ]);

      const result = generateTupleSelectType(t);

      expect(result).not.toBeNull();
      expect(result).toContain('export type OuterSelect');
      expect(result).toContain('1?: boolean | InnerSelect');
      expect(result).not.toContain('0?');
    });

    test('should return null for nested tuple without objects', () => {
      const innerTuple = tuple('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);

      const t = tuple('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'tuple',
          tupleInfo: { tupleName: 'Inner', elements: innerTuple.elements },
        }),
      ]);

      expect(generateTupleSelectType(t)).toBeNull();
    });

    test('should handle multiple selectable elements', () => {
      const t = tuple('MultiObj', [
        elem({
          index: 0,
          type: 'object',
          name: 'addr',
          objectInfo: { objectName: 'Address', fields: addrFields },
        }),
        elem({ index: 1, type: 'string' }),
        elem({
          index: 2,
          type: 'object',
          name: 'billing',
          objectInfo: { objectName: 'BillingAddr', fields: addrFields },
        }),
      ]);

      const result = generateTupleSelectType(t);

      expect(result).not.toBeNull();
      expect(result).toContain('0?: boolean | AddressSelect');
      expect(result).toContain('addr?: boolean | AddressSelect');
      expect(result).toContain('2?: boolean | BillingAddrSelect');
      expect(result).toContain('billing?: boolean | BillingAddrSelect');
      // Primitive not present
      expect(result).not.toContain('1?');
    });

    test('should handle tuple with only one object element as the only element', () => {
      const t = tuple('Wrapper', [
        elem({
          index: 0,
          type: 'object',
          objectInfo: { objectName: 'Payload', fields: addrFields },
        }),
      ]);

      const result = generateTupleSelectType(t);

      expect(result).not.toBeNull();
      expect(result).toContain('0?: boolean | PayloadSelect');
    });
  });
});
