/**
 * Unit tests for nested-builder.ts
 *
 * Tests the nested operation detection and query generation.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import {
  buildCreateWithNestedTransaction,
  buildUpdateWithNestedTransaction,
  extractNestedOperations,
  isNestedConnect,
  isNestedCreate,
  isNestedDisconnect,
  isNestedOperation,
} from '../../../src/query/builders/nested-builder';

// Generate registry from schema
const schema = `
model User {
  id Record @id
  email Email @unique
  name String
  profileId Record?
  profile Relation? @field(profileId) @model(Profile)
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Profile {
  id Record @id
  bio String?
}

model Tag {
  id Record @id
  name String @unique
  userIds Record[]
  users Relation[] @field(userIds) @model(User)
}
`;

const { ast } = parse(schema);
const registry = astToRegistry(ast);
const userModel = registry.User!;

describe('nested-builder', () => {
  describe('isNestedOperation', () => {
    test('returns true for create operation', () => {
      expect(isNestedOperation({ create: { name: 'Test' } })).toBe(true);
    });

    test('returns true for connect operation', () => {
      expect(isNestedOperation({ connect: 'profile:123' })).toBe(true);
    });

    test('returns true for disconnect operation', () => {
      expect(isNestedOperation({ disconnect: true })).toBe(true);
    });

    test('returns false for regular value', () => {
      expect(isNestedOperation('string')).toBe(false);
      expect(isNestedOperation(123)).toBe(false);
      expect(isNestedOperation(null)).toBe(false);
      expect(isNestedOperation(undefined)).toBe(false);
      expect(isNestedOperation({ name: 'Test' })).toBe(false);
    });
  });

  describe('isNestedCreate', () => {
    test('returns true for create object', () => {
      expect(isNestedCreate({ create: { name: 'Test' } })).toBe(true);
    });

    test('returns true for create array', () => {
      expect(isNestedCreate({ create: [{ name: 'Test1' }, { name: 'Test2' }] })).toBe(true);
    });

    test('returns false for connect', () => {
      expect(isNestedCreate({ connect: 'id:123' })).toBe(false);
    });
  });

  describe('isNestedConnect', () => {
    test('returns true for connect string', () => {
      expect(isNestedConnect({ connect: 'profile:123' })).toBe(true);
    });

    test('returns true for connect array', () => {
      expect(isNestedConnect({ connect: ['tag:1', 'tag:2'] })).toBe(true);
    });

    test('returns false for create', () => {
      expect(isNestedConnect({ create: { name: 'Test' } })).toBe(false);
    });
  });

  describe('isNestedDisconnect', () => {
    test('returns true for disconnect true', () => {
      expect(isNestedDisconnect({ disconnect: true })).toBe(true);
    });

    test('returns true for disconnect array', () => {
      expect(isNestedDisconnect({ disconnect: ['tag:1', 'tag:2'] })).toBe(true);
    });

    test('returns false for connect', () => {
      expect(isNestedDisconnect({ connect: 'id:123' })).toBe(false);
    });
  });

  describe('extractNestedOperations', () => {
    test('extracts nested create from data', () => {
      const data = {
        email: 'test@example.com',
        name: 'Test',
        profile: { create: { bio: 'Test bio' } },
      };

      const { cleanData, nestedOps } = extractNestedOperations(data, userModel);

      expect(cleanData.email).toBe('test@example.com');
      expect(cleanData.name).toBe('Test');
      expect(cleanData.profile).toBeUndefined();
      expect(nestedOps.size).toBe(1);
      expect(nestedOps.has('profile')).toBe(true);
    });

    test('extracts nested connect from data', () => {
      const data = {
        email: 'test@example.com',
        name: 'Test',
        profile: { connect: 'profile:123' },
      };

      const { cleanData, nestedOps } = extractNestedOperations(data, userModel);

      expect(cleanData.profile).toBeUndefined();
      expect(nestedOps.size).toBe(1);
      expect(nestedOps.get('profile')).toEqual({ connect: 'profile:123' });
    });

    test('extracts array connect from data', () => {
      const data = {
        email: 'test@example.com',
        name: 'Test',
        tags: { connect: ['tag:1', 'tag:2'] },
      };

      const { cleanData, nestedOps } = extractNestedOperations(data, userModel);

      expect(cleanData.tags).toBeUndefined();
      expect(nestedOps.size).toBe(1);
      expect(nestedOps.get('tags')).toEqual({ connect: ['tag:1', 'tag:2'] });
    });

    test('preserves non-relation fields', () => {
      const data = {
        email: 'test@example.com',
        name: 'Test',
        profileId: 'profile:direct',
      };

      const { cleanData, nestedOps } = extractNestedOperations(data, userModel);

      expect(cleanData.email).toBe('test@example.com');
      expect(cleanData.name).toBe('Test');
      expect(cleanData.profileId).toBe('profile:direct');
      expect(nestedOps.size).toBe(0);
    });
  });

  describe('buildCreateWithNestedTransaction', () => {
    test('generates transaction for single nested create', () => {
      const data = { email: 'test@example.com', name: 'Test' };
      const nestedOps = new Map([['profile', { create: { bio: 'Test bio' } }]]);

      const query = buildCreateWithNestedTransaction(userModel, data, nestedOps, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      expect(query.text).toContain('CREATE ONLY profile');
      expect(query.text).toContain('CREATE ONLY user');
      expect(query.text).toContain('COMMIT TRANSACTION');
      expect(query.vars).toHaveProperty('profile_content');
    });

    test('generates transaction for single nested connect', () => {
      const data = { email: 'test@example.com', name: 'Test' };
      const nestedOps = new Map([['profile', { connect: 'profile:123' }]]);

      const query = buildCreateWithNestedTransaction(userModel, data, nestedOps, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      // Validation for connected record existence
      expect(query.text).toContain('LET $exists_0_0 = (SELECT id FROM ONLY $validate_0_0)');
      expect(query.text).toContain('IF $exists_0_0 IS NONE { THROW "Cannot connect to non-existent Profile record" }');
      // profileId is embedded in CONTENT variable (bound via $content_main)
      expect(query.text).toContain('CONTENT $content_main');
      expect(query.vars).toHaveProperty('validate_0_0'); // Validation var for profile:123
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('generates transaction for array connect with bidirectional sync', () => {
      const data = { email: 'test@example.com', name: 'Test' };
      const nestedOps = new Map([['tags', { connect: ['tag:1', 'tag:2'] }]]);

      const query = buildCreateWithNestedTransaction(userModel, data, nestedOps, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      // Validation for connected record existence
      expect(query.text).toContain('LET $exists_0_0 = (SELECT id FROM ONLY $validate_0_0)');
      expect(query.text).toContain('IF $exists_0_0 IS NONE { THROW "Cannot connect to non-existent Tag record" }');
      expect(query.text).toContain('LET $exists_0_1 = (SELECT id FROM ONLY $validate_0_1)');
      // Uses parameterized variable for tag IDs
      expect(query.text).toContain('tagIds = $tags_connect');
      expect(query.vars).toHaveProperty('tags_connect');
      // Should include bidirectional sync updates via parameterized vars
      expect(query.text).toContain('UPDATE $sync_0_0 SET userIds += $resultId');
      expect(query.text).toContain('UPDATE $sync_0_1 SET userIds += $resultId');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });
  });

  describe('buildUpdateWithNestedTransaction', () => {
    test('generates transaction for connect update', () => {
      const where = { id: 'user:1' };
      const data = {};
      const nestedOps = new Map([['profile', { connect: 'profile:456' }]]);

      const query = buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      // Uses parameterized variable: $profile_connect[0] for single connect
      expect(query.text).toContain('UPDATE user SET profileId = $profile_connect[0]');
      expect(query.vars).toHaveProperty('profile_connect');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('generates transaction for disconnect update', () => {
      const where = { id: 'user:1' };
      const data = {};
      const nestedOps = new Map([['profile', { disconnect: true }]]);

      const query = buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      // Uses NONE for non-@nullable optional fields (field becomes absent)
      expect(query.text).toContain('profileId = NONE');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('generates transaction for array connect with bidirectional sync', () => {
      const where = { id: 'user:1' };
      const data = {};
      const nestedOps = new Map([['tags', { connect: ['tag:new'] }]]);

      const query = buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      // Uses parameterized variable for tag IDs
      expect(query.text).toContain('tagIds += $tags_connect');
      expect(query.vars).toHaveProperty('tags_connect');
      // Bidirectional sync using WHERE id INSIDE for batch updates
      expect(query.text).toContain('UPDATE tag SET userIds += $result[0].id WHERE id INSIDE $sync_connect_ids_0');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('generates transaction for array disconnect with bidirectional sync', () => {
      const where = { id: 'user:1' };
      const data = {};
      const nestedOps = new Map([['tags', { disconnect: ['tag:old'] }]]);

      const query = buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      // Uses parameterized variable for tag IDs
      expect(query.text).toContain('tagIds -= $tags_disconnect');
      expect(query.vars).toHaveProperty('tags_disconnect');
      // Bidirectional sync using WHERE id INSIDE for batch updates
      expect(query.text).toContain('UPDATE tag SET userIds -= $result[0].id WHERE id INSIDE $sync_disconnect_ids_0');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('throws error when where clause is empty', () => {
      const where = {};
      const data = {};
      const nestedOps = new Map([['profile', { connect: 'profile:1' }]]);

      expect(() => buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry)).toThrow(
        'Update requires a where clause',
      );
    });
  });

  describe('transactionMode', () => {
    describe('buildCreateWithNestedTransaction', () => {
      test('default (no flag) wraps in BEGIN/COMMIT', () => {
        const data = { email: 'test@example.com', name: 'Test' };
        const nestedOps = new Map([['profile', { create: { bio: 'Test bio' } }]]);

        const query = buildCreateWithNestedTransaction(userModel, data, nestedOps, registry);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });

      test('transactionMode=false wraps in BEGIN/COMMIT', () => {
        const data = { email: 'test@example.com', name: 'Test' };
        const nestedOps = new Map([['profile', { create: { bio: 'Test bio' } }]]);

        const query = buildCreateWithNestedTransaction(userModel, data, nestedOps, registry, false);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });

      test('transactionMode=true omits BEGIN/COMMIT but preserves statements and RETURN', () => {
        const data = { email: 'test@example.com', name: 'Test' };
        const nestedOps = new Map([['profile', { create: { bio: 'Test bio' } }]]);

        const query = buildCreateWithNestedTransaction(userModel, data, nestedOps, registry, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('CREATE ONLY profile');
        expect(query.text).toContain('CREATE ONLY user');
        expect(query.text).toContain('LET $resultId = $result.id;');
        expect(query.text).toContain('RETURN $result;');
        expect(query.vars).toHaveProperty('profile_content');
      });

      test('transactionMode=true preserves array connect with bidirectional sync', () => {
        const data = { email: 'test@example.com', name: 'Test' };
        const nestedOps = new Map([['tags', { connect: ['tag:1', 'tag:2'] }]]);

        const query = buildCreateWithNestedTransaction(userModel, data, nestedOps, registry, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('LET $exists_0_0');
        expect(query.text).toContain('LET $exists_0_1');
        expect(query.text).toContain('UPDATE $sync_0_0 SET userIds += $resultId');
        expect(query.text).toContain('UPDATE $sync_0_1 SET userIds += $resultId');
        expect(query.text).toContain('RETURN $result;');
      });
    });

    describe('buildUpdateWithNestedTransaction', () => {
      test('transactionMode=true omits BEGIN/COMMIT but preserves statements and RETURN', () => {
        const where = { id: 'user:1' };
        const data = {};
        const nestedOps = new Map([['profile', { connect: 'profile:456' }]]);

        const query = buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('UPDATE user SET profileId = $profile_connect[0]');
        expect(query.text).toContain('RETURN $result;');
        expect(query.vars).toHaveProperty('profile_connect');
      });

      test('transactionMode=true preserves disconnect operations', () => {
        const where = { id: 'user:1' };
        const data = {};
        const nestedOps = new Map([['profile', { disconnect: true }]]);

        const query = buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('profileId = NONE');
        expect(query.text).toContain('RETURN $result;');
      });

      test('transactionMode=true preserves bidirectional sync for array connect', () => {
        const where = { id: 'user:1' };
        const data = {};
        const nestedOps = new Map([['tags', { connect: ['tag:new'] }]]);

        const query = buildUpdateWithNestedTransaction(userModel, where, data, nestedOps, registry, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('tagIds += $tags_connect');
        expect(query.text).toContain('UPDATE tag SET userIds += $result[0].id WHERE id INSIDE $sync_connect_ids_0');
        expect(query.text).toContain('RETURN $result;');
      });
    });
  });
});
