/**
 * Unit Tests: Object Select and OrderBy Type Generation
 *
 * Tests Select and OrderBy type generation for objects,
 * and the select/orderBy query builders for object fields.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateObjectSelectType,
  generateObjectOrderByType,
  generateObjectDerivedTypes,
  generateAllObjectDerivedTypes,
  generateUpdateType,
  generateSelectType,
  generateOrderByType,
} from '../../../src/generators/types/derived-generator';
import { buildSelectFields, buildOrderBy } from '../../../src/query/builders/select-builder';
import type { FieldMetadata, ModelMetadata, ObjectMetadata } from '../../../src/types';

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

function obj(name: string, fields: FieldMetadata[]): ObjectMetadata {
  return { name, fields };
}

function model(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

describe('Object Select Type Generator', () => {
  describe('generateObjectSelectType', () => {
    test('should generate select type for object with multiple fields', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
        field({ name: 'zipCode', type: 'string', isRequired: false }),
      ]);

      const result = generateObjectSelectType(addr);

      expect(result).toContain('AddressSelect');
      // Should contain field names
      expect(result).toContain('street');
      expect(result).toContain('city');
      expect(result).toContain('zipCode');
    });

    test('should generate select type for single-field object', () => {
      const single = obj('Simple', [field({ name: 'value', type: 'string', isRequired: true })]);

      const result = generateObjectSelectType(single);

      expect(result).toContain('SimpleSelect');
      expect(result).toContain('value');
    });

    test('should generate empty select for empty object', () => {
      const empty = obj('Empty', []);

      const result = generateObjectSelectType(empty);

      expect(result).toContain('EmptySelect');
    });

    test('should include nested object select type reference', () => {
      const geo = obj('GeoPoint', [
        field({ name: 'lat', type: 'float', isRequired: true }),
        field({
          name: 'label',
          type: 'object',
          isRequired: false,
          objectInfo: { objectName: 'Address', fields: [] },
        }),
      ]);

      const result = generateObjectSelectType(geo);

      expect(result).toContain('GeoPointSelect');
      expect(result).toContain('AddressSelect');
    });
  });

  describe('generateObjectOrderByType', () => {
    test('should generate orderBy type with asc/desc for primitive fields', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);

      const result = generateObjectOrderByType(addr);

      expect(result).toContain('export interface AddressOrderBy');
      expect(result).toContain("street?: 'asc' | 'desc';");
      expect(result).toContain("city?: 'asc' | 'desc';");
    });

    test('should generate orderBy with nested object reference', () => {
      const geo = obj('GeoPoint', [
        field({ name: 'lat', type: 'float', isRequired: true }),
        field({
          name: 'label',
          type: 'object',
          isRequired: false,
          objectInfo: { objectName: 'Address', fields: [] },
        }),
      ]);

      const result = generateObjectOrderByType(geo);

      expect(result).toContain("lat?: 'asc' | 'desc';");
      expect(result).toContain('label?: AddressOrderBy;');
    });
  });

  describe('generateObjectDerivedTypes', () => {
    test('should generate both select and orderBy for object', () => {
      const addr = obj('Address', [field({ name: 'city', type: 'string', isRequired: true })]);

      const result = generateObjectDerivedTypes(addr);

      expect(result).toContain('AddressSelect');
      expect(result).toContain('AddressOrderBy');
    });
  });

  describe('generateAllObjectDerivedTypes', () => {
    test('should generate for multiple objects', () => {
      const addr = obj('Address', [field({ name: 'city', type: 'string', isRequired: true })]);
      const geo = obj('GeoPoint', [field({ name: 'lat', type: 'float', isRequired: true })]);

      const result = generateAllObjectDerivedTypes([addr, geo]);

      expect(result).toContain('AddressSelect');
      expect(result).toContain('AddressOrderBy');
      expect(result).toContain('GeoPointSelect');
      expect(result).toContain('GeoPointOrderBy');
    });

    test('should return empty string for no objects', () => {
      expect(generateAllObjectDerivedTypes([])).toBe('');
    });
  });
});

describe('Model Update Type with Objects', () => {
  test('should generate update type with object field operations', () => {
    const m = model('User', 'user', [
      field({ name: 'id', type: 'record', isId: true, isRequired: true }),
      field({ name: 'name', type: 'string', isRequired: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: true,
        objectInfo: { objectName: 'Address', fields: [] },
      }),
      field({
        name: 'shipping',
        type: 'object',
        isRequired: false,
        objectInfo: { objectName: 'Address', fields: [] },
      }),
      field({
        name: 'locations',
        type: 'object',
        isRequired: true,
        isArray: true,
        objectInfo: { objectName: 'GeoPoint', fields: [] },
      }),
    ]);

    const result = generateUpdateType(m);

    // Required single: partial merge or full replace
    expect(result).toContain('Partial<AddressInput> | { set: AddressInput }');
    // Optional single: same as required (no null for object fields)
    expect(result).toContain('shipping?: Partial<AddressInput> | { set: AddressInput }');
    expect(result).not.toContain('| null');
    // Array: full replace, push, set, updateWhere, unset
    expect(result).toContain('GeoPointInput[]');
    expect(result).toContain('push?');
    expect(result).toContain('set?');
    expect(result).toContain('updateWhere?');
    expect(result).toContain('unset?');
  });
});

describe('Model Select Type with Objects', () => {
  test('should generate select type with object field support', () => {
    const m = model('User', 'user', [
      field({ name: 'id', type: 'record', isId: true, isRequired: true }),
      field({ name: 'name', type: 'string', isRequired: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: true,
        objectInfo: { objectName: 'Address', fields: [] },
      }),
    ]);

    const result = generateSelectType(m);

    expect(result).toContain('UserSelect');
    // Object fields can be boolean or sub-select
    expect(result).toContain('AddressSelect');
  });
});

describe('Model OrderBy Type with Objects', () => {
  test('should generate orderBy type with nested object reference', () => {
    const m = model('User', 'user', [
      field({ name: 'id', type: 'record', isId: true, isRequired: true }),
      field({ name: 'name', type: 'string', isRequired: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: true,
        objectInfo: { objectName: 'Address', fields: [] },
      }),
    ]);

    const result = generateOrderByType(m);

    expect(result).toContain('UserOrderBy');
    expect(result).toContain('address?: AddressOrderBy;');
  });
});

describe('Select Query Builder with Objects', () => {
  const userModel = model('User', 'user', [
    field({ name: 'id', type: 'record', isId: true, isRequired: true }),
    field({ name: 'name', type: 'string', isRequired: true }),
    field({
      name: 'address',
      type: 'object',
      isRequired: true,
      objectInfo: { objectName: 'Address', fields: [] },
    }),
    field({
      name: 'locations',
      type: 'object',
      isRequired: true,
      isArray: true,
      objectInfo: { objectName: 'GeoPoint', fields: [] },
    }),
  ]);

  test('should select all with *', () => {
    const result = buildSelectFields(undefined, userModel);
    expect(result).toBe('*');
  });

  test('should select boolean true for object field', () => {
    const result = buildSelectFields({ address: true }, userModel);
    expect(result).toBe('address');
  });

  test('should select with sub-field destructuring', () => {
    const result = buildSelectFields({ address: { city: true, zipCode: true } } as any, userModel);
    expect(result).toContain('address.{ city, zipCode }');
  });

  test('should select nested object sub-fields', () => {
    const result = buildSelectFields({ locations: { lat: true, label: { city: true } } } as any, userModel);
    expect(result).toContain('locations.{ lat, label.{ city } }');
  });

  test('should combine primitive + object sub-select', () => {
    const result = buildSelectFields({ name: true, address: { city: true } } as any, userModel);
    expect(result).toContain('name');
    expect(result).toContain('address.{ city }');
  });
});

describe('OrderBy Builder with Objects', () => {
  test('should build nested object orderBy', () => {
    const result = buildOrderBy({ address: { city: 'asc' } } as any);
    expect(result).toBe('ORDER BY address.city ASC');
  });

  test('should build multi-level nested orderBy', () => {
    const result = buildOrderBy({ primaryLocation: { label: { city: 'desc' } } } as any);
    expect(result).toBe('ORDER BY primaryLocation.label.city DESC');
  });

  test('should build combined primitive + object orderBy', () => {
    const result = buildOrderBy({ name: 'asc', address: { city: 'desc' } } as any);
    expect(result).toContain('name ASC');
    expect(result).toContain('address.city DESC');
  });
});
