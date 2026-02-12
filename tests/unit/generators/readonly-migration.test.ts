/**
 * Unit Tests: Readonly Migration Generator
 *
 * Tests DEFINE FIELD generation with READONLY keyword for @readonly decorator.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateModelDefineStatements,
  generateObjectFieldDefines,
} from '../../../src/generators/migrations/define-generator';
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

describe('Readonly Migration Generator', () => {
  describe('READONLY on model fields', () => {
    test('should add READONLY to required string field', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'code', type: 'string', isRequired: true, isReadonly: true }),
      ]);

      const stmts = generateModelDefineStatements(m);
      const codeStmt = stmts.find((s) => s.includes(' code '));
      expect(codeStmt).toContain('TYPE string');
      expect(codeStmt).toContain('READONLY');
      expect(codeStmt).toEndWith('READONLY;');
    });

    test('should add READONLY to optional int field', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'score', type: 'int', isRequired: false, isReadonly: true }),
      ]);

      const stmts = generateModelDefineStatements(m);
      const scoreStmt = stmts.find((s) => s.includes(' score '));
      expect(scoreStmt).toContain('TYPE option<int | null>');
      expect(scoreStmt).toContain('READONLY');
    });

    test('should add READONLY to Record field', () => {
      const m = model('Post', 'post', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'authorId', type: 'record', isRequired: true, isReadonly: true }),
      ]);

      const stmts = generateModelDefineStatements(m);
      const authorStmt = stmts.find((s) => s.includes(' authorId '));
      expect(authorStmt).toContain('READONLY');
    });

    test('should add READONLY after DEFAULT clause', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'createdBy', type: 'string', isRequired: false, isReadonly: true, defaultValue: 'system' }),
      ]);

      const stmts = generateModelDefineStatements(m);
      const createdByStmt = stmts.find((s) => s.includes(' createdBy '));
      expect(createdByStmt).toContain("DEFAULT 'system'");
      expect(createdByStmt).toContain('READONLY');
      // READONLY should come after DEFAULT
      const defaultIdx = createdByStmt!.indexOf('DEFAULT');
      const readonlyIdx = createdByStmt!.indexOf('READONLY');
      expect(readonlyIdx).toBeGreaterThan(defaultIdx);
    });

    test('should add READONLY after @createdAt DEFAULT', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'lockedAt',
          type: 'date',
          isRequired: false,
          isReadonly: true,
          timestampDecorator: 'createdAt',
        }),
      ]);

      const stmts = generateModelDefineStatements(m);
      const lockedStmt = stmts.find((s) => s.includes(' lockedAt '));
      expect(lockedStmt).toContain('DEFAULT time::now()');
      expect(lockedStmt).toContain('READONLY');
    });

    test('should add READONLY to array field', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'tags', type: 'string', isRequired: true, isArray: true, isReadonly: true }),
      ]);

      const stmts = generateModelDefineStatements(m);
      const tagsStmt = stmts.find((s) => s.includes(' tags '));
      expect(tagsStmt).toContain('TYPE array<string>');
      expect(tagsStmt).toContain('READONLY');
    });

    test('should NOT add READONLY to non-readonly field', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
      ]);

      const stmts = generateModelDefineStatements(m);
      const nameStmt = stmts.find((s) => s.includes(' name '));
      expect(nameStmt).not.toContain('READONLY');
    });

    test('should add READONLY to whole object field', () => {
      const addressObj = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ]);
      const objectRegistry: ObjectRegistry = { Address: addressObj };

      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'address',
          type: 'object',
          isRequired: true,
          isReadonly: true,
          objectInfo: { objectName: 'Address', fields: addressObj.fields },
        }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, objectRegistry);
      const addressStmt = stmts.find((s) => s.includes(' address ') && s.includes('TYPE object'));
      expect(addressStmt).toContain('TYPE object');
      expect(addressStmt).toContain('READONLY');
    });
  });

  describe('READONLY on object sub-fields', () => {
    test('should add READONLY to sub-field with @readonly', () => {
      const addressObj = obj('Address', [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true, isReadonly: true }),
      ]);
      const objectRegistry: ObjectRegistry = { Address: addressObj };

      const stmts = generateObjectFieldDefines('address', 'user', addressObj, objectRegistry);

      const cityStmt = stmts.find((s) => s.includes('address.city'));
      expect(cityStmt).toContain('READONLY');

      const streetStmt = stmts.find((s) => s.includes('address.street'));
      expect(streetStmt).not.toContain('READONLY');
    });

    test('should add READONLY to nested object sub-field with @readonly', () => {
      const innerObj = obj('Inner', [
        field({ name: 'key', type: 'string', isRequired: true, isReadonly: true }),
        field({ name: 'value', type: 'int', isRequired: true }),
      ]);
      const outerObj = obj('Outer', [
        field({
          name: 'inner',
          type: 'object',
          isRequired: true,
          objectInfo: { objectName: 'Inner', fields: innerObj.fields },
        }),
      ]);
      const objectRegistry: ObjectRegistry = { Inner: innerObj, Outer: outerObj };

      const stmts = generateObjectFieldDefines('config', 'user', outerObj, objectRegistry);

      const keyStmt = stmts.find((s) => s.includes('config.inner.key'));
      expect(keyStmt).toContain('READONLY');

      const valStmt = stmts.find((s) => s.includes('config.inner.value'));
      expect(valStmt).not.toContain('READONLY');
    });

    test('should add READONLY to sub-field with @readonly and @default', () => {
      const addressObj = obj('Address', [
        field({ name: 'country', type: 'string', isRequired: false, isReadonly: true, defaultValue: 'US' }),
      ]);
      const objectRegistry: ObjectRegistry = { Address: addressObj };

      const stmts = generateObjectFieldDefines('address', 'user', addressObj, objectRegistry);
      const countryStmt = stmts.find((s) => s.includes('address.country'));
      expect(countryStmt).toContain("DEFAULT 'US'");
      expect(countryStmt).toContain('READONLY');
    });

    test('should add READONLY to nested object parent field with @readonly', () => {
      const innerObj = obj('Inner', [field({ name: 'x', type: 'int', isRequired: true })]);
      const outerObj = obj('Outer', [
        field({
          name: 'locked',
          type: 'object',
          isRequired: true,
          isReadonly: true,
          objectInfo: { objectName: 'Inner', fields: innerObj.fields },
        }),
      ]);
      const objectRegistry: ObjectRegistry = { Inner: innerObj, Outer: outerObj };

      const stmts = generateObjectFieldDefines('config', 'user', outerObj, objectRegistry);
      const lockedStmt = stmts.find((s) => s.includes('config.locked') && s.includes('TYPE object'));
      expect(lockedStmt).toContain('READONLY');
    });
  });
});
