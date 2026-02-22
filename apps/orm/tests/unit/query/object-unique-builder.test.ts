/**
 * Unit Tests: Object @unique query builder support
 *
 * Tests detection and expansion of object @unique fields in findUnique/updateUnique/deleteUnique.
 */

import { describe, expect, test } from 'bun:test';
import {
  expandObjectUniqueKey,
  findObjectUniqueKey,
  validateUniqueField,
} from '../../../src/query/builders/select-builder';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';

// Helper to create field metadata
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

// Model with object containing @unique field
const locationFields: FieldMetadata[] = [
  field({ name: 'address', type: 'string' }),
  field({ name: 'zip', type: 'string', isUnique: true }),
  field({ name: 'country', type: 'string' }),
];

const modelWithObjectUnique: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [
    field({ name: 'id', type: 'record', isId: true, isUnique: true }),
    field({ name: 'name', type: 'string' }),
    field({
      name: 'location',
      type: 'object',
      objectInfo: { objectName: 'Location', fields: locationFields },
    }),
    field({
      name: 'altLocation',
      type: 'object',
      isRequired: false,
      objectInfo: { objectName: 'Location', fields: locationFields },
    }),
  ],
};

// Model with nested objects containing @unique
const innerFields: FieldMetadata[] = [field({ name: 'code', type: 'string', isUnique: true })];
const outerFields: FieldMetadata[] = [
  field({
    name: 'inner',
    type: 'object',
    objectInfo: { objectName: 'Inner', fields: innerFields },
  }),
];

const modelWithNestedObjectUnique: ModelMetadata = {
  name: 'Store',
  tableName: 'store',
  fields: [
    field({ name: 'id', type: 'record', isId: true, isUnique: true }),
    field({
      name: 'outer',
      type: 'object',
      objectInfo: { objectName: 'Outer', fields: outerFields },
    }),
  ],
};

// Model without object unique fields
const simpleModel: ModelMetadata = {
  name: 'Post',
  tableName: 'post',
  fields: [
    field({ name: 'id', type: 'record', isId: true, isUnique: true }),
    field({ name: 'title', type: 'string' }),
    field({ name: 'email', type: 'email', isUnique: true }),
  ],
};

describe('Object @unique query builder', () => {
  describe('findObjectUniqueKey', () => {
    test('should detect object with @unique subfield', () => {
      const where = { location: { zip: '10001' } };
      const result = findObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).not.toBeNull();
      expect(result!.fieldName).toBe('location');
      expect(result!.dotPaths).toEqual({ 'location.zip': '10001' });
    });

    test('should detect @unique in altLocation too', () => {
      const where = { altLocation: { zip: '20002' } };
      const result = findObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).not.toBeNull();
      expect(result!.fieldName).toBe('altLocation');
      expect(result!.dotPaths).toEqual({ 'altLocation.zip': '20002' });
    });

    test('should return null when no object unique key is present', () => {
      const where = { name: 'Alice' };
      const result = findObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).toBeNull();
    });

    test('should return null for model without object fields', () => {
      const where = { title: 'Hello' };
      const result = findObjectUniqueKey(where, simpleModel);

      expect(result).toBeNull();
    });

    test('should return null when object value has no unique subfields', () => {
      const where = { location: { address: '123 Main' } };
      const result = findObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).toBeNull();
    });

    test('should detect nested object @unique', () => {
      const where = { outer: { inner: { code: 'ABC' } } };
      const result = findObjectUniqueKey(where, modelWithNestedObjectUnique);

      expect(result).not.toBeNull();
      expect(result!.fieldName).toBe('outer');
      expect(result!.dotPaths).toEqual({ 'outer.inner.code': 'ABC' });
    });

    test('should return null for non-object values', () => {
      const where = { location: 'not an object' };
      const result = findObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).toBeNull();
    });

    test('should return null for null values', () => {
      const where = { location: null };
      const result = findObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).toBeNull();
    });

    test('should return null for array values', () => {
      const where = { location: [{ zip: '10001' }] };
      const result = findObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).toBeNull();
    });
  });

  describe('expandObjectUniqueKey', () => {
    test('should expand object unique key to dot-notation', () => {
      const where = { location: { zip: '10001' } };
      const result = expandObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).toEqual({ 'location.zip': '10001' });
      expect(result.location).toBeUndefined();
    });

    test('should preserve non-object where fields', () => {
      const where = { location: { zip: '10001' }, name: 'Alice' };
      const result = expandObjectUniqueKey(where, modelWithObjectUnique);

      expect(result['location.zip']).toBe('10001');
      expect(result.name).toBe('Alice');
      expect(result.location).toBeUndefined();
    });

    test('should return where unchanged when no object unique key', () => {
      const where = { name: 'Alice' };
      const result = expandObjectUniqueKey(where, modelWithObjectUnique);

      expect(result).toEqual({ name: 'Alice' });
    });

    test('should expand nested object unique key', () => {
      const where = { outer: { inner: { code: 'ABC' } } };
      const result = expandObjectUniqueKey(where, modelWithNestedObjectUnique);

      expect(result).toEqual({ 'outer.inner.code': 'ABC' });
    });
  });

  describe('validateUniqueField with object @unique', () => {
    test('should pass validation when object unique key is provided', () => {
      const where = { location: { zip: '10001' } };

      expect(() => validateUniqueField(where, modelWithObjectUnique)).not.toThrow();
    });

    test('should pass validation when id is provided', () => {
      const where = { id: 'user:123' };

      expect(() => validateUniqueField(where, modelWithObjectUnique)).not.toThrow();
    });

    test('should throw when no unique field is provided', () => {
      const where = { name: 'Alice' };

      expect(() => validateUniqueField(where, modelWithObjectUnique)).toThrow(
        'At least one unique field must be provided',
      );
    });

    test('should pass with standard @unique field (non-object)', () => {
      const where = { email: 'alice@example.com' };

      expect(() => validateUniqueField(where, simpleModel)).not.toThrow();
    });
  });
});
