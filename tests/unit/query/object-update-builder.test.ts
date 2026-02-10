/**
 * Unit Tests: Object Update Builder
 *
 * Tests UPDATE SET clause building for object fields, including
 * merge (dot notation), full replace ({ set: }), null, and array ops.
 */

import { describe, expect, test } from 'bun:test';
import { buildUpdateManyQuery } from '../../../src/query/builders/update-builder';
import type { FieldMetadata, ModelMetadata, ObjectFieldMetadata } from '../../../src/types';

// Helper to create a minimal FieldMetadata
function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    hasNowDefault: false,
    isRequired: true,
    ...overrides,
  };
}

// Address object info
const addressFields: FieldMetadata[] = [
  field({ name: 'street', type: 'string', isRequired: true }),
  field({ name: 'city', type: 'string', isRequired: true }),
  field({ name: 'state', type: 'string', isRequired: true }),
  field({ name: 'zipCode', type: 'string', isRequired: false }),
];
const addressInfo: ObjectFieldMetadata = { objectName: 'Address', fields: addressFields };

// GeoPoint with nested Address
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

// Model with object fields
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
    field({
      name: 'primaryLocation',
      type: 'object',
      isRequired: false,
      objectInfo: geoPointInfo,
    }),
  ],
};

describe('Object Update Builder', () => {
  describe('merge update (single object)', () => {
    test('should generate single sub-field merge with dot notation', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { address: { city: 'NYC' } });

      expect(result.text).toContain('SET address.city =');
      expect(Object.values(result.vars).some((v) => v === 'NYC')).toBe(true);
    });

    test('should generate multiple sub-field merge', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { address: { city: 'NYC', state: 'NY' } });

      expect(result.text).toContain('address.city =');
      expect(result.text).toContain('address.state =');
    });

    test('should generate deep merge for nested object', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { primaryLocation: { label: { city: 'NYC' } } });

      expect(result.text).toContain('primaryLocation.label.city =');
    });

    test('should set optional object to NONE (null treated as NONE)', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { shipping: null });

      expect(result.text).toContain('shipping = NONE');
    });

    test('should merge optional object sub-field', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { shipping: { city: 'NYC' } });

      expect(result.text).toContain('shipping.city =');
    });
  });

  describe('full replace (set wrapper)', () => {
    test('should replace entire object with { set: ... }', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'John' },
        { address: { set: { street: '123 Main', city: 'NYC', state: 'NY' } } },
      );

      expect(result.text).toContain('SET address =');
      // Should NOT contain dot notation
      expect(result.text).not.toContain('address.street');
      expect(result.text).not.toContain('address.city');
    });

    test('should replace optional object with { set: ... }', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'John' },
        { shipping: { set: { street: '456 Oak', city: 'LA', state: 'CA' } } },
      );

      expect(result.text).toContain('SET shipping =');
    });
  });

  describe('array operations', () => {
    test('should push single element', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { locations: { push: { lat: 1, lng: 2 } } });

      expect(result.text).toContain('locations +=');
    });

    test('should push multiple elements', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'John' },
        {
          locations: {
            push: [
              { lat: 1, lng: 2 },
              { lat: 3, lng: 4 },
            ],
          },
        },
      );

      // Each push item gets its own += statement
      const pushCount = (result.text.match(/locations \+=/g) || []).length;
      expect(pushCount).toBe(2);
    });

    test('should full replace array with { set: [...] }', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { locations: { set: [{ lat: 1, lng: 2 }] } });

      expect(result.text).toContain('locations =');
      expect(result.text).not.toContain('locations +=');
    });

    test('should replace with direct array assignment', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { locations: [{ lat: 1, lng: 2 }] });

      expect(result.text).toContain('locations =');
    });
  });

  describe('combined updates', () => {
    test('should handle primitive + object field updates together', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'John' }, { name: 'Jane', address: { city: 'LA' } });

      expect(result.text).toContain('name =');
      expect(result.text).toContain('address.city =');
    });
  });
});
