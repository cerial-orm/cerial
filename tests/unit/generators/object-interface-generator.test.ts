/**
 * Unit Tests: Object Interface Generator
 *
 * Tests interface generation for objects and models with object fields.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateObjectInterface,
  generateObjectInputInterface,
  generateObjectInterfaces,
  generateInterface,
  generateInputInterface,
} from '../../../src/generators/types/interface-generator';
import type { FieldMetadata, ModelMetadata, ObjectMetadata, ObjectRegistry } from '../../../src/types';

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

describe('Object Interface Generator', () => {
  describe('generateObjectInterface', () => {
    test('should generate object interface with required fields', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);

      const result = generateObjectInterface(addr);

      expect(result).toContain('export interface Address');
      expect(result).toContain('street: string;');
      expect(result).toContain('city: string;');
    });

    test('should generate object interface with optional field (nullable)', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'zipCode', type: 'string', isRequired: false }),
      ]);

      const result = generateObjectInterface(addr);

      expect(result).toContain('street: string;');
      expect(result).toContain('zipCode?: string | null;');
    });

    test('should generate object interface with array field', () => {
      const o = obj('Tags', [field({ name: 'items', type: 'string', isRequired: true, isArray: true })]);

      const result = generateObjectInterface(o);

      expect(result).toContain('items: string[];');
    });

    test('should generate object interface with numeric types', () => {
      const geo = obj('GeoPoint', [
        field({ name: 'lat', type: 'float', isRequired: true }),
        field({ name: 'lng', type: 'float', isRequired: true }),
      ]);

      const result = generateObjectInterface(geo);

      expect(result).toContain('lat: number;');
      expect(result).toContain('lng: number;');
    });

    test('should generate object interface with nested object reference', () => {
      const geo = obj('GeoPoint', [
        field({ name: 'lat', type: 'float', isRequired: true }),
        field({
          name: 'label',
          type: 'object',
          isRequired: false,
          objectInfo: { objectName: 'Address', fields: [] },
        }),
      ]);

      const result = generateObjectInterface(geo);

      expect(result).toContain('lat: number;');
      expect(result).toContain('label?: Address;');
    });

    test('should generate object interface with Record field (uses CerialId)', () => {
      const o = obj('Ref', [field({ name: 'refId', type: 'record', isRequired: true })]);

      const result = generateObjectInterface(o);

      expect(result).toContain('refId: CerialId;');
    });

    test('should generate self-referencing object interface', () => {
      const tree = obj('TreeNode', [
        field({ name: 'value', type: 'int', isRequired: true }),
        field({
          name: 'children',
          type: 'object',
          isRequired: true,
          isArray: true,
          objectInfo: { objectName: 'TreeNode', fields: [] },
        }),
      ]);

      const result = generateObjectInterface(tree);

      expect(result).toContain('value: number;');
      expect(result).toContain('children: TreeNode[];');
    });
  });

  describe('generateObjectInputInterface', () => {
    test('should generate input interface with same fields when no Record fields', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);

      const result = generateObjectInputInterface(addr);

      expect(result).toContain('export interface AddressInput');
      expect(result).toContain('street: string;');
      expect(result).toContain('city: string;');
    });

    test('should generate input interface with RecordIdInput for Record fields', () => {
      const o = obj('Ref', [
        field({ name: 'label', type: 'string', isRequired: true }),
        field({ name: 'refId', type: 'record', isRequired: true }),
      ]);

      const registry: ObjectRegistry = { Ref: o };
      const result = generateObjectInputInterface(o, registry);

      expect(result).toContain('export interface RefInput');
      expect(result).toContain('refId: RecordIdInput;');
    });
  });

  describe('generateObjectInterfaces', () => {
    test('should generate both output and input interfaces for multiple objects', () => {
      const addr = obj('Address', [field({ name: 'city', type: 'string', isRequired: true })]);
      const geo = obj('GeoPoint', [field({ name: 'lat', type: 'float', isRequired: true })]);

      const result = generateObjectInterfaces([addr, geo]);

      expect(result).toContain('export interface Address');
      expect(result).toContain('export interface AddressInput');
      expect(result).toContain('export interface GeoPoint');
      expect(result).toContain('export interface GeoPointInput');
    });

    test('should return empty string for no objects', () => {
      const result = generateObjectInterfaces([]);
      expect(result).toBe('');
    });
  });

  describe('model interfaces with object fields', () => {
    test('should generate model interface with required object field', () => {
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

      const result = generateInterface(m);

      expect(result).toContain('address: Address;');
    });

    test('should generate model interface with optional object field', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'shipping',
          type: 'object',
          isRequired: false,
          objectInfo: { objectName: 'Address', fields: [] },
        }),
      ]);

      const result = generateInterface(m);

      expect(result).toContain('shipping?: Address;');
    });

    test('should generate model interface with array of objects', () => {
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

      const result = generateInterface(m);

      expect(result).toContain('locations: GeoPoint[];');
    });

    test('should generate model input interface with ObjectInput type', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'address',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Address', fields: [] },
        }),
      ]);

      const result = generateInputInterface(m);

      expect(result).toContain('address: AddressInput;');
    });
  });
});
