/**
 * Unit tests for delete-builder.ts
 *
 * Tests delete query generation including cascade behavior.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import {
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildDeleteUniqueWithCascade,
  buildDeleteWithCascade,
} from '../../../src/query/builders/delete-builder';

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
    test('uses SetNone by default for optional relations without @onDelete', () => {
      const { ast } = parse(schemaNoOnDelete);
      const registry = astToRegistry(ast);
      const userModel = registry.User!;

      const where = { id: 'user:123' };
      const query = buildDeleteWithCascade(userModel, where, registry);

      // Optional non-@nullable relations without @onDelete default to SetNone behavior
      // This means a transaction is used to clear the FK reference (set to NONE/absent)
      expect(query.text).toContain('BEGIN TRANSACTION');
      expect(query.text).toContain('LET $to_delete = (SELECT id FROM user');
      expect(query.text).toContain('UPDATE profile SET userId = NONE WHERE userId IN $to_delete.id');
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

  describe('transactionMode', () => {
    describe('buildDeleteWithCascade', () => {
      test('default (no flag) wraps in BEGIN/COMMIT', () => {
        const { ast } = parse(schemaCascade);
        const registry = astToRegistry(ast);
        const userModel = registry.User!;

        const where = { id: 'user:123' };
        const query = buildDeleteWithCascade(userModel, where, registry);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });

      test('transactionMode=true omits BEGIN/COMMIT but preserves cascade statements', () => {
        const { ast } = parse(schemaCascade);
        const registry = astToRegistry(ast);
        const userModel = registry.User!;

        const where = { id: 'user:123' };
        const query = buildDeleteWithCascade(userModel, where, registry, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('LET $to_delete = (SELECT id FROM user');
        expect(query.text).toContain('DELETE FROM profile WHERE userId IN $to_delete.id');
        expect(query.text).toContain('DELETE FROM user');
        expect(query.text).toContain('RETURN BEFORE');
      });

      test('transactionMode=true preserves multiple cascade actions', () => {
        const { ast } = parse(schemaMultipleDeps);
        const registry = astToRegistry(ast);
        const userModel = registry.User!;

        const where = { id: 'user:123' };
        const query = buildDeleteWithCascade(userModel, where, registry, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('DELETE FROM profile');
        expect(query.text).toContain('UPDATE post SET authorId = NULL');
        expect(query.text).toContain('DELETE FROM user');
        expect(query.text).toContain('RETURN BEFORE');
      });

      test('transactionMode=false wraps in BEGIN/COMMIT', () => {
        const { ast } = parse(schemaCascade);
        const registry = astToRegistry(ast);
        const userModel = registry.User!;

        const where = { id: 'user:123' };
        const query = buildDeleteWithCascade(userModel, where, registry, false);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });
    });

    describe('buildDeleteUniqueWithCascade', () => {
      test('transactionMode=true omits BEGIN/COMMIT but preserves cascade statements', () => {
        const { ast } = parse(schemaCascade);
        const registry = astToRegistry(ast);
        const userModel = registry.User!;

        const where = { id: 'user:123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, true, true);

        expect(query.text).not.toContain('BEGIN TRANSACTION');
        expect(query.text).not.toContain('COMMIT TRANSACTION');
        expect(query.text).toContain('LET $to_delete');
        expect(query.text).toContain('DELETE FROM profile WHERE userId IN $to_delete');
        expect(query.text).toContain('DELETE $deleteId RETURN BEFORE');
      });

      test('transactionMode=false wraps in BEGIN/COMMIT', () => {
        const { ast } = parse(schemaCascade);
        const registry = astToRegistry(ast);
        const userModel = registry.User!;

        const where = { id: 'user:123' };
        const query = buildDeleteUniqueWithCascade(userModel, where, registry, true, false);

        expect(query.text).toContain('BEGIN TRANSACTION');
        expect(query.text).toContain('COMMIT TRANSACTION');
      });
    });
  });
});
