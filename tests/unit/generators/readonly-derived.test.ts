/**
 * Unit Tests: Readonly Derived Type Generator
 *
 * Tests that @readonly fields are excluded from Update types,
 * and @readonly PK Record fields exclude relations from UpdateInput.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateCreateType,
  generateUpdateInputType,
  generateUpdateType,
} from '../../../src/generators/types/derived-generator';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';

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

function model(name: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields };
}

describe('Readonly Derived Type Generator', () => {
  describe('generateUpdateType', () => {
    test('should exclude @readonly string field from Update type', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({ name: 'code', type: 'string', isReadonly: true }),
      ]);

      const result = generateUpdateType(m);
      expect(result).toContain("'id'");
      expect(result).toContain("'code'");
      expect(result).toContain('Partial');
      // 'name' should NOT be in the omit list
      expect(result).not.toContain("'name'");
    });

    test('should exclude @readonly optional field from Update type', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({ name: 'score', type: 'int', isRequired: false, isReadonly: true }),
      ]);

      const result = generateUpdateType(m);
      expect(result).toContain("'score'");
    });

    test('should include @readonly fields in Create type (not excluded)', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({ name: 'code', type: 'string', isReadonly: true }),
      ]);

      const result = generateCreateType(m);
      // 'code' should NOT be excluded from Create — only from Update
      expect(result).not.toContain("'code'");
    });

    test('should exclude @readonly Record field from Update type', () => {
      const m = model('Post', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'title', type: 'string' }),
        field({ name: 'authorId', type: 'record', isReadonly: true }),
      ]);

      const result = generateUpdateType(m);
      expect(result).toContain("'authorId'");
    });

    test('should exclude @readonly array field from Update special handling', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({ name: 'tags', type: 'string', isArray: true, isReadonly: true }),
      ]);

      const result = generateUpdateType(m);
      // @readonly array should be in excludeFields, not in special push/unset handling
      expect(result).toContain("'tags'");
      expect(result).not.toContain('push');
    });

    test('should exclude @readonly object field from Update special handling', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({
          name: 'config',
          type: 'object',
          isReadonly: true,
          objectInfo: { objectName: 'Config', fields: [field({ name: 'key', type: 'string' })] },
        }),
      ]);

      const result = generateUpdateType(m);
      // @readonly object should be excluded entirely
      expect(result).toContain("'config'");
      expect(result).not.toContain('set: Config');
    });

    test('should handle object with @readonly sub-fields in Update type (Omit in Partial)', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({
          name: 'address',
          type: 'object',
          objectInfo: {
            objectName: 'Address',
            fields: [
              field({ name: 'street', type: 'string' }),
              field({ name: 'city', type: 'string', isReadonly: true }),
            ],
          },
        }),
      ]);

      const result = generateUpdateType(m);
      // Should use Omit for readonly sub-fields inside Partial
      expect(result).toContain("Omit<AddressInput, 'city'>");
      expect(result).toContain('Partial');
    });

    test('should not add Omit when object has no @readonly sub-fields', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({
          name: 'address',
          type: 'object',
          objectInfo: {
            objectName: 'Address',
            fields: [field({ name: 'street', type: 'string' }), field({ name: 'city', type: 'string' })],
          },
        }),
      ]);

      const result = generateUpdateType(m);
      expect(result).toContain('Partial<AddressInput>');
      expect(result).not.toContain("Omit<AddressInput, 'city'>");
    });

    test('should exclude both @now and @readonly from Update type', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({ name: 'code', type: 'string', isReadonly: true }),
        field({ name: 'accessedAt', type: 'date', timestampDecorator: 'now' }),
      ]);

      const result = generateUpdateType(m);
      expect(result).toContain("'code'");
      expect(result).toContain("'accessedAt'");
    });
  });

  describe('generateUpdateInputType', () => {
    test('should exclude relation with @readonly PK Record from UpdateInput', () => {
      const m = model('Post', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'title', type: 'string' }),
        field({ name: 'authorId', type: 'record', isReadonly: true }),
        field({
          name: 'author',
          type: 'relation',
          relationInfo: {
            targetModel: 'User',
            targetTable: 'user',
            isReverse: false,
            fieldRef: 'authorId',
          },
        }),
      ]);

      const result = generateUpdateInputType(m);
      // Since the only relation has a @readonly PK, UpdateInput = Update (no nested ops)
      expect(result).toContain('UpdateInput = PostUpdate');
      expect(result).not.toContain('connect');
      expect(result).not.toContain('disconnect');
    });

    test('should keep relation with non-readonly PK Record in UpdateInput', () => {
      const m = model('Post', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'title', type: 'string' }),
        field({ name: 'authorId', type: 'record' }),
        field({
          name: 'author',
          type: 'relation',
          relationInfo: {
            targetModel: 'User',
            targetTable: 'user',
            isReverse: false,
            fieldRef: 'authorId',
          },
        }),
      ]);

      const result = generateUpdateInputType(m);
      expect(result).toContain('connect');
    });

    test('should exclude only @readonly relations, keep non-readonly ones', () => {
      const m = model('Post', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'title', type: 'string' }),
        field({ name: 'authorId', type: 'record', isReadonly: true }),
        field({
          name: 'author',
          type: 'relation',
          relationInfo: {
            targetModel: 'User',
            targetTable: 'user',
            isReverse: false,
            fieldRef: 'authorId',
          },
        }),
        field({ name: 'editorId', type: 'record' }),
        field({
          name: 'editor',
          type: 'relation',
          isRequired: false,
          relationInfo: {
            targetModel: 'User',
            targetTable: 'user',
            isReverse: false,
            fieldRef: 'editorId',
          },
        }),
      ]);

      const result = generateUpdateInputType(m);
      // editor (non-readonly) should still have nested ops
      expect(result).toContain('editor');
      expect(result).toContain('connect');
      // author (readonly PK) should NOT appear in nested ops
      expect(result).not.toContain('author?');
      // But authorId should not be in the Omit list for managedRecords (it's @readonly, already excluded from Update)
    });

    test('should keep reverse relations in UpdateInput even if forward has @readonly', () => {
      const m = model('User', [
        field({ name: 'id', type: 'record', isId: true }),
        field({ name: 'name', type: 'string' }),
        field({
          name: 'posts',
          type: 'relation',
          isArray: true,
          relationInfo: {
            targetModel: 'Post',
            targetTable: 'post',
            isReverse: true,
          },
        }),
      ]);

      const result = generateUpdateInputType(m);
      // Reverse relations don't have a PK Record, so they should still appear
      expect(result).toContain('posts');
    });
  });
});
