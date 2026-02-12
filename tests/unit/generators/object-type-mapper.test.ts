/**
 * Unit Tests: Object Type Mapper
 *
 * Tests DEFINE FIELD generation for object-typed fields,
 * including dot notation, array .* notation, reuse, and self-referencing.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateModelDefineStatements,
  generateObjectFieldDefines,
} from '../../../src/generators/migrations/define-generator';
import { mapToSurrealType, generateTypeClause } from '../../../src/generators/migrations/type-mapper';
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

// Helper to create an ObjectMetadata
function obj(name: string, fields: FieldMetadata[]): ObjectMetadata {
  return { name, fields };
}

// Helper to create a ModelMetadata
function model(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

describe('Object Type Mapper', () => {
  describe('mapToSurrealType', () => {
    test('should map object to object', () => {
      expect(mapToSurrealType('object')).toBe('object');
    });
  });

  describe('generateTypeClause for object fields', () => {
    test('should generate TYPE object for required object field', () => {
      const f = field({ name: 'address', type: 'object', isRequired: true });
      expect(generateTypeClause('object', true, f)).toBe('TYPE object');
    });

    test('should generate TYPE option<object> for optional object field (no null)', () => {
      const f = field({ name: 'shipping', type: 'object', isRequired: false });
      expect(generateTypeClause('object', false, f)).toBe('TYPE option<object>');
    });

    test('should generate TYPE array<object> for array of objects', () => {
      const f = field({ name: 'locations', type: 'object', isRequired: true, isArray: true });
      expect(generateTypeClause('object', true, f)).toBe('TYPE array<object>');
    });
  });

  describe('generateObjectFieldDefines - dot notation', () => {
    const addressObj = obj('Address', [
      field({ name: 'street', type: 'string', isRequired: true }),
      field({ name: 'city', type: 'string', isRequired: true }),
      field({ name: 'zipCode', type: 'string', isRequired: false }),
    ]);
    const registry: ObjectRegistry = { Address: addressObj };

    test('should generate sub-fields with dot notation for required single object', () => {
      const stmts = generateObjectFieldDefines('address', 'user', addressObj, registry);

      expect(stmts).toHaveLength(3);
      expect(stmts[0]).toContain('address.street');
      expect(stmts[0]).toContain('TYPE string');
      expect(stmts[1]).toContain('address.city');
      expect(stmts[1]).toContain('TYPE string');
      expect(stmts[2]).toContain('address.zipCode');
      expect(stmts[2]).toContain('TYPE option<string | null>');
    });

    test('should use ON TABLE clause correctly', () => {
      const stmts = generateObjectFieldDefines('address', 'user', addressObj, registry);

      for (const stmt of stmts) {
        expect(stmt).toContain('ON TABLE user');
      }
    });

    test('should generate sub-fields under .* for array parent', () => {
      const stmts = generateObjectFieldDefines('locations.*', 'user', addressObj, registry);

      expect(stmts[0]).toContain('locations.*.street');
      expect(stmts[1]).toContain('locations.*.city');
      expect(stmts[2]).toContain('locations.*.zipCode');
    });
  });

  describe('generateObjectFieldDefines - nested objects', () => {
    const addressObj = obj('Address', [
      field({ name: 'city', type: 'string', isRequired: true }),
      field({ name: 'zipCode', type: 'string', isRequired: false }),
    ]);

    const geoPointObj = obj('GeoPoint', [
      field({ name: 'lat', type: 'float', isRequired: true }),
      field({ name: 'lng', type: 'float', isRequired: true }),
      field({
        name: 'label',
        type: 'object',
        isRequired: false,
        objectInfo: { objectName: 'Address', fields: addressObj.fields },
      }),
    ]);

    const registry: ObjectRegistry = {
      Address: addressObj,
      GeoPoint: geoPointObj,
    };

    test('should generate nested object parent + sub-field DEFINEs', () => {
      const stmts = generateObjectFieldDefines('primaryLocation', 'user', geoPointObj, registry);

      // lat, lng, label (parent), label.city, label.zipCode
      expect(stmts.some((s) => s.includes('primaryLocation.lat') && s.includes('TYPE float'))).toBe(true);
      expect(stmts.some((s) => s.includes('primaryLocation.lng') && s.includes('TYPE float'))).toBe(true);
      expect(stmts.some((s) => s.includes('primaryLocation.label') && s.includes('TYPE option<object>'))).toBe(true);
      expect(stmts.some((s) => s.includes('primaryLocation.label.city') && s.includes('TYPE string'))).toBe(true);
      expect(
        stmts.some((s) => s.includes('primaryLocation.label.zipCode') && s.includes('TYPE option<string | null>')),
      ).toBe(true);
    });

    test('should generate nested object in array with .* notation', () => {
      const stmts = generateObjectFieldDefines('locations.*', 'user', geoPointObj, registry);

      expect(stmts.some((s) => s.includes('locations.*.lat'))).toBe(true);
      expect(stmts.some((s) => s.includes('locations.*.label'))).toBe(true);
      expect(stmts.some((s) => s.includes('locations.*.label.city'))).toBe(true);
    });
  });

  describe('generateObjectFieldDefines - reuse', () => {
    const addressObj = obj('Address', [
      field({ name: 'street', type: 'string', isRequired: true }),
      field({ name: 'city', type: 'string', isRequired: true }),
    ]);
    const registry: ObjectRegistry = { Address: addressObj };

    test('same object in two fields generates two complete sets of DEFINE FIELD', () => {
      const addrStmts = generateObjectFieldDefines('address', 'user', addressObj, registry);
      const shipStmts = generateObjectFieldDefines('shipping', 'user', addressObj, registry);

      expect(addrStmts).toHaveLength(2);
      expect(shipStmts).toHaveLength(2);

      expect(addrStmts[0]).toContain('address.street');
      expect(shipStmts[0]).toContain('shipping.street');
      expect(addrStmts[1]).toContain('address.city');
      expect(shipStmts[1]).toContain('shipping.city');
    });
  });

  describe('generateObjectFieldDefines - self-referencing', () => {
    const treeObj = obj('TreeNode', [
      field({ name: 'value', type: 'int', isRequired: true }),
      field({
        name: 'children',
        type: 'object',
        isRequired: true,
        isArray: true,
        objectInfo: { objectName: 'TreeNode', fields: [] },
      }),
    ]);
    const registry: ObjectRegistry = { TreeNode: treeObj };

    test('should use FLEXIBLE TYPE for self-referencing array field', () => {
      // Start with TreeNode already in visited set
      const visited = new Set(['TreeNode']);
      const stmts = generateObjectFieldDefines('metadata', 'order', treeObj, registry, {}, visited);

      // 'value' is normal, 'children' should be FLEXIBLE
      const valueStmt = stmts.find((s) => s.includes('metadata.value'));
      const childrenStmt = stmts.find((s) => s.includes('metadata.children'));

      expect(valueStmt).toContain('TYPE int');
      expect(childrenStmt).toContain('TYPE array<object> FLEXIBLE');
    });

    test('should use FLEXIBLE TYPE for self-referencing optional field', () => {
      const selfRefObj = obj('Node', [
        field({ name: 'value', type: 'int', isRequired: true }),
        field({
          name: 'parent',
          type: 'object',
          isRequired: false,
          objectInfo: { objectName: 'Node', fields: [] },
        }),
      ]);
      const reg: ObjectRegistry = { Node: selfRefObj };

      const visited = new Set(['Node']);
      const stmts = generateObjectFieldDefines('node', 'table', selfRefObj, reg, {}, visited);

      const parentStmt = stmts.find((s) => s.includes('node.parent'));
      expect(parentStmt).toContain('TYPE option<object> FLEXIBLE');
    });

    test('should fully type non-self-referencing fields', () => {
      const visited = new Set(['TreeNode']);
      const stmts = generateObjectFieldDefines('metadata', 'order', treeObj, registry, {}, visited);

      const valueStmt = stmts.find((s) => s.includes('metadata.value'));
      expect(valueStmt).toContain('TYPE int');
      expect(valueStmt).not.toContain('FLEXIBLE');
    });
  });

  describe('generateModelDefineStatements with objects', () => {
    test('should generate object DEFINE FIELD statements for model', () => {
      const addressObj = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);
      const objectRegistry: ObjectRegistry = { Address: addressObj };

      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
        field({
          name: 'address',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Address', fields: addressObj.fields },
        }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, objectRegistry);

      // DEFINE TABLE + DEFINE FIELD name + DEFINE FIELD address + address.street + address.city
      expect(stmts.some((s) => s.includes('DEFINE TABLE'))).toBe(true);
      expect(stmts.some((s) => s.includes('DEFINE FIELD') && s.includes(' name '))).toBe(true);
      expect(
        stmts.some((s) => s.includes('DEFINE FIELD') && s.includes(' address ') && s.includes('TYPE object')),
      ).toBe(true);
      expect(stmts.some((s) => s.includes('address.street') && s.includes('TYPE string'))).toBe(true);
      expect(stmts.some((s) => s.includes('address.city') && s.includes('TYPE string'))).toBe(true);
    });

    test('should generate array object DEFINE FIELD statements', () => {
      const geoObj = obj('GeoPoint', [
        field({ name: 'lat', type: 'float', isRequired: true }),
        field({ name: 'lng', type: 'float', isRequired: true }),
      ]);
      const objectRegistry: ObjectRegistry = { GeoPoint: geoObj };

      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'locations',
          type: 'object',
          isRequired: true,
          isArray: true,
          objectInfo: { objectName: 'GeoPoint', fields: geoObj.fields },
        }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, objectRegistry);

      expect(stmts.some((s) => s.includes(' locations ') && s.includes('TYPE array<object>'))).toBe(true);
      expect(stmts.some((s) => s.includes('locations.*.lat') && s.includes('TYPE float'))).toBe(true);
      expect(stmts.some((s) => s.includes('locations.*.lng') && s.includes('TYPE float'))).toBe(true);
    });
  });
});
