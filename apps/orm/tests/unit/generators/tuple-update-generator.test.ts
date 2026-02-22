/**
 * Unit Tests: Tuple Update Type Generator
 *
 * Tests generation of TupleUpdate types for per-element updates.
 * Covers primitive, optional, nullable, object, and nested tuple elements.
 */

import { describe, expect, test } from 'bun:test';
import { generateTupleUpdateType } from '../../../src/generators/types/tuples/update-generator';
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

describe('Tuple Update Type Generator', () => {
  describe('generateTupleUpdateType', () => {
    test('should generate update type with named primitive elements', () => {
      const t = tuple('Coordinate', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng' }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('export type CoordinateUpdate');
      expect(result).toContain('0?: number');
      expect(result).toContain('lat?: number');
      expect(result).toContain('1?: number');
      expect(result).toContain('lng?: number');
    });

    test('should generate update type with unnamed elements (index only)', () => {
      const t = tuple('Pair', [elem({ index: 0, type: 'string' }), elem({ index: 1, type: 'int' })]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('export type PairUpdate');
      expect(result).toContain('0?: string');
      expect(result).toContain('1?: number');
    });

    test('should add CerialNone union for optional elements', () => {
      const t = tuple('MaybeCoord', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng', isOptional: true }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('0?: number');
      expect(result).toContain('lat?: number');
      // Optional element gets CerialNone union
      expect(result).toContain('1?: number | CerialNone');
      expect(result).toContain('lng?: number | CerialNone');
      // Non-optional element does NOT get CerialNone
      expect(result).not.toContain('0?: number | CerialNone');
    });

    test('should add null union for nullable elements', () => {
      const t = tuple('NullableCoord', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng', isNullable: true }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('1?: number | null');
      expect(result).toContain('lng?: number | null');
    });

    test('should add both CerialNone and null for optional + nullable elements', () => {
      const t = tuple('MaybeNullCoord', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true, isNullable: true }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('1?: number | null | CerialNone');
    });

    test('should generate Partial<ObjectInput> | { set: ObjectInput } for object elements', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string', name: 'tag' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: { objectName: 'TupleAddress', fields: addrFields },
        }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('0?: string');
      expect(result).toContain('tag?: string');
      expect(result).toContain('1?: Partial<TupleAddressInput> | { set: TupleAddressInput }');
    });

    test('should generate array-form | TupleUpdate for nested tuple elements (no wrapper)', () => {
      const t = tuple('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'tuple',
          tupleInfo: { tupleName: 'Inner', elements: [elem({ index: 0, type: 'int' })] },
        }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('1?: [number] | InnerUpdate');
    });

    test('should handle single-element tuple', () => {
      const t = tuple('Single', [elem({ index: 0, type: 'string', name: 'value' })]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('export type SingleUpdate');
      expect(result).toContain('0?: string');
      expect(result).toContain('value?: string');
    });

    test('should handle mixed types (primitive, object, nested tuple)', () => {
      const t = tuple('Complex', [
        elem({ index: 0, type: 'string', name: 'label' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: { objectName: 'Addr', fields: addrFields },
        }),
        elem({
          index: 2,
          type: 'tuple',
          tupleInfo: { tupleName: 'Coord', elements: [elem({ index: 0, type: 'float' })] },
        }),
        elem({ index: 3, type: 'bool' }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('0?: string');
      expect(result).toContain('label?: string');
      expect(result).toContain('1?: Partial<AddrInput> | { set: AddrInput }');
      expect(result).toContain('2?: [number] | CoordUpdate');
      expect(result).toContain('3?: boolean');
    });

    test('should handle boolean type correctly', () => {
      const t = tuple('Flags', [
        elem({ index: 0, type: 'bool', name: 'active' }),
        elem({ index: 1, type: 'bool', name: 'verified' }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('0?: boolean');
      expect(result).toContain('active?: boolean');
      expect(result).toContain('1?: boolean');
      expect(result).toContain('verified?: boolean');
    });

    test('should handle date type correctly', () => {
      const t = tuple('TimeRange', [
        elem({ index: 0, type: 'date', name: 'start' }),
        elem({ index: 1, type: 'date', name: 'end' }),
      ]);

      const result = generateTupleUpdateType(t);

      expect(result).toContain('0?: Date');
      expect(result).toContain('start?: Date');
    });
  });
});
