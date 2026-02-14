/**
 * Unit Tests: Tuple Derived Type Generator
 *
 * Tests that derived types (Update, OrderBy, Select, Create) properly handle
 * tuple fields: Update has full-replace/push/set, OrderBy skips tuples,
 * Select uses boolean-only, Create uses standard optional logic.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateUpdateType,
  generateOrderByType,
  generateSelectType,
  generateCreateType,
} from '../../../src/generators/types/derived-generator';
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

const entryInfo = tupleInfo('Entry', [
  elem({ index: 0, type: 'string', name: 'label' }),
  elem({ index: 1, type: 'int' }),
]);

function mdl(name: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields };
}

describe('Tuple Derived Type Generator', () => {
  describe('generateUpdateType', () => {
    test('should generate array-form | TupleUpdate type for single required tuple', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateUpdateType(m);

      expect(result).toContain('location?: [number, number] | CoordinateUpdate');
    });

    test('should generate array-form | TupleUpdate | CerialNone for single optional tuple', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'backup', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
      ]);

      const result = generateUpdateType(m);

      expect(result).toContain('backup?: [number, number] | CoordinateUpdate | CerialNone');
    });

    test('should generate push/set operations for array tuple', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
      ]);

      const result = generateUpdateType(m);

      expect(result).toContain('history?:');
      expect(result).toContain('CoordinateInput[]');
      expect(result).toContain('push?:');
      expect(result).toContain('set?:');
    });

    test('should not include updateWhere for array tuple (unlike objects)', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
      ]);

      const result = generateUpdateType(m);

      expect(result).not.toContain('updateWhere');
      expect(result).not.toContain('unset');
    });

    test('should exclude readonly tuple from update type special fields', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'origin', type: 'tuple', isRequired: true, isReadonly: true, tupleInfo: coordInfo }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateUpdateType(m);

      // readonly tuple should be in the Omit list (excluded from Partial)
      expect(result).toContain("'origin'");
      // non-readonly tuple should be in the intersection as a special field
      expect(result).toContain('location?: [number, number] | CoordinateUpdate');
      // readonly tuple should NOT appear as a settable special field
      expect(result).not.toContain('origin?:');
    });

    test('should handle multiple tuple fields with different types', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
        field({ name: 'entry', type: 'tuple', isRequired: true, tupleInfo: entryInfo }),
      ]);

      const result = generateUpdateType(m);

      expect(result).toContain('location?: [number, number] | CoordinateUpdate');
      expect(result).toContain('entry?: [string, number] | EntryUpdate');
    });

    test('should include tuple alongside primitive fields in update', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateUpdateType(m);

      // Tuple is omitted from base Partial and added as special field
      expect(result).toContain("'location'");
      expect(result).toContain('location?: [number, number] | CoordinateUpdate');
      // Primitive 'name' is part of Partial<UserInput> (implicitly included via Omit)
      expect(result).toContain('Partial<');
    });
  });

  describe('generateOrderByType', () => {
    test('should skip tuple field in orderby', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateOrderByType(m);

      expect(result).not.toContain('location');
      expect(result).toContain('name');
    });

    test('should skip array tuple field in orderby', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
      ]);

      const result = generateOrderByType(m);

      expect(result).not.toContain('history');
    });

    test('should still include primitive fields when tuple is present', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'age', type: 'int', isRequired: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateOrderByType(m);

      expect(result).toContain('name');
      expect(result).toContain('age');
      expect(result).not.toContain('location');
    });
  });

  describe('generateSelectType', () => {
    test('should generate boolean type for tuple field in select', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateSelectType(m);

      expect(result).toContain('location');
      expect(result).toContain('boolean');
    });

    test('should not generate tuple-specific select type (no per-position)', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateSelectType(m);

      // Should not have CoordinateSelect or similar
      expect(result).not.toContain('CoordinateSelect');
    });

    test('should include tuple alongside other fields in select', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateSelectType(m);

      expect(result).toContain('name');
      expect(result).toContain('location');
    });
  });

  describe('generateCreateType', () => {
    test('should reference base UserInput for required tuple field in create', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
      ]);

      const result = generateCreateType(m);

      // Required tuple is part of UserInput, referenced via the base type
      expect(result).toContain('UserInput');
      expect(result).toContain('UserCreate');
    });

    test('should make id optional in create (tuple model)', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'backup', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
      ]);

      const result = generateCreateType(m);

      // Create type makes id optional
      expect(result).toContain("'id'");
    });

    test('should make tuple with default optional in create', () => {
      const m = mdl('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({
          name: 'location',
          type: 'tuple',
          isRequired: true,
          tupleInfo: coordInfo,
          defaultValue: '[0, 0]',
        }),
      ]);

      const result = generateCreateType(m);

      // location should be in the Optional list due to @default
      expect(result).toContain("'location'");
    });
  });
});
