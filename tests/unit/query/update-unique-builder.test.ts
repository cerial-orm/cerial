/**
 * Unit tests for updateUnique query builders
 *
 * Tests UPDATE ONLY/UPDATE query generation for single record updates.
 */

import { describe, expect, test } from 'bun:test';
import { buildUpdateUniqueQuery } from '../../../src/query/builders/update-builder';
import { getRecordIdFromWhere } from '../../../src/query/builders/delete-builder';
import { parse } from '../../../src/parser/parser';
import { astToRegistry } from '../../../src/parser/model-metadata';

// Schema with unique fields
const schemaBasic = `
model User {
  id String @id
  email Email @unique
  name String
  age Int?
}
`;

// Schema with relations for include testing
const schemaWithRelations = `
model User {
  id String @id
  email Email @unique
  name String
  profileId Record?
  profile Relation? @field(profileId) @model(Profile)
}

model Profile {
  id String @id
  bio String?
  userId Record?
  user Relation? @field(userId) @model(User)
}
`;

describe('update-unique-builder', () => {
  describe('buildUpdateUniqueQuery - ID based', () => {
    const { ast } = parse(schemaBasic);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('generates UPDATE ONLY with ID', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John' };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('SET name = $name_set_0');
      expect(query.text).toContain('RETURN *');
      expect(query.vars.name_set_0).toBe('John');
    });

    test('generates UPDATE ONLY with RETURN BEFORE', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John' };
      const query = buildUpdateUniqueQuery(userModel, where, data, 'before');

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('SET name = $name_set_0');
      expect(query.text).toContain('RETURN BEFORE');
    });

    test('generates UPDATE ONLY without explicit RETURN for boolean mode', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John' };
      const query = buildUpdateUniqueQuery(userModel, where, data, true);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('SET name = $name_set_0');
      expect(query.text).not.toContain('RETURN');
    });

    test('generates UPDATE ONLY with select fields', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John' };
      const select = { id: true, name: true };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined, select);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('RETURN id, name');
    });

    test('handles multiple data fields', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John', age: 30 };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('SET name = $name_set_0, age = $age_set_1');
      expect(query.vars.name_set_0).toBe('John');
      expect(query.vars.age_set_1).toBe(30);
    });

    test('handles ID with special characters', () => {
      const where = { id: 'user-with-dashes' };
      const data = { name: 'John' };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('user:⟨user-with-dashes⟩');
    });
  });

  describe('buildUpdateUniqueQuery - ID with additional WHERE fields', () => {
    const { ast } = parse(schemaBasic);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('generates UPDATE ONLY with ID and additional WHERE clause', () => {
      const where = { id: 'abc123', email: 'test@example.com' };
      const data = { name: 'John' };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('SET name = $name_set_0');
      expect(query.text).toContain('WHERE email = $email_eq_0');
      expect(query.vars.email_eq_0).toBe('test@example.com');
    });

    test('generates UPDATE ONLY with ID and non-unique WHERE fields', () => {
      const where = { id: 'abc123', name: 'ExistingName' };
      const data = { name: 'NewName' };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('WHERE name = $name_eq_0');
      expect(query.vars.name_eq_0).toBe('ExistingName');
    });

    test('generates UPDATE ONLY with ID, unique, and non-unique WHERE fields', () => {
      const where = { id: 'abc123', email: 'test@example.com', name: 'ExistingName' };
      const data = { age: 25 };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('SET age = $age_set_0');
      expect(query.text).toMatch(/WHERE.*email.*AND.*name|WHERE.*name.*AND.*email/);
    });
  });

  describe('buildUpdateUniqueQuery - unique field (no ID)', () => {
    const { ast } = parse(schemaBasic);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('generates UPDATE with WHERE clause for unique email', () => {
      const where = { email: 'test@example.com' };
      const data = { name: 'John' };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      // Should NOT use UPDATE ONLY since no ID
      expect(query.text).toContain('UPDATE user');
      expect(query.text).not.toContain('UPDATE ONLY');
      expect(query.text).toContain('SET name = $name_set_0');
      expect(query.text).toContain('WHERE email = $email_eq_0');
      expect(query.vars.email_eq_0).toBe('test@example.com');
    });

    test('generates UPDATE with unique + non-unique WHERE fields', () => {
      const where = { email: 'test@example.com', name: 'ExistingName' };
      const data = { age: 30 };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('UPDATE user');
      expect(query.text).toContain('SET age = $age_set_0');
      expect(query.text).toMatch(/WHERE.*email.*AND.*name|WHERE.*name.*AND.*email/);
    });

    test('generates UPDATE with RETURN BEFORE for unique field lookup', () => {
      const where = { email: 'test@example.com' };
      const data = { name: 'John' };
      const query = buildUpdateUniqueQuery(userModel, where, data, 'before');

      expect(query.text).toContain('UPDATE user');
      expect(query.text).toContain('RETURN BEFORE');
    });
  });

  describe('buildUpdateUniqueQuery - with relations (include)', () => {
    const { ast } = parse(schemaWithRelations);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('generates UPDATE with include fields', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John' };
      const include = { profile: true };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined, undefined, include, registry);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('RETURN *, profileId.* AS profile');
    });

    test('generates UPDATE with select and include', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John' };
      const select = { id: true, name: true };
      const include = { profile: true };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined, select, include, registry);

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('RETURN id, name, profileId.* AS profile');
    });

    test('ignores include for RETURN BEFORE mode', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John' };
      const include = { profile: true };
      const query = buildUpdateUniqueQuery(userModel, where, data, 'before', undefined, include, registry);

      // 'before' mode ignores include
      expect(query.text).toContain('RETURN BEFORE');
      expect(query.text).not.toContain('profileId');
    });
  });

  describe('buildUpdateUniqueQuery - null handling', () => {
    const { ast } = parse(schemaBasic);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('handles null for optional fields', () => {
      const where = { id: 'abc123' };
      const data = { age: null };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('SET age = $age_set_0');
      expect(query.vars.age_set_0).toBeNull();
    });

    test('skips undefined values', () => {
      const where = { id: 'abc123' };
      const data = { name: 'John', age: undefined };
      const query = buildUpdateUniqueQuery(userModel, where, data, undefined);

      expect(query.text).toContain('SET name = $name_set_0');
      expect(query.text).not.toContain('age');
      expect(query.vars.age_set_0).toBeUndefined();
    });
  });

  describe('getRecordIdFromWhere - for updateUnique', () => {
    const { ast } = parse(schemaBasic);
    const registry = astToRegistry(ast);
    const userModel = registry.User!;

    test('extracts ID from where clause', () => {
      const where = { id: 'abc123' };
      const result = getRecordIdFromWhere(where, userModel, 'updateUnique');

      expect(result.hasId).toBe(true);
      expect(result.id).toBe('abc123');
    });

    test('identifies non-ID unique field', () => {
      const where = { email: 'test@example.com' };
      const result = getRecordIdFromWhere(where, userModel, 'updateUnique');

      expect(result.hasId).toBe(false);
      expect(result.idFieldName).toBe('email');
    });

    test('throws when no unique field provided', () => {
      const where = { name: 'Test' };

      expect(() => getRecordIdFromWhere(where, userModel, 'updateUnique')).toThrow(
        /At least one unique field must be provided.*updateUnique/,
      );
    });

    test('prefers ID over other unique fields', () => {
      const where = { id: 'abc123', email: 'test@example.com' };
      const result = getRecordIdFromWhere(where, userModel, 'updateUnique');

      expect(result.hasId).toBe(true);
      expect(result.id).toBe('abc123');
    });
  });
});
