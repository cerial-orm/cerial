/**
 * Unit Tests: Tuple Where Validator
 *
 * Tests that tuple fields are properly skipped/handled
 * by the where validator (validation deferred to condition-builder).
 */

import { describe, expect, test } from 'bun:test';
import { validateWhereClause, validateWhere } from '../../../src/query/validators/where-validator';
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

const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

const userModel: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'name', type: 'string', isRequired: true }),
    field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
    field({ name: 'backup', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
    field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
  ],
};

describe('Tuple Where Validator', () => {
  describe('validateWhereClause', () => {
    test('should return no errors for tuple field with named key filter', () => {
      const errors = validateWhereClause({ location: { lat: { gt: 35 } } }, userModel);

      expect(errors).toEqual([]);
    });

    test('should return no errors for tuple field with index key filter', () => {
      const errors = validateWhereClause({ location: { '0': { gt: 35 } } }, userModel);

      expect(errors).toEqual([]);
    });

    test('should return no errors for tuple field with equality filter', () => {
      const errors = validateWhereClause({ location: { lat: 40.7 } }, userModel);

      expect(errors).toEqual([]);
    });

    test('should return no errors for optional tuple filter', () => {
      const errors = validateWhereClause({ backup: { lat: { eq: 1 } } }, userModel);

      expect(errors).toEqual([]);
    });

    test('should return no errors for array tuple with quantifier', () => {
      const errors = validateWhereClause({ history: { some: { lat: { gt: 0 } } } }, userModel);

      expect(errors).toEqual([]);
    });

    test('should return no errors for mixed tuple and primitive filters', () => {
      const errors = validateWhereClause({ name: 'Alice', location: { lat: 40 } }, userModel);

      expect(errors).toEqual([]);
    });

    test('should return no errors for complex nested tuple filter', () => {
      const errors = validateWhereClause(
        { location: { lat: { gt: 30, lt: 50 }, lng: { gte: -180, lte: 180 } } },
        userModel,
      );

      expect(errors).toEqual([]);
    });

    test('should return no errors for empty tuple filter object', () => {
      const errors = validateWhereClause({ location: {} }, userModel);

      expect(errors).toEqual([]);
    });
  });

  describe('validateWhere', () => {
    test('should return valid for tuple field where', () => {
      const result = validateWhere({ location: { lat: { gt: 35 } } }, userModel);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return valid for undefined where', () => {
      const result = validateWhere(undefined, userModel);

      expect(result.valid).toBe(true);
    });

    test('should return valid for where with only tuple fields', () => {
      const result = validateWhere({ location: { lat: 40 }, backup: { lng: { neq: 0 } } }, userModel);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should still validate primitive fields in same where clause', () => {
      const result = validateWhere({ name: 'Alice', location: { lat: 40 } }, userModel);

      expect(result.valid).toBe(true);
    });
  });
});
