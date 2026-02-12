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
  generateComputedClause,
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

    test('should map object to object', () => {
      expect(mapToSurrealType('object')).toBe('object');
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

    test('should generate TYPE object for required object field', () => {
      expect(generateTypeClause('object', true)).toBe('TYPE object');
    });

    test('should generate TYPE option<object> for optional object field (no null)', () => {
      expect(generateTypeClause('object', false)).toBe('TYPE option<object>');
    });

    test('should generate TYPE array<object> for array of objects', () => {
      const field: FieldMetadata = {
        name: 'locations',
        type: 'object',
        isRequired: true,
        isId: false,
        isUnique: false,
        isArray: true,
      };

      expect(generateTypeClause('object', true, field)).toBe('TYPE array<object>');
    });

    test('should generate TYPE record<table> for Record with target', () => {
      const field: FieldMetadata = {
        name: 'authorId',
        type: 'record',
        isRequired: true,
        isId: false,
        isUnique: false,
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
    test('should generate DEFAULT time::now() for @createdAt', () => {
      expect(generateDefaultClause('createdAt')).toBe('DEFAULT time::now()');
    });

    test('should generate DEFAULT for string value', () => {
      expect(generateDefaultClause(undefined, 'hello')).toBe("DEFAULT 'hello'");
    });

    test('should generate DEFAULT for boolean value', () => {
      expect(generateDefaultClause(undefined, true)).toBe('DEFAULT true');
      expect(generateDefaultClause(undefined, false)).toBe('DEFAULT false');
    });

    test('should generate DEFAULT for number value', () => {
      expect(generateDefaultClause(undefined, 42)).toBe('DEFAULT 42');
      expect(generateDefaultClause(undefined, 3.14)).toBe('DEFAULT 3.14');
    });

    test('should return undefined when no default', () => {
      expect(generateDefaultClause(undefined)).toBeUndefined();
      expect(generateDefaultClause(undefined, undefined)).toBeUndefined();
    });

    test('should generate DEFAULT ALWAYS time::now() for @updatedAt', () => {
      expect(generateDefaultClause('updatedAt')).toBe('DEFAULT ALWAYS time::now()');
    });

    test('should return undefined for @now (COMPUTED, not DEFAULT)', () => {
      expect(generateDefaultClause('now')).toBeUndefined();
    });

    test('should prefer @createdAt over defaultValue when both provided', () => {
      // timestampDecorator takes precedence
      expect(generateDefaultClause('createdAt', 'some-value')).toBe('DEFAULT time::now()');
    });

    test('should prefer @updatedAt over defaultValue when both provided', () => {
      expect(generateDefaultClause('updatedAt', 'some-value')).toBe('DEFAULT ALWAYS time::now()');
    });

    test('should generate DEFAULT ALWAYS for @defaultAlways with string value', () => {
      expect(generateDefaultClause(undefined, undefined, 'dirty')).toBe("DEFAULT ALWAYS 'dirty'");
    });

    test('should generate DEFAULT ALWAYS for @defaultAlways with boolean value', () => {
      expect(generateDefaultClause(undefined, undefined, false)).toBe('DEFAULT ALWAYS false');
      expect(generateDefaultClause(undefined, undefined, true)).toBe('DEFAULT ALWAYS true');
    });

    test('should generate DEFAULT ALWAYS for @defaultAlways with integer value', () => {
      expect(generateDefaultClause(undefined, undefined, 0)).toBe('DEFAULT ALWAYS 0');
      expect(generateDefaultClause(undefined, undefined, 42)).toBe('DEFAULT ALWAYS 42');
    });

    test('should generate DEFAULT ALWAYS for @defaultAlways with float value', () => {
      expect(generateDefaultClause(undefined, undefined, 1.5)).toBe('DEFAULT ALWAYS 1.5');
    });

    test('should generate DEFAULT ALWAYS for @defaultAlways with null value', () => {
      expect(generateDefaultClause(undefined, undefined, null)).toBe('DEFAULT ALWAYS null');
    });

    test('should prefer timestamp decorator over defaultAlwaysValue when both present', () => {
      // timestampDecorator always takes precedence
      expect(generateDefaultClause('createdAt', undefined, 'ignored')).toBe('DEFAULT time::now()');
      expect(generateDefaultClause('updatedAt', undefined, 'ignored')).toBe('DEFAULT ALWAYS time::now()');
    });
  });

  describe('generateComputedClause', () => {
    test('should generate COMPUTED time::now() for @now', () => {
      expect(generateComputedClause('now')).toBe('COMPUTED time::now()');
    });

    test('should return undefined for @createdAt', () => {
      expect(generateComputedClause('createdAt')).toBeUndefined();
    });

    test('should return undefined for @updatedAt', () => {
      expect(generateComputedClause('updatedAt')).toBeUndefined();
    });

    test('should return undefined for undefined', () => {
      expect(generateComputedClause(undefined)).toBeUndefined();
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

        isArray: true,
        isDistinct: true, // Even with decorators, should be undefined
      };

      expect(generateValueClause(field)).toBeUndefined();
    });
  });
});
