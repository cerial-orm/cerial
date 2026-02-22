/**
 * Unit Tests: Tuple Where Generator
 *
 * Tests Where type generation for tuple definitions:
 * index-based keys, named keys, nested tuple/object where types.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateTupleWhereInterface,
  generateTupleWhereTypes,
} from '../../../src/generators/types/tuples/where-generator';
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

describe('Tuple Where Generator', () => {
  describe('generateTupleWhereInterface', () => {
    test('should generate where interface for named float tuple', () => {
      const t = tuple('Coordinate', [
        elem({ index: 0, type: 'float', name: 'lat' }),
        elem({ index: 1, type: 'float', name: 'lng' }),
      ]);

      const result = generateTupleWhereInterface(t);

      expect(result).toContain('export interface CoordinateWhere {');
      // Index-based keys
      expect(result).toContain('0?:');
      expect(result).toContain('1?:');
      // Named keys
      expect(result).toContain('lat?:');
      expect(result).toContain('lng?:');
    });

    test('should generate where interface for unnamed float tuple', () => {
      const t = tuple('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      const result = generateTupleWhereInterface(t);

      expect(result).toContain('export interface PointWhere {');
      expect(result).toContain('0?:');
      expect(result).toContain('1?:');
      // No named keys
      expect(result).not.toContain('lat');
      expect(result).not.toContain('lng');
    });

    test('should generate numeric operators for float elements', () => {
      const t = tuple('Point', [elem({ index: 0, type: 'float' })]);

      const result = generateTupleWhereInterface(t);
      // Numeric type should include operator object or number shorthand
      expect(result).toContain('0?:');
    });

    test('should generate string operators for string elements', () => {
      const t = tuple('NameTag', [elem({ index: 0, type: 'string', name: 'label' })]);

      const result = generateTupleWhereInterface(t);
      expect(result).toContain('label?:');
      expect(result).toContain('0?:');
    });

    test('should generate where type for mixed types', () => {
      const t = tuple('Entry', [
        elem({ index: 0, type: 'string', name: 'label' }),
        elem({ index: 1, type: 'int' }),
        elem({ index: 2, type: 'bool' }),
      ]);

      const result = generateTupleWhereInterface(t);
      expect(result).toContain('export interface EntryWhere {');
      expect(result).toContain('label?:');
      expect(result).toContain('0?:');
      expect(result).toContain('1?:');
      expect(result).toContain('2?:');
    });

    test('should reference object Where type for object elements', () => {
      const t = tuple('Located', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] }, name: 'addr' }),
      ]);

      const result = generateTupleWhereInterface(t);
      expect(result).toContain('AddressWhere');
    });

    test('should reference tuple Where type for nested tuple elements', () => {
      const t = tuple('Nested', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: { tupleName: 'Inner', elements: [] }, name: 'coords' }),
      ]);

      const result = generateTupleWhereInterface(t);
      expect(result).toContain('InnerWhere');
    });

    test('should handle optional elements in where', () => {
      const t = tuple('MaybePoint', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);

      const result = generateTupleWhereInterface(t);
      expect(result).toContain('0?:');
      expect(result).toContain('1?:');
    });

    test('should handle single-element tuple', () => {
      const t = tuple('Single', [elem({ index: 0, type: 'string' })]);

      const result = generateTupleWhereInterface(t);
      expect(result).toContain('export interface SingleWhere {');
      expect(result).toContain('0?:');
    });

    test('should generate both index and name for named object element', () => {
      const t = tuple('WithObj', [
        elem({ index: 0, type: 'object', objectInfo: { objectName: 'Addr', fields: [] }, name: 'addr' }),
      ]);

      const result = generateTupleWhereInterface(t);
      expect(result).toContain('0?: AddrWhere;');
      expect(result).toContain('addr?: AddrWhere;');
    });
  });

  describe('generateTupleWhereTypes', () => {
    test('should generate where types for multiple tuples', () => {
      const tuples = [
        tuple('Coordinate', [
          elem({ index: 0, type: 'float', name: 'lat' }),
          elem({ index: 1, type: 'float', name: 'lng' }),
        ]),
        tuple('Range', [elem({ index: 0, type: 'int', name: 'min' }), elem({ index: 1, type: 'int', name: 'max' })]),
      ];

      const result = generateTupleWhereTypes(tuples);

      expect(result).toContain('export interface CoordinateWhere {');
      expect(result).toContain('export interface RangeWhere {');
    });

    test('should return empty string for empty array', () => {
      const result = generateTupleWhereTypes([]);
      expect(result).toBe('');
    });

    test('should generate single where type', () => {
      const tuples = [tuple('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })])];

      const result = generateTupleWhereTypes(tuples);
      expect(result).toContain('export interface PointWhere {');
    });
  });
});
