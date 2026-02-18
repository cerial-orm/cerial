/**
 * Unit Tests: Object Interface Generator
 *
 * Tests interface generation for objects and models with object fields.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateObjectInterface,
  generateObjectInputInterface,
  generateObjectCreateInputInterface,
  generateObjectInterfaces,
  generateInterface,
  generateInputInterface,
  objectHasDefaultOrTimestamp,
} from '../../../src/generators/types/interface-generator';
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

    test('should generate object interface with optional field', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'zipCode', type: 'string', isRequired: false }),
      ]);

      const result = generateObjectInterface(addr);

      expect(result).toContain('street: string;');
      expect(result).toContain('zipCode?: string;');
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

    test('should generate object interface with @nullable field', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'zipCode', type: 'string', isRequired: true, isNullable: true }),
      ]);

      const result = generateObjectInterface(addr);

      expect(result).toContain('street: string;');
      expect(result).toContain('zipCode: string | null;');
    });

    test('should generate object interface with optional @nullable field', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'zipCode', type: 'string', isRequired: false, isNullable: true }),
      ]);

      const result = generateObjectInterface(addr);

      expect(result).toContain('street: string;');
      expect(result).toContain('zipCode?: string | null;');
    });

    test('should generate object interface with Record field (uses CerialId)', () => {
      const o = obj('Ref', [field({ name: 'refId', type: 'record', isRequired: true })]);

      const result = generateObjectInterface(o);

      expect(result).toContain('refId: CerialId<string>;');
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
      expect(result).toContain('refId: RecordIdInput<string>;');
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

  describe('objectHasDefaultOrTimestamp', () => {
    test('should return false for object with no defaults', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);

      expect(objectHasDefaultOrTimestamp(addr)).toBe(false);
    });

    test('should return true for object with @default field', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true, defaultValue: 'Unknown' }),
      ]);

      expect(objectHasDefaultOrTimestamp(addr)).toBe(true);
    });

    test('should return true for object with @now field', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'createdAt', type: 'date', isRequired: true, timestampDecorator: 'createdAt' }),
      ]);

      expect(objectHasDefaultOrTimestamp(addr)).toBe(true);
    });

    test('should return true for nested object with defaults', () => {
      const inner = obj('Inner', [field({ name: 'value', type: 'string', isRequired: true, defaultValue: 'default' })]);
      const outer = obj('Outer', [
        field({
          name: 'inner',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Inner', fields: inner.fields },
        }),
      ]);
      const registry: ObjectRegistry = { Inner: inner, Outer: outer };

      expect(objectHasDefaultOrTimestamp(outer, registry)).toBe(true);
    });

    test('should return false for nested object without defaults', () => {
      const inner = obj('Inner', [field({ name: 'value', type: 'string', isRequired: true })]);
      const outer = obj('Outer', [
        field({
          name: 'inner',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Inner', fields: inner.fields },
        }),
      ]);
      const registry: ObjectRegistry = { Inner: inner, Outer: outer };

      expect(objectHasDefaultOrTimestamp(outer, registry)).toBe(false);
    });

    test('should handle self-referencing objects without infinite loop', () => {
      const tree = obj('Tree', [
        field({ name: 'value', type: 'int', isRequired: true }),
        field({
          name: 'children',
          type: 'object',
          isRequired: true,
          isArray: true,
          objectInfo: { objectName: 'Tree', fields: [] },
        }),
      ]);
      const registry: ObjectRegistry = { Tree: tree };

      expect(objectHasDefaultOrTimestamp(tree, registry)).toBe(false);
    });

    test('should detect @default(false) as having a default', () => {
      const o = obj('Flags', [field({ name: 'active', type: 'bool', isRequired: true, defaultValue: false })]);

      expect(objectHasDefaultOrTimestamp(o)).toBe(true);
    });
  });

  describe('generateObjectCreateInputInterface', () => {
    test('should make @default field optional', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true, defaultValue: 'Unknown' }),
      ]);

      const result = generateObjectCreateInputInterface(addr);

      expect(result).toContain('export interface AddressCreateInput');
      expect(result).toContain('street: string;');
      expect(result).toContain('city?: string;');
    });

    test('should make @now field optional', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'createdAt', type: 'date', isRequired: true, timestampDecorator: 'createdAt' }),
      ]);

      const result = generateObjectCreateInputInterface(addr);

      expect(result).toContain('street: string;');
      expect(result).toContain('createdAt?: Date;');
    });

    test('should keep already-optional fields optional', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'zipCode', type: 'string', isRequired: false }),
      ]);

      const result = generateObjectCreateInputInterface(addr);

      expect(result).toContain('street: string;');
      expect(result).toContain('zipCode?: string;');
    });

    test('should make array fields optional in create (default to [])', () => {
      const o = obj('Order', [
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'tags', type: 'string', isRequired: true, isArray: true }),
      ]);

      const result = generateObjectCreateInputInterface(o);

      expect(result).toContain('name: string;');
      expect(result).toContain('tags?: string[];');
    });

    test('should use RecordIdInput for Record fields', () => {
      const o = obj('Ref', [
        field({ name: 'label', type: 'string', isRequired: true }),
        field({ name: 'refId', type: 'record', isRequired: true, defaultValue: 'some:id' }),
      ]);
      const registry: ObjectRegistry = { Ref: o };

      const result = generateObjectCreateInputInterface(o, registry);

      expect(result).toContain('label: string;');
      expect(result).toContain('refId?: RecordIdInput<string>;');
    });

    test('should use nested CreateInput for objects with defaults', () => {
      const inner = obj('Inner', [field({ name: 'value', type: 'string', isRequired: true, defaultValue: 'default' })]);
      const outer = obj('Outer', [
        field({
          name: 'inner',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Inner', fields: inner.fields },
        }),
      ]);
      const registry: ObjectRegistry = { Inner: inner, Outer: outer };

      const result = generateObjectCreateInputInterface(outer, registry);

      expect(result).toContain('inner: InnerCreateInput;');
    });

    test('should use regular Input for nested objects without defaults', () => {
      const inner = obj('Inner', [field({ name: 'value', type: 'string', isRequired: true })]);
      const outer = obj('Outer', [
        field({ name: 'name', type: 'string', isRequired: true, defaultValue: 'x' }),
        field({
          name: 'inner',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Inner', fields: inner.fields },
        }),
      ]);
      const registry: ObjectRegistry = { Inner: inner, Outer: outer };

      const result = generateObjectCreateInputInterface(outer, registry);

      expect(result).toContain('name?: string;');
      expect(result).toContain('inner: InnerInput;');
    });

    test('should handle object with only @default/@now fields (all optional)', () => {
      const o = obj('Auto', [
        field({ name: 'createdAt', type: 'date', isRequired: true, timestampDecorator: 'createdAt' }),
        field({ name: 'status', type: 'string', isRequired: true, defaultValue: 'active' }),
      ]);

      const result = generateObjectCreateInputInterface(o);

      expect(result).toContain('createdAt?: Date;');
      expect(result).toContain('status?: string;');
    });

    test('should handle optional object field in create', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true, defaultValue: 'Unknown' }),
      ]);

      const result = generateObjectCreateInputInterface(addr);

      // Optional object fields don't get | null
      expect(result).toContain('export interface AddressCreateInput');
    });
  });

  describe('generateObjectInterfaces with CreateInput', () => {
    test('should generate CreateInput when object has @default fields', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true, defaultValue: 'Unknown' }),
      ]);

      const result = generateObjectInterfaces([addr]);

      expect(result).toContain('export interface Address {');
      expect(result).toContain('export interface AddressInput {');
      expect(result).toContain('export interface AddressCreateInput {');
    });

    test('should NOT generate CreateInput when object has no defaults', () => {
      const addr = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);

      const result = generateObjectInterfaces([addr]);

      expect(result).toContain('export interface Address {');
      expect(result).toContain('export interface AddressInput {');
      expect(result).not.toContain('CreateInput');
    });

    test('should generate CreateInput for object with @now field', () => {
      const o = obj('Timestamped', [
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'createdAt', type: 'date', isRequired: true, timestampDecorator: 'createdAt' }),
      ]);

      const result = generateObjectInterfaces([o]);

      expect(result).toContain('export interface TimestampedCreateInput {');
    });

    test('should generate CreateInput only for objects that need it (mixed)', () => {
      const withDefault = obj('WithDefault', [
        field({ name: 'val', type: 'string', isRequired: true, defaultValue: 'x' }),
      ]);
      const noDefault = obj('NoDefault', [field({ name: 'val', type: 'string', isRequired: true })]);

      const result = generateObjectInterfaces([withDefault, noDefault]);

      expect(result).toContain('export interface WithDefaultCreateInput');
      expect(result).not.toContain('NoDefaultCreateInput');
    });
  });
});
