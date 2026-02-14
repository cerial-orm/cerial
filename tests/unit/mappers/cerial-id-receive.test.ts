/**
 * Unit Tests: CerialId Receive Transformation
 *
 * Tests for transforming SurrealDB results to CerialId.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { mapFieldValue, mapRecord, transformRecordIdToCerialId } from '../../../src/query/mappers/result-mapper';
import type { ModelMetadata } from '../../../src/types';
import { CerialId } from '../../../src/utils/cerial-id';

// Helper to create a complete field metadata
function createField(overrides: Partial<ModelMetadata['fields'][0]>): ModelMetadata['fields'][0] {
  return {
    name: 'field',
    type: 'string',
    isId: false,
    isRequired: false,
    isArray: false,
    isUnique: false,
    ...overrides,
  } as ModelMetadata['fields'][0];
}

// Helper to create test model metadata
function createModelMetadata(fields: Array<Partial<ModelMetadata['fields'][0]>>): ModelMetadata {
  return {
    name: 'TestModel',
    tableName: 'test_model',
    fields: fields.map(createField),
  };
}

describe('CerialId Receive Transformation', () => {
  describe('transformRecordIdToCerialId', () => {
    test('converts RecordId to CerialId', () => {
      const recordId = new RecordId('user', 'abc123');
      const result = transformRecordIdToCerialId(recordId);
      expect(CerialId.is(result)).toBe(true);
      expect(result.table).toBe('user');
      expect(result.id).toBe('abc123');
    });

    test('preserves special characters in table name', () => {
      const recordId = new RecordId('test-table', 'abc');
      const result = transformRecordIdToCerialId(recordId);
      expect(result.table).toBe('test-table');
    });

    test('preserves special characters in id', () => {
      const recordId = new RecordId('user', 'my-id-with-dashes');
      const result = transformRecordIdToCerialId(recordId);
      expect(result.id).toBe('my-id-with-dashes');
    });
  });

  describe('mapFieldValue for record type', () => {
    test('converts RecordId to CerialId', () => {
      const recordId = new RecordId('user', 'abc123');
      const result = mapFieldValue(recordId, 'record');
      expect(CerialId.is(result)).toBe(true);
      expect((result as CerialId).table).toBe('user');
      expect((result as CerialId).id).toBe('abc123');
    });

    test('converts string to CerialId', () => {
      const result = mapFieldValue('user:abc123', 'record');
      expect(CerialId.is(result)).toBe(true);
      expect((result as CerialId).table).toBe('user');
      expect((result as CerialId).id).toBe('abc123');
    });

    test('returns null for null value', () => {
      const result = mapFieldValue(null, 'record');
      expect(result).toBeNull();
    });

    test('returns undefined for undefined value', () => {
      const result = mapFieldValue(undefined, 'record');
      expect(result).toBeUndefined();
    });
  });

  describe('mapRecord', () => {
    test('converts id field to CerialId', () => {
      const model = createModelMetadata([{ name: 'id', type: 'record', isId: true, isRequired: true, isArray: false }]);

      const dbRecord = {
        id: new RecordId('test_model', 'abc123'),
        name: 'Test',
      };

      const result = mapRecord(dbRecord, model);
      expect(CerialId.is(result.id)).toBe(true);
      expect((result.id as CerialId).table).toBe('test_model');
      expect((result.id as CerialId).id).toBe('abc123');
    });

    test('converts string id to CerialId', () => {
      const model = createModelMetadata([{ name: 'id', type: 'record', isId: true, isRequired: true, isArray: false }]);

      const dbRecord = {
        id: 'test_model:abc123',
        name: 'Test',
      };

      const result = mapRecord(dbRecord, model);
      expect(CerialId.is(result.id)).toBe(true);
      expect((result.id as CerialId).id).toBe('abc123');
    });

    test('converts Record field to CerialId', () => {
      const model = createModelMetadata([
        { name: 'id', type: 'record', isId: true, isRequired: true, isArray: false },
        { name: 'userId', type: 'record', isRequired: false, isArray: false },
      ]);

      const dbRecord = {
        id: new RecordId('test_model', 'abc'),
        userId: new RecordId('user', 'user123'),
      };

      const result = mapRecord(dbRecord, model);
      expect(CerialId.is(result.userId)).toBe(true);
      expect((result.userId as CerialId).table).toBe('user');
      expect((result.userId as CerialId).id).toBe('user123');
    });

    test('leaves optional Record fields undefined when missing (non-@nullable)', () => {
      const model = createModelMetadata([
        { name: 'id', type: 'record', isId: true, isRequired: true, isArray: false },
        { name: 'userId', type: 'record', isRequired: false, isArray: false },
      ]);

      const dbRecord = {
        id: new RecordId('test_model', 'abc'),
        // userId is missing
      };

      const result = mapRecord(dbRecord, model);
      expect(result.userId).toBeUndefined();
    });

    test('sets @nullable optional Record fields to null when missing', () => {
      const model = createModelMetadata([
        { name: 'id', type: 'record', isId: true, isRequired: true, isArray: false },
        { name: 'userId', type: 'record', isRequired: false, isArray: false, isNullable: true },
      ]);

      const dbRecord = {
        id: new RecordId('test_model', 'abc'),
        // userId is missing — but @nullable → should be null
      };

      const result = mapRecord(dbRecord, model);
      expect(result.userId).toBeNull();
    });

    test('preserves null for @nullable Record field', () => {
      const model = createModelMetadata([
        { name: 'id', type: 'record', isId: true, isRequired: true, isArray: false },
        { name: 'userId', type: 'record', isRequired: false, isArray: false, isNullable: true },
      ]);

      const dbRecord = {
        id: new RecordId('test_model', 'abc'),
        userId: null,
      };

      const result = mapRecord(dbRecord, model);
      expect(result.userId).toBeNull();
    });

    test('converts Record[] array to CerialId[]', () => {
      const model = createModelMetadata([
        { name: 'id', type: 'record', isId: true, isRequired: true, isArray: false },
        { name: 'tagIds', type: 'record', isRequired: true, isArray: true },
      ]);

      const dbRecord = {
        id: new RecordId('test_model', 'abc'),
        tagIds: [new RecordId('tag', 'tag1'), new RecordId('tag', 'tag2'), new RecordId('tag', 'tag3')],
      };

      const result = mapRecord(dbRecord, model);
      expect(Array.isArray(result.tagIds)).toBe(true);
      expect((result.tagIds as CerialId[]).length).toBe(3);
      (result.tagIds as CerialId[]).forEach((id) => {
        expect(CerialId.is(id)).toBe(true);
        expect(id.table).toBe('tag');
      });
    });

    test('handles nested relation data (included records)', () => {
      const model = createModelMetadata([{ name: 'id', type: 'record', isId: true, isRequired: true, isArray: false }]);

      // Simulating included relation data (not in model schema)
      const dbRecord = {
        id: new RecordId('user', 'user1'),
        profile: {
          id: new RecordId('profile', 'profile1'),
          bio: 'Hello',
        },
      };

      const result = mapRecord(dbRecord, model);
      // Nested id should be converted to CerialId
      expect(CerialId.is((result.profile as Record<string, unknown>).id)).toBe(true);
      expect(((result.profile as Record<string, unknown>).id as CerialId).table).toBe('profile');
    });
  });

  describe('special character handling', () => {
    test('preserves table name with dash', () => {
      const recordId = new RecordId('test-table', 'abc');
      const result = transformRecordIdToCerialId(recordId);
      expect(result.table).toBe('test-table');
      // toString should properly escape
      expect(result.toString()).toBe('⟨test-table⟩:abc');
    });

    test('preserves UUID-style id', () => {
      const recordId = new RecordId('user', '550e8400-e29b-41d4-a716-446655440000');
      const result = transformRecordIdToCerialId(recordId);
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
