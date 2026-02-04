/**
 * Unit tests for deleteUnique query builders
 *
 * Tests DELETE query generation for single record deletion.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildDeleteUniqueQuery,
  buildDeleteUniqueWithCascade,
  getRecordIdFromWhere,
} from '../../../src/query/builders/delete-builder';
import { parse } from '../../../src/parser/parser';
import { astToRegistry } from '../../../src/parser/model-metadata';

// Schema with unique fields
const schemaBasic = `
model User {
  id Record @id
  email Email @unique
  name String
}
`;

// Schema with cascade relation
const schemaCascade = `
model User {
  id Record @id
  email Email @unique
  name String
}

model Profile {
  id Record @id
  bio String?
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Cascade)
}
`;

// Schema with SetNull relation
const schemaSetNull = `
model User {
  id Record @id
  email Email @unique
  name String
}

model Post {
  id Record @id
  title String
  authorId Record?
  author Relation? @field(authorId) @model(User) @onDelete(SetNull)
}
`;

// Schema with Restrict relation
const schemaRestrict = `
model User {
  id Record @id
  email Email @unique
  name String
}

model Order {
  id Record @id
  total Float
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Restrict)
}
`;

describe('delete-unique-builder', () => {
  describe('getRecordIdFromWhere', () => {
    const { ast } = parse(schemaBasic);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('extracts ID from where clause', () => {
      const where = { id: 'abc123' };
      const result = getRecordIdFromWhere(where, userModel);

      expect(result.hasId).toBe(true);
      expect(result.id).toBe('abc123');
      expect(result.idFieldName).toBe('id');
    });

    test('identifies non-ID unique field', () => {
      const where = { email: 'test@example.com' };
      const result = getRecordIdFromWhere(where, userModel);

      expect(result.hasId).toBe(false);
      expect(result.id).toBeUndefined();
      expect(result.idFieldName).toBe('email');
    });

    test('throws when no unique field provided', () => {
      const where = { name: 'Test' };

      expect(() => getRecordIdFromWhere(where, userModel)).toThrow(
        /At least one unique field must be provided.*deleteUnique/,
      );
    });

    test('prefers ID over other unique fields', () => {
      const where = { id: 'abc123', email: 'test@example.com' };
      const result = getRecordIdFromWhere(where, userModel);

      expect(result.hasId).toBe(true);
      expect(result.id).toBe('abc123');
    });
  });

  describe('buildDeleteUniqueQuery', () => {
    const { ast } = parse(schemaBasic);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('generates DELETE with RETURN NONE', () => {
      const query = buildDeleteUniqueQuery(userModel, 'abc123', false);

      expect(query.text).toBe('DELETE user:abc123 RETURN NONE');
      expect(query.vars).toEqual({});
    });

    test('generates DELETE with RETURN BEFORE', () => {
      const query = buildDeleteUniqueQuery(userModel, 'abc123', true);

      expect(query.text).toBe('DELETE user:abc123 RETURN BEFORE');
      expect(query.vars).toEqual({});
    });

    test('handles ID with special characters', () => {
      const query = buildDeleteUniqueQuery(userModel, 'user-with-dashes', false);

      expect(query.text).toContain('user:⟨user-with-dashes⟩');
    });
  });

  describe('buildDeleteUniqueWithCascade', () => {
    describe('without cascade dependencies', () => {
      const { ast } = parse(schemaBasic);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      test('uses simple DELETE when no cascade needed (with ID)', () => {
        const where = { id: 'abc123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, false);

        // Simple delete without transaction
        expect(query.text).toBe('DELETE user:abc123 RETURN NONE');
        expect(query.vars).toEqual({});
      });

      test('uses simple DELETE with RETURN BEFORE (with ID)', () => {
        const where = { id: 'abc123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, true);

        expect(query.text).toBe('DELETE user:abc123 RETURN BEFORE');
      });
    });

    describe('with Cascade dependency', () => {
      const { ast } = parse(schemaCascade);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      test('generates transaction with cascade delete (ID lookup)', () => {
        const where = { id: 'abc123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, false);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('LET $to_delete = [$deleteId]');
        expect(query.text).toContain('DELETE FROM profile WHERE userId IN $to_delete');
        expect(query.text).toContain('DELETE $deleteId RETURN NONE');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });

      test('generates transaction with RETURN BEFORE', () => {
        const where = { id: 'abc123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, true);

        expect(query.text).toContain('DELETE $deleteId RETURN BEFORE');
      });

      test('generates transaction with email lookup', () => {
        const where = { email: 'test@example.com' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, false);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('LET $record = (SELECT id FROM ONLY user WHERE');
        // Note: JS code pre-checks existence, so no IF check in query
        expect(query.text).toContain('LET $deleteId = $record.id');
        expect(query.text).toContain('DELETE FROM profile WHERE userId IN $to_delete');
        expect(query.text).toContain('DELETE $deleteId');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });
    });

    describe('with SetNull dependency', () => {
      const { ast } = parse(schemaSetNull);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      test('generates transaction with SetNull update', () => {
        const where = { id: 'abc123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, false);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('UPDATE post SET authorId = NULL WHERE authorId IN $to_delete');
        expect(query.text).toContain('DELETE $deleteId RETURN NONE');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });
    });

    describe('with Restrict dependency', () => {
      const { ast } = parse(schemaRestrict);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      test('generates transaction with Restrict check', () => {
        const where = { id: 'abc123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, false);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('LET $has_order_deps');
        expect(query.text).toContain('SELECT count() as cnt FROM order WHERE userId IN $to_delete');
        expect(query.text).toContain('IF $has_order_deps > 0 { THROW');
        expect(query.text).toContain('@onDelete(Restrict)');
        expect(query.text).toContain('DELETE $deleteId');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });
    });
  });
});
