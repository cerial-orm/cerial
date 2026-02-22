/**
 * Unit Tests: Object Condition Builder
 *
 * Tests WHERE clause building for object fields, including
 * dot notation, closures for arrays, and logical operators.
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import {
  buildArrayObjectCondition,
  buildConditions,
  buildObjectCondition,
} from '../../../src/query/filters/condition-builder';
import type { FieldMetadata, ModelMetadata, ObjectFieldMetadata } from '../../../src/types';

// Helper to create a minimal FieldMetadata
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

// Address object info for tests
const addressFields: FieldMetadata[] = [
  field({ name: 'city', type: 'string', isRequired: true }),
  field({ name: 'state', type: 'string', isRequired: true }),
  field({ name: 'zipCode', type: 'string', isRequired: false }),
];
const addressInfo: ObjectFieldMetadata = { objectName: 'Address', fields: addressFields };

// GeoPoint object info (with nested Address label)
const geoPointFields: FieldMetadata[] = [
  field({ name: 'lat', type: 'float', isRequired: true }),
  field({ name: 'lng', type: 'float', isRequired: true }),
  field({
    name: 'label',
    type: 'object',
    isRequired: false,
    objectInfo: { objectName: 'Address', fields: addressFields },
  }),
];
const geoPointInfo: ObjectFieldMetadata = { objectName: 'GeoPoint', fields: geoPointFields };

describe('Object Condition Builder', () => {
  describe('buildObjectCondition - single object dot notation', () => {
    test('should build simple equality with shorthand value', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'address', { city: 'NYC' }, addressInfo);

      expect(result.text).toContain('address.city =');
      expect(result.text).toContain('$');
      expect(Object.values(result.vars)[0]).toBe('NYC');
    });

    test('should build operator condition', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'address', { city: { contains: 'New' } }, addressInfo);

      // contains uses string::contains(field, value) function syntax
      expect(result.text).toContain('string::contains(address.city,');
      expect(Object.values(result.vars)[0]).toBe('New');
    });

    test('should build multiple sub-fields with AND', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'address', { city: 'NYC', state: 'NY' }, addressInfo);

      expect(result.text).toContain('address.city =');
      expect(result.text).toContain(' AND ');
      expect(result.text).toContain('address.state =');
    });

    test('should build null check for optional sub-field', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'address', { zipCode: null }, addressInfo);

      expect(result.text).toContain('address.zipCode = NULL');
    });
  });

  describe('buildObjectCondition - nested objects', () => {
    test('should build two-level dot notation', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'primaryLocation', { label: { city: 'NYC' } }, geoPointInfo);

      expect(result.text).toContain('primaryLocation.label.city =');
      expect(Object.values(result.vars)[0]).toBe('NYC');
    });

    test('should build mixed levels', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'primaryLocation', { lat: 40, label: { city: 'NYC' } }, geoPointInfo);

      expect(result.text).toContain('primaryLocation.lat =');
      expect(result.text).toContain(' AND ');
      expect(result.text).toContain('primaryLocation.label.city =');
    });
  });

  describe('buildArrayObjectCondition - closure syntax', () => {
    test('should build some with equality', () => {
      const ctx = createCompileContext();
      const result = buildArrayObjectCondition(ctx, 'locations', { some: { lat: 40 } }, geoPointInfo);

      expect(result.text).toContain('locations.any(|$v|');
      expect(result.text).toContain('$v.lat =');
    });

    test('should build some with operator', () => {
      const ctx = createCompileContext();
      const result = buildArrayObjectCondition(ctx, 'locations', { some: { lat: { gt: 40 } } }, geoPointInfo);

      expect(result.text).toContain('locations.any(|$v|');
      expect(result.text).toContain('$v.lat >');
    });

    test('should build some with multiple conditions', () => {
      const ctx = createCompileContext();
      const result = buildArrayObjectCondition(
        ctx,
        'locations',
        { some: { lat: { gt: 40 }, lng: { lt: -70 } } },
        geoPointInfo,
      );

      expect(result.text).toContain('locations.any(|$v|');
      expect(result.text).toContain('$v.lat >');
      expect(result.text).toContain(' AND ');
      expect(result.text).toContain('$v.lng <');
    });

    test('should build every', () => {
      const ctx = createCompileContext();
      const result = buildArrayObjectCondition(ctx, 'locations', { every: { lng: { lte: 100 } } }, geoPointInfo);

      expect(result.text).toContain('locations.all(|$v|');
      expect(result.text).toContain('$v.lng <=');
    });

    test('should build none', () => {
      const ctx = createCompileContext();
      const result = buildArrayObjectCondition(ctx, 'locations', { none: { lat: { gt: 40 } } }, geoPointInfo);

      expect(result.text).toContain('!(locations.any(|$v|');
      expect(result.text).toContain('$v.lat >');
    });

    test('should build some with nested object', () => {
      const ctx = createCompileContext();
      const result = buildArrayObjectCondition(ctx, 'locations', { some: { label: { city: 'NYC' } } }, geoPointInfo);

      expect(result.text).toContain('locations.any(|$v|');
      expect(result.text).toContain('$v.label.city =');
    });
  });

  describe('buildObjectCondition - logical operators within object where', () => {
    test('should handle AND within object', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'address', { AND: [{ city: 'NYC' }, { state: 'NY' }] }, addressInfo);

      expect(result.text).toContain('address.city =');
      expect(result.text).toContain(' AND ');
      expect(result.text).toContain('address.state =');
    });

    test('should handle OR within object', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'address', { OR: [{ city: 'NYC' }, { city: 'LA' }] }, addressInfo);

      expect(result.text).toContain('address.city =');
      expect(result.text).toContain(' OR ');
    });

    test('should handle NOT within object', () => {
      const ctx = createCompileContext();
      const result = buildObjectCondition(ctx, 'address', { NOT: { city: 'NYC' } }, addressInfo);

      expect(result.text).toContain('NOT');
      expect(result.text).toContain('address.city =');
    });
  });

  describe('buildConditions - models with object fields', () => {
    const userModel: ModelMetadata = {
      name: 'User',
      tableName: 'user',
      fields: [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({
          name: 'address',
          type: 'object',
          isRequired: true,
          objectInfo: addressInfo,
        }),
        field({
          name: 'shipping',
          type: 'object',
          isRequired: false,
          objectInfo: addressInfo,
        }),
        field({
          name: 'locations',
          type: 'object',
          isRequired: true,
          isArray: true,
          objectInfo: geoPointInfo,
        }),
      ],
    };

    test('should dispatch single object to dot notation', () => {
      const ctx = createCompileContext();
      const result = buildConditions(ctx, { address: { city: 'NYC' } }, userModel);

      expect(result.text).toContain('address.city =');
    });

    test('should dispatch array object to closure syntax', () => {
      const ctx = createCompileContext();
      const result = buildConditions(ctx, { locations: { some: { lat: 40 } } }, userModel);

      expect(result.text).toContain('locations.any(|$v|');
    });

    test('should combine primitive field + object field', () => {
      const ctx = createCompileContext();
      const result = buildConditions(ctx, { name: 'John', address: { city: 'NYC' } }, userModel);

      expect(result.text).toContain('name =');
      expect(result.text).toContain(' AND ');
      expect(result.text).toContain('address.city =');
    });

    test('should handle optional object with null value (runtime fallback)', () => {
      const ctx = createCompileContext();
      // Object fields don't support null at type level, but runtime should handle gracefully
      const result = buildConditions(ctx, { shipping: null }, userModel);

      expect(result.text).toContain('shipping = NULL');
    });

    test('should handle optional object sub-field query', () => {
      const ctx = createCompileContext();
      const result = buildConditions(ctx, { shipping: { city: 'NYC' } }, userModel);

      expect(result.text).toContain('shipping.city =');
    });
  });
});
