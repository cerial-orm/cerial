/**
 * Unit tests for delete-builder.ts
 *
 * Tests delete query generation including cascade behavior.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildDeleteWithCascade,
} from '../../../src/query/builders/delete-builder';
import { parse } from '../../../src/parser/parser';
import { astToRegistry } from '../../../src/parser/model-metadata';

// Schema without @onDelete - no cascade behavior
const schemaNoOnDelete = `
model User {
  id Record @id
  email Email @unique
  name String
}

model Profile {
  id Record @id
  bio String?
  userId Record?
  user Relation? @field(userId) @model(User)
}
`;

// Schema with @onDelete(Cascade) on optional relation
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

// Schema with @onDelete(SetNull) on optional relation
const schemaSetNull = `
model User {
  id Record @id
  email Email @unique
  name String
}

model Profile {
  id Record @id
  bio String?
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(SetNull)
}
`;

// Schema with multiple dependent models
const schemaMultipleDeps = `
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

model Post {
  id Record @id
  title String
  authorId Record?
  author Relation? @field(authorId) @model(User) @onDelete(SetNull)
}
`;

describe('delete-builder', () => {
  describe('buildDeleteQuery', () => {
    const { ast } = parse(schemaNoOnDelete);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('generates simple delete query', () => {
      const where = { id: 'user:123' };
      const query = buildDeleteQuery(userModel, where);

      expect(query.text).toContain('DELETE FROM user WHERE');
      expect(query.text).toContain('id =');
      expect(query.vars).toBeDefined();
    });

    test('generates delete with multiple where conditions', () => {
      const where = { email: 'test@example.com', name: 'Test' };
      const query = buildDeleteQuery(userModel, where);

      expect(query.text).toContain('DELETE FROM user WHERE');
      expect(query.text).toContain('email =');
      expect(query.text).toContain('name =');
    });
  });

  describe('buildDeleteQueryWithReturn', () => {
    const { ast } = parse(schemaNoOnDelete);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('generates delete query with RETURN BEFORE', () => {
      const where = { id: 'user:123' };
      const query = buildDeleteQueryWithReturn(userModel, where);

      expect(query.text).toContain('DELETE FROM user WHERE');
      expect(query.text).toContain('RETURN BEFORE');
    });
  });

  describe('buildDeleteWithCascade', () => {
    test('uses SetNull by default for optional relations without @onDelete', () => {
      const { ast } = parse(schemaNoOnDelete);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      const where = { id: 'user:123' };
      const query = buildDeleteWithCascade(userModel, where, registry);

      // Optional relations without @onDelete default to SetNull behavior
      // This means a transaction is used to clean up the FK reference
      expect(query.text).toContain('BEGIN TRANSACTION');
      expect(query.text).toContain('LET $to_delete = (SELECT id FROM user');
      expect(query.text).toContain('UPDATE profile SET userId = NULL WHERE userId IN $to_delete.id');
      expect(query.text).toContain('DELETE FROM user');
      expect(query.text).toContain('RETURN BEFORE');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('generates cascade delete transaction when @onDelete(Cascade)', () => {
      const { ast } = parse(schemaCascade);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      const where = { id: 'user:123' };
      const query = buildDeleteWithCascade(userModel, where, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      expect(query.text).toContain('LET $to_delete = (SELECT id FROM user');
      expect(query.text).toContain('DELETE FROM profile WHERE userId IN $to_delete.id');
      expect(query.text).toContain('DELETE FROM user');
      expect(query.text).toContain('RETURN BEFORE');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('generates setNull update when @onDelete(SetNull)', () => {
      const { ast } = parse(schemaSetNull);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      const where = { id: 'user:123' };
      const query = buildDeleteWithCascade(userModel, where, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      // Uses NULL (not NONE) so the field can be queried with { field: null }
      expect(query.text).toContain('UPDATE profile SET userId = NULL WHERE userId IN $to_delete.id');
      expect(query.text).toContain('COMMIT TRANSACTION');
    });

    test('handles multiple dependent models with different @onDelete actions', () => {
      const { ast } = parse(schemaMultipleDeps);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      const where = { id: 'user:123' };
      const query = buildDeleteWithCascade(userModel, where, registry);

      expect(query.text).toContain('BEGIN TRANSACTION');
      expect(query.text).toContain('DELETE FROM profile'); // Cascade
      // Uses NULL (not NONE) so the field can be queried with { field: null }
      expect(query.text).toContain('UPDATE post SET authorId = NULL'); // SetNull
      expect(query.text).toContain('COMMIT TRANSACTION');
    });
  });
});
