/**
 * Unit Tests: Object Where Generator
 *
 * Tests Where type generation for objects and models with object fields.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateObjectWhereInterface,
  generateObjectWhereTypes,
  generateWhereInterface,
} from '../../../src/generators/types/where-generator';
import type { FieldMetadata, ModelMetadata, ObjectMetadata, ObjectRegistry } from '../../../src/types';

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

function obj(name: string, fields: FieldMetadata[]): ObjectMetadata {
  return { name, fields };
}

function model(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

describe('Object Where Generator', () => {
  describe('generateObjectWhereInterface', () => {
    test('should generate where with string field operators', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);

      const result = generateObjectWhereInterface(addr);

      expect(result).toContain('export interface AddressWhere');
      expect(result).toContain('street?:');
      expect(result).toContain('city?:');
      expect(result).toContain('contains?');
      expect(result).toContain('startsWith?');
      expect(result).toContain('endsWith?');
    });

    test('should generate where with optional string field (adds not, isNull)', () => {
      const addr = obj('Address', [field({ name: 'zipCode', type: 'string', isRequired: false })]);

      const result = generateObjectWhereInterface(addr);

      expect(result).toContain('zipCode?:');
      expect(result).toContain('null |'); // nullable prefix
      expect(result).toContain('not?');
      expect(result).toContain('isNull?');
    });

    test('should generate where with AND/OR/NOT logical operators', () => {
      const addr = obj('Address', [field({ name: 'city', type: 'string', isRequired: true })]);

      const result = generateObjectWhereInterface(addr);

      expect(result).toContain('AND?: AddressWhere[]');
      expect(result).toContain('OR?: AddressWhere[]');
      expect(result).toContain('NOT?: AddressWhere');
    });

    test('should generate where with numeric field operators', () => {
      const geo = obj('GeoPoint', [
        field({ name: 'lat', type: 'float', isRequired: true }),
        field({ name: 'lng', type: 'float', isRequired: true }),
      ]);

      const result = generateObjectWhereInterface(geo);

      expect(result).toContain('export interface GeoPointWhere');
      expect(result).toContain('lat?:');
      expect(result).toContain('gt?');
      expect(result).toContain('gte?');
      expect(result).toContain('lt?');
      expect(result).toContain('lte?');
    });

    test('should generate where referencing nested object where type', () => {
      const addr = obj('Address', [field({ name: 'city', type: 'string', isRequired: true })]);
      const geo = obj('GeoPoint', [
        field({ name: 'lat', type: 'float', isRequired: true }),
        field({
          name: 'label',
          type: 'object',
          isRequired: false,
          objectInfo: { objectName: 'Address', fields: addr.fields },
        }),
      ]);

      const registry: ObjectRegistry = { Address: addr, GeoPoint: geo };
      const result = generateObjectWhereInterface(geo, registry);

      expect(result).toContain('label?:');
      expect(result).toContain('AddressWhere');
      // Optional nested: no null prefix for object fields
      expect(result).not.toContain('null | AddressWhere');
    });

    test('should generate where with Bool field operators', () => {
      const o = obj('Flags', [field({ name: 'active', type: 'bool', isRequired: true })]);

      const result = generateObjectWhereInterface(o);
      expect(result).toContain('active?:');
      expect(result).toContain('eq?');
      expect(result).toContain('neq?');
    });

    test('should generate where with Date field operators (includes between)', () => {
      const o = obj('Stamp', [field({ name: 'created', type: 'date', isRequired: true })]);

      const result = generateObjectWhereInterface(o);
      expect(result).toContain('created?:');
      expect(result).toContain('between?');
    });

    test('should generate where with Record field operators', () => {
      const o = obj('Ref', [field({ name: 'refId', type: 'record', isRequired: true })]);

      const result = generateObjectWhereInterface(o);
      expect(result).toContain('refId?:');
      expect(result).toContain('RecordIdInput');
    });
  });

  describe('generateObjectWhereTypes', () => {
    test('should generate where types for multiple objects', () => {
      const addr = obj('Address', [field({ name: 'city', type: 'string', isRequired: true })]);
      const geo = obj('GeoPoint', [field({ name: 'lat', type: 'float', isRequired: true })]);

      const result = generateObjectWhereTypes([addr, geo]);

      expect(result).toContain('export interface AddressWhere');
      expect(result).toContain('export interface GeoPointWhere');
    });

    test('should return empty string for no objects', () => {
      const result = generateObjectWhereTypes([]);
      expect(result).toBe('');
    });
  });

  describe('generateWhereInterface - models with object fields', () => {
    test('should generate single required object field as ObjectWhere', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'address',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Address', fields: [] },
        }),
      ]);

      const result = generateWhereInterface(m);

      expect(result).toContain('address?: AddressWhere;');
      // Required: no null prefix
      expect(result).not.toContain('null | AddressWhere');
    });

    test('should generate single optional object field without null prefix', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'shipping',
          type: 'object',
          isRequired: false,
          objectInfo: { objectName: 'Address', fields: [] },
        }),
      ]);

      const result = generateWhereInterface(m);

      expect(result).toContain('shipping?: AddressWhere;');
      expect(result).not.toContain('null | AddressWhere');
    });

    test('should generate array of objects with some/every/none', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'locations',
          type: 'object',
          isRequired: true,
          isArray: true,
          objectInfo: { objectName: 'GeoPoint', fields: [] },
        }),
      ]);

      const result = generateWhereInterface(m);

      expect(result).toContain('locations?: { some?: GeoPointWhere; every?: GeoPointWhere; none?: GeoPointWhere; };');
    });

    test('should generate multiple object fields of same type correctly', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
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
      ]);

      const result = generateWhereInterface(m);

      expect(result).toContain('address?: AddressWhere;');
      expect(result).toContain('shipping?: AddressWhere;');
    });
  });
});
