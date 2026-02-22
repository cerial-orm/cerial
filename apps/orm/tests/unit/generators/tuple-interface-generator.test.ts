/**
 * Unit Tests: Tuple Interface Generator
 *
 * Tests TypeScript type generation for tuple definitions:
 * output types, input types, and helper functions.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateTupleInputInterface,
  generateTupleInterface,
  generateTupleInterfaces,
  generateTupleOutputType,
  tupleHasNamedElements,
  tupleHasObjectElements,
  tupleHasTupleElements,
} from '../../../src/generators/types/tuples/interface-generator';
import type { TupleElementMetadata, TupleMetadata } from '../../../src/types';

// Helper to create a minimal TupleElementMetadata
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

describe('Tuple Interface Generator', () => {
  describe('generateTupleOutputType', () => {
    test('should generate tuple type with two floats', () => {
      const t = tuple('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[number, number]');
    });

    test('should generate tuple type with mixed types', () => {
      const t = tuple('Entry', [
        elem({ index: 0, type: 'string', name: 'name' }),
        elem({ index: 1, type: 'int' }),
        elem({ index: 2, type: 'bool' }),
      ]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[string, number, boolean]');
    });

    test('should generate tuple type with optional element', () => {
      const t = tuple('MaybePoint', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[number, number | null]');
    });

    test('should generate tuple type with all types', () => {
      const t = tuple('AllTypes', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'int' }),
        elem({ index: 2, type: 'float' }),
        elem({ index: 3, type: 'bool' }),
        elem({ index: 4, type: 'date' }),
        elem({ index: 5, type: 'email' }),
      ]);

      const result = generateTupleOutputType(t);
      expect(result).toContain('string');
      expect(result).toContain('number');
      expect(result).toContain('boolean');
      expect(result).toContain('Date');
    });

    test('should generate tuple type with object element', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] } }),
      ]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[string, Address]');
    });

    test('should generate tuple type with nested tuple element', () => {
      const t = tuple('Nested', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: { tupleName: 'Coordinate', elements: [] } }),
      ]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[string, Coordinate]');
    });

    test('should generate tuple type with optional object element', () => {
      const t = tuple('MaybeLocated', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] }, isOptional: true }),
      ]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[string, Address | null]');
    });

    test('should generate tuple type with optional nested tuple element', () => {
      const t = tuple('MaybeNested', [
        elem({ index: 0, type: 'int' }),
        elem({ index: 1, type: 'tuple', tupleInfo: { tupleName: 'Inner', elements: [] }, isOptional: true }),
      ]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[number, Inner | null]');
    });

    test('should generate single-element tuple type', () => {
      const t = tuple('Single', [elem({ index: 0, type: 'string' })]);

      const result = generateTupleOutputType(t);
      expect(result).toBe('[string]');
    });
  });

  describe('generateTupleInterface', () => {
    test('should generate exported type alias', () => {
      const t = tuple('Coordinate', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng' }),
      ]);

      const result = generateTupleInterface(t);
      expect(result).toBe('export type Coordinate = [number, number];');
    });

    test('should generate type alias with optional elements', () => {
      const t = tuple('MaybePoint', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);

      const result = generateTupleInterface(t);
      expect(result).toBe('export type MaybePoint = [number, number | null];');
    });
  });

  describe('generateTupleInputInterface', () => {
    test('should generate input type with array and object forms for named tuple', () => {
      const t = tuple('Coordinate', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng' }),
      ]);

      const result = generateTupleInputInterface(t);

      expect(result).toContain('export type CoordinateInput =');
      // Array form
      expect(result).toContain('[number, number]');
      // Object form with both index and named keys
      expect(result).toContain('0?: number;');
      expect(result).toContain('lat?: number;');
      expect(result).toContain('1?: number;');
      expect(result).toContain('lng?: number;');
    });

    test('should generate input type for unnamed tuple (index-only)', () => {
      const t = tuple('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      const result = generateTupleInputInterface(t);

      expect(result).toContain('export type PointInput =');
      // Array form
      expect(result).toContain('[number, number]');
      // Object form with index keys only
      expect(result).toContain('0?: number;');
      expect(result).toContain('1?: number;');
      // Should NOT have named keys
      expect(result).not.toContain('lat');
      expect(result).not.toContain('lng');
    });

    test('should generate input type with optional element', () => {
      const t = tuple('MaybePoint', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);

      const result = generateTupleInputInterface(t);
      expect(result).toContain('number | null');
    });

    test('should use ObjectInput for object-typed elements in input', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] } }),
      ]);

      const result = generateTupleInputInterface(t);
      expect(result).toContain('AddressInput');
    });

    test('should use TupleInput for nested tuple elements in input', () => {
      const t = tuple('Nested', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: { tupleName: 'Inner', elements: [] } }),
      ]);

      const result = generateTupleInputInterface(t);
      expect(result).toContain('InnerInput');
    });

    test('should generate mixed named/unnamed input', () => {
      const t = tuple('Entry', [elem({ index: 0, type: 'string', name: 'label' }), elem({ index: 1, type: 'int' })]);

      const result = generateTupleInputInterface(t);
      // Should have named key for first element
      expect(result).toContain('label?: string;');
      expect(result).toContain('0?: string;');
      // Second element: index only
      expect(result).toContain('1?: number;');
    });
  });

  describe('generateTupleInterfaces', () => {
    test('should generate both output and input for multiple tuples', () => {
      const tuples = [
        tuple('Coordinate', [
          elem({ index: 0, type: 'float', name: 'lat' }),
          elem({ index: 1, type: 'float', name: 'lng' }),
        ]),
        tuple('Range', [elem({ index: 0, type: 'int', name: 'min' }), elem({ index: 1, type: 'int', name: 'max' })]),
      ];

      const result = generateTupleInterfaces(tuples);

      expect(result).toContain('export type Coordinate =');
      expect(result).toContain('export type CoordinateInput =');
      expect(result).toContain('export type Range =');
      expect(result).toContain('export type RangeInput =');
    });

    test('should return empty string for empty array', () => {
      const result = generateTupleInterfaces([]);
      expect(result).toBe('');
    });

    test('should generate single tuple interfaces', () => {
      const tuples = [tuple('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })])];

      const result = generateTupleInterfaces(tuples);
      expect(result).toContain('export type Point =');
      expect(result).toContain('export type PointInput =');
    });
  });

  describe('tupleHasNamedElements', () => {
    test('should return true for tuple with named elements', () => {
      const t = tuple('Coordinate', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng' }),
      ]);

      expect(tupleHasNamedElements(t)).toBe(true);
    });

    test('should return false for tuple with unnamed elements', () => {
      const t = tuple('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      expect(tupleHasNamedElements(t)).toBe(false);
    });

    test('should return true for mixed named/unnamed', () => {
      const t = tuple('Entry', [elem({ index: 0, type: 'string', name: 'label' }), elem({ index: 1, type: 'int' })]);

      expect(tupleHasNamedElements(t)).toBe(true);
    });
  });

  describe('tupleHasObjectElements', () => {
    test('should return true for tuple with object element', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] } }),
      ]);

      expect(tupleHasObjectElements(t)).toBe(true);
    });

    test('should return false for tuple with no object elements', () => {
      const t = tuple('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      expect(tupleHasObjectElements(t)).toBe(false);
    });

    test('should return false for tuple with only nested tuple', () => {
      const t = tuple('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: { tupleName: 'Inner', elements: [] } }),
      ]);

      expect(tupleHasObjectElements(t)).toBe(false);
    });
  });

  describe('tupleHasTupleElements', () => {
    test('should return true for tuple with nested tuple', () => {
      const t = tuple('Nested', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: { tupleName: 'Inner', elements: [] } }),
      ]);

      expect(tupleHasTupleElements(t)).toBe(true);
    });

    test('should return false for tuple without nested tuples', () => {
      const t = tuple('Simple', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      expect(tupleHasTupleElements(t)).toBe(false);
    });

    test('should return false for tuple with object but not nested tuple', () => {
      const t = tuple('WithObj', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] } }),
      ]);

      expect(tupleHasTupleElements(t)).toBe(false);
    });
  });
});
