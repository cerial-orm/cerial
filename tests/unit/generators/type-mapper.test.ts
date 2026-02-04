/**
 * Unit Tests: Type Mapper
 *
 * Tests mapping of schema types to SurrealQL types.
 */

import { describe, expect, test } from 'bun:test';
import {
  mapToSurrealType,
  getTypeAssertion,
  hasTypeAssertion,
  generateTypeClause,
  generateAssertClause,
  generateDefaultClause,
  generateValueClause,
} from '../../../src/generators/migrations/type-mapper';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';

describe('Type Mapper', () => {
  describe('mapToSurrealType', () => {
    test('should map string to string', () => {
      expect(mapToSurrealType('string')).toBe('string');
    });

    test('should map email to string', () => {
      expect(mapToSurrealType('email')).toBe('string');
    });

    test('should map int to int', () => {
      expect(mapToSurrealType('int')).toBe('int');
    });

    test('should map float to float', () => {
      expect(mapToSurrealType('float')).toBe('float');
    });

    test('should map bool to bool', () => {
      expect(mapToSurrealType('bool')).toBe('bool');
    });

    test('should map date to datetime', () => {
      expect(mapToSurrealType('date')).toBe('datetime');
    });

    test('should map record to record', () => {
      expect(mapToSurrealType('record')).toBe('record');
    });
  });

  describe('getTypeAssertion', () => {
    test('should return assertion for email type', () => {
      expect(getTypeAssertion('email')).toBe('string::is_email($value)');
    });

    test('should return undefined for string type', () => {
      expect(getTypeAssertion('string')).toBeUndefined();
    });

    test('should return undefined for int type', () => {
      expect(getTypeAssertion('int')).toBeUndefined();
    });
  });

  describe('hasTypeAssertion', () => {
    test('should return true for email', () => {
      expect(hasTypeAssertion('email')).toBe(true);
    });

    test('should return false for string', () => {
      expect(hasTypeAssertion('string')).toBe(false);
    });
  });

  describe('generateTypeClause', () => {
    test('should generate TYPE string for required string field', () => {
      expect(generateTypeClause('string', true)).toBe('TYPE string');
    });

    test('should generate TYPE option<string | null> for optional string field', () => {
      // option<T | null> allows both NONE (absent) and null (explicit null value)
      expect(generateTypeClause('string', false)).toBe('TYPE option<string | null>');
    });

    test('should generate TYPE int for required int field', () => {
      expect(generateTypeClause('int', true)).toBe('TYPE int');
    });

    test('should generate TYPE datetime for date field', () => {
      expect(generateTypeClause('date', true)).toBe('TYPE datetime');
    });

    test('should generate TYPE record<table> for Record with target', () => {
      const field: FieldMetadata = {
        name: 'authorId',
        type: 'record',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
      };

      const model: ModelMetadata = {
        name: 'Post',
        tableName: 'post',
        fields: [
          field,
          {
            name: 'author',
            type: 'relation',
            isRequired: true,
            isId: false,
            isUnique: false,
            hasNowDefault: false,
            relationInfo: {
              targetModel: 'User',
              targetTable: 'user',
              fieldRef: 'authorId',
              isReverse: false,
            },
          },
        ],
      };

      expect(generateTypeClause('record', true, field, model)).toBe('TYPE record<user>');
    });

    test('should generate TYPE array<record<table>> for Record[]', () => {
      const field: FieldMetadata = {
        name: 'tagIds',
        type: 'record',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
      };

      const model: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          field,
          {
            name: 'tags',
            type: 'relation',
            isRequired: false,
            isId: false,
            isUnique: false,
            hasNowDefault: false,
            isArray: true,
            relationInfo: {
              targetModel: 'Tag',
              targetTable: 'tag',
              fieldRef: 'tagIds',
              isReverse: false,
            },
          },
        ],
      };

      expect(generateTypeClause('record', true, field, model)).toBe('TYPE array<record<tag>>');
    });

    test('should generate TYPE array<string> for String[] field', () => {
      const field: FieldMetadata = {
        name: 'items',
        type: 'string',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
      };

      expect(generateTypeClause('string', true, field)).toBe('TYPE array<string>');
    });
  });

  describe('generateAssertClause', () => {
    test('should generate ASSERT for email', () => {
      expect(generateAssertClause('email')).toBe('ASSERT string::is_email($value)');
    });

    test('should return undefined for string', () => {
      expect(generateAssertClause('string')).toBeUndefined();
    });
  });

  describe('generateDefaultClause', () => {
    test('should generate DEFAULT time::now() for @now', () => {
      expect(generateDefaultClause(true)).toBe('DEFAULT time::now()');
    });

    test('should generate DEFAULT for string value', () => {
      expect(generateDefaultClause(false, 'hello')).toBe("DEFAULT 'hello'");
    });

    test('should generate DEFAULT for boolean value', () => {
      expect(generateDefaultClause(false, true)).toBe('DEFAULT true');
      expect(generateDefaultClause(false, false)).toBe('DEFAULT false');
    });

    test('should generate DEFAULT for number value', () => {
      expect(generateDefaultClause(false, 42)).toBe('DEFAULT 42');
      expect(generateDefaultClause(false, 3.14)).toBe('DEFAULT 3.14');
    });

    test('should return undefined when no default', () => {
      expect(generateDefaultClause(false)).toBeUndefined();
      expect(generateDefaultClause(false, undefined)).toBeUndefined();
    });
  });

  describe('generateValueClause', () => {
    test('should generate VALUE with NONE handling for Record[] paired with Relation', () => {
      const field: FieldMetadata = {
        name: 'tagIds',
        type: 'record',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
      };

      // Model with paired Relation
      const model: ModelMetadata = {
        name: 'Post',
        tableName: 'post',
        fields: [
          field,
          {
            name: 'tags',
            type: 'relation',
            isRequired: true,
            isId: false,
            isUnique: false,
            hasNowDefault: false,
            isArray: true,
            relationInfo: {
              targetModel: 'Tag',
              targetTable: 'tag',
              fieldRef: 'tagIds',
              isReverse: false,
            },
          },
        ],
      };

      // Uses IF/THEN/ELSE to handle NONE values and avoid "no such method found for none type" error
      expect(generateValueClause(field, model)).toBe('VALUE IF $value THEN $value.distinct() ELSE [] END');
    });

    test('should return undefined for Record[] without paired Relation and no decorators', () => {
      const field: FieldMetadata = {
        name: 'standaloneIds',
        type: 'record',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
      };

      // Model without paired Relation
      const model: ModelMetadata = {
        name: 'Post',
        tableName: 'post',
        fields: [field],
      };

      expect(generateValueClause(field, model)).toBeUndefined();
    });

    test('should return undefined for non-array Record', () => {
      const field: FieldMetadata = {
        name: 'authorId',
        type: 'record',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
      };

      expect(generateValueClause(field)).toBeUndefined();
    });

    test('should return undefined for non-Record array without decorators', () => {
      const field: FieldMetadata = {
        name: 'items',
        type: 'string',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
      };

      expect(generateValueClause(field)).toBeUndefined();
    });

    test('should generate VALUE with distinct() for @distinct decorator', () => {
      const field: FieldMetadata = {
        name: 'tags',
        type: 'string',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
        isDistinct: true,
      };

      expect(generateValueClause(field)).toBe('VALUE IF $value THEN $value.distinct() ELSE [] END');
    });

    test('should generate VALUE with sort(true) for @sort decorator (ascending)', () => {
      const field: FieldMetadata = {
        name: 'scores',
        type: 'int',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
        sortOrder: 'asc',
      };

      expect(generateValueClause(field)).toBe('VALUE IF $value THEN $value.sort(true) ELSE [] END');
    });

    test('should generate VALUE with sort(false) for @sort(false) decorator (descending)', () => {
      const field: FieldMetadata = {
        name: 'recentDates',
        type: 'date',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
        sortOrder: 'desc',
      };

      expect(generateValueClause(field)).toBe('VALUE IF $value THEN $value.sort(false) ELSE [] END');
    });

    test('should generate VALUE with distinct() and sort(true) for @distinct @sort combined', () => {
      const field: FieldMetadata = {
        name: 'categories',
        type: 'string',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
        isDistinct: true,
        sortOrder: 'asc',
      };

      expect(generateValueClause(field)).toBe('VALUE IF $value THEN $value.distinct().sort(true) ELSE [] END');
    });

    test('should generate VALUE with distinct() and sort(false) for @distinct @sort(false) combined', () => {
      const field: FieldMetadata = {
        name: 'categories',
        type: 'string',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
        isDistinct: true,
        sortOrder: 'desc',
      };

      expect(generateValueClause(field)).toBe('VALUE IF $value THEN $value.distinct().sort(false) ELSE [] END');
    });

    test('should generate VALUE with distinct() for standalone Record[] with @distinct', () => {
      const field: FieldMetadata = {
        name: 'standaloneIds',
        type: 'record',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
        isDistinct: true,
      };

      // Model without paired Relation
      const model: ModelMetadata = {
        name: 'Post',
        tableName: 'post',
        fields: [field],
      };

      expect(generateValueClause(field, model)).toBe('VALUE IF $value THEN $value.distinct() ELSE [] END');
    });

    test('should return undefined for Relation[] (virtual field)', () => {
      const field: FieldMetadata = {
        name: 'posts',
        type: 'relation',
        isRequired: true,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isArray: true,
        isDistinct: true, // Even with decorators, should be undefined
      };

      expect(generateValueClause(field)).toBeUndefined();
    });
  });
});
