/**
 * Unit tests for UPSERT query builders
 *
 * Tests SurrealQL output generation for upsert operations.
 * Two strategies:
 * - WHERE-based: Uses UPSERT SET with IF $this == NONE conditional logic
 * - ID-based: Uses transaction with explicit existence check
 *
 * `create` is always required. `update` is optional.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import {
  buildUpsertIdQuery,
  buildUpsertQuery,
  buildUpsertWhereQuery,
  buildUpsertWithNestedTransaction,
} from '../../../src/query/builders/upsert-builder';

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

const schemaBasic = `
model User {
  id Record @id
  email Email @unique
  name String
  age Int?
}
`;

const schemaNoUnique = `
model Post {
  id Record @id
  title String
  isPublished Bool?
}
`;

const schemaWithRelation = `
model Author {
  id Record @id
  email Email @unique
  name String
  profileId Record?
  profile Relation? @field(profileId) @model(AuthorProfile)
}

model AuthorProfile {
  id Record @id
  bio String?
  author Relation? @model(Author)
}
`;

const _schemaWithDefault = `
model Item {
  id Record @id
  sku String @unique
  name String
  quantity Int @default(0)
}
`;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function registryFor(schema: string) {
  const { ast } = parse(schema);

  return astToRegistry(ast);
}

// --------------------------------------------------------------------------
// WHERE-based upsert (unique field)
// --------------------------------------------------------------------------

describe('upsert-builder', () => {
  describe('WHERE-based upsert (unique field)', () => {
    const registry = registryFor(schemaBasic);
    const userModel = registry.User!;

    test('generates UPSERT ONLY with unique field where clause', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'John Updated' },
        true,
        undefined,
      );

      expect(query.text).toContain('UPSERT ONLY user');
      expect(query.text).toContain('WHERE');
      expect(query.text).toContain('email');
      expect(query.text).toContain('RETURN *');
    });

    test('generates IF $this == NONE for fields in both create and update', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John Create', email: 'john@test.com' },
        { name: 'John Update' },
        true,
        undefined,
      );

      expect(query.text).toContain('IF $this == NONE THEN');
      expect(query.text).toContain('ELSE');
      expect(query.text).toContain('END');
      // name should have conditional with both create and update refs
      expect(query.text).toMatch(/name = IF \$this == NONE THEN .+ ELSE .+ END/);
    });

    test('generates create-only field with ELSE fieldName (preserve existing)', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com', age: 25 },
        { name: 'Updated' }, // age not in update
        true,
        undefined,
      );

      // age is only in create: IF $this == NONE THEN $age_val ELSE age END
      expect(query.text).toMatch(/age = IF \$this == NONE THEN .+ ELSE age END/);
    });

    test('generates update-only field with ELSE NONE on create path', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { email: 'john@test.com' }, // name not in create
        { name: 'Updated Name' }, // name only in update
        true,
        undefined,
      );

      // name is only in update: IF $this == NONE THEN NONE ELSE $name_update END
      expect(query.text).toMatch(/name = IF \$this == NONE THEN NONE ELSE .+ END/);
    });

    test('binds create and update values as separate variables', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'Create Name' },
        { name: 'Update Name' },
        true,
        undefined,
      );

      const vars = Object.values(query.vars);
      expect(vars).toContain('Create Name');
      expect(vars).toContain('Update Name');
    });

    test('generates RETURN BEFORE when return option is before', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        true,
        'before',
      );

      expect(query.text).toContain('RETURN BEFORE');
    });

    test('generates no RETURN clause when return option is true', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        true,
        true,
      );

      expect(query.text).not.toContain('RETURN');
    });

    test('generates RETURN with select fields', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        true,
        undefined,
        { id: true, name: true },
      );

      expect(query.text).toContain('RETURN');
      expect(query.text).toContain('id');
      expect(query.text).toContain('name');
      expect(query.text).not.toContain('RETURN *');
    });

    test('explicit after returns with select fields (no RETURN AFTER)', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        true,
        'after',
        { id: true, name: true },
      );

      expect(query.text).not.toContain('RETURN AFTER');
      expect(query.text).toContain('RETURN');
      expect(query.text).toContain('id');
      expect(query.text).toContain('name');
    });

    test('default return (undefined) generates RETURN *', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        true,
        undefined,
      );

      expect(query.text).toContain('RETURN *');
    });

    test('multiple fields in create and update produce correct SET clause', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com', age: 30 },
        { name: 'Updated', age: 31 },
        true,
        undefined,
      );

      // Both name and age should have both-branch conditionals
      expect(query.text).toMatch(/name = IF \$this == NONE THEN .+ ELSE .+ END/);
      expect(query.text).toMatch(/age = IF \$this == NONE THEN .+ ELSE .+ END/);
      // email in create only
      expect(query.text).toMatch(/email = IF \$this == NONE THEN .+ ELSE email END/);
    });
  });

  // --------------------------------------------------------------------------
  // WHERE-based upsert (non-unique)
  // --------------------------------------------------------------------------

  describe('WHERE-based upsert (non-unique)', () => {
    const registry = registryFor(schemaNoUnique);
    const postModel = registry.Post!;

    test('generates UPSERT without ONLY for non-unique where', () => {
      const query = buildUpsertWhereQuery(
        postModel,
        { title: 'My Post' },
        { title: 'My Post' },
        { title: 'Updated Post' },
        false,
        undefined,
      );

      expect(query.text).toContain('UPSERT post');
      expect(query.text).not.toContain('UPSERT ONLY');
    });

    test('generates RETURN BEFORE for non-unique where', () => {
      const query = buildUpsertWhereQuery(
        postModel,
        { title: 'Test' },
        { title: 'Test' },
        { title: 'Updated' },
        false,
        'before',
      );

      expect(query.text).toContain('UPSERT post');
      expect(query.text).toContain('RETURN BEFORE');
    });

    test('generates no RETURN for return: true on non-unique', () => {
      const query = buildUpsertWhereQuery(
        postModel,
        { title: 'Test' },
        { title: 'Test' },
        { title: 'Updated' },
        false,
        true,
      );

      expect(query.text).toContain('UPSERT post');
      expect(query.text).not.toContain('RETURN');
    });

    test('generates RETURN with select for non-unique', () => {
      const query = buildUpsertWhereQuery(
        postModel,
        { title: 'Test' },
        { title: 'Test' },
        { title: 'Updated' },
        false,
        undefined,
        { id: true, title: true },
      );

      expect(query.text).toContain('RETURN');
      expect(query.text).toContain('id');
      expect(query.text).toContain('title');
    });
  });

  // --------------------------------------------------------------------------
  // ID-based upsert (transaction)
  // --------------------------------------------------------------------------

  describe('ID-based upsert (transaction)', () => {
    const registry = registryFor(schemaBasic);
    const userModel = registry.User!;

    test('generates transaction with BEGIN/COMMIT, existence check, IF/ELSE', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
      );

      expect(query.text).toContain('BEGIN TRANSACTION;');
      expect(query.text).toContain('LET $exists');
      expect(query.text).toContain('SELECT * FROM ONLY user:abc123');
      expect(query.text).toContain('IF $exists == NONE THEN');
      expect(query.text).toContain('CREATE ONLY user:abc123');
      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('COMMIT TRANSACTION;');
      expect(query.text).toContain('RETURN $result;');
    });

    test('generates CONTENT for create and SET for update in transaction', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
      );

      expect(query.text).toContain('CONTENT');
      expect(query.text).toContain('SET name =');
    });

    test('generates RETURN BEFORE with null for new records', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        'before',
      );

      expect(query.text).toContain('RETURN BEFORE');
      expect(query.text).toContain('RETURN IF $exists == NONE THEN null ELSE $result END');
    });

    test('handles ID with additional WHERE filters on update branch', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123', email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
      );

      expect(query.text).toContain('UPDATE ONLY user:abc123');
      expect(query.text).toContain('WHERE');
      expect(query.text).toContain('email');
    });

    test('uses SELECT when update data is empty (create-only)', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        {}, // empty update
        undefined,
      );

      // CREATE branch should exist
      expect(query.text).toContain('CREATE ONLY user:abc123');
      // Update branch should be a SELECT (return existing unchanged)
      expect(query.text).toMatch(/ELSE \(SELECT \* FROM ONLY user:abc123\)/);
    });

    test('return: true generates no explicit RETURN in sub-queries', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        true,
      );

      // No RETURN AFTER/BEFORE in the sub-statements
      expect(query.text).not.toContain('RETURN BEFORE');
      // Should still have the overall RETURN $result
      expect(query.text).toContain('RETURN $result;');
    });

    test('return: after generates RETURN with select fields in sub-queries', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        'after',
        { id: true, name: true },
      );

      expect(query.text).not.toContain('RETURN AFTER');
      expect(query.text).toContain('RETURN');
    });

    test('binds create data as CONTENT variable', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
      );

      // The CONTENT variable should contain the create data
      const contentVar = Object.entries(query.vars).find(
        ([_, v]) =>
          typeof v === 'object' && v !== null && 'name' in v && (v as Record<string, unknown>).name === 'John',
      );
      expect(contentVar).toBeDefined();
    });

    test('binds update data fields as separate variables', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated', age: 30 },
        undefined,
      );

      const vars = Object.values(query.vars);
      expect(vars).toContain('Updated');
      expect(vars).toContain(30);
    });

    test('multiple update fields produce multiple SET clauses', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated', age: 31 },
        undefined,
      );

      expect(query.text).toContain('SET name =');
      expect(query.text).toContain('age =');
    });
  });

  // --------------------------------------------------------------------------
  // buildUpsertQuery dispatching
  // --------------------------------------------------------------------------

  describe('buildUpsertQuery dispatching', () => {
    const registry = registryFor(schemaBasic);
    const userModel = registry.User!;

    test('dispatches to ID-based when where has id', () => {
      const query = buildUpsertQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
      );

      expect(query.text).toContain('BEGIN TRANSACTION;');
    });

    test('dispatches to WHERE-based with ONLY when where has unique field', () => {
      const query = buildUpsertQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
      );

      expect(query.text).toContain('UPSERT ONLY user');
      expect(query.text).not.toContain('BEGIN TRANSACTION');
    });

    test('dispatches to WHERE-based without ONLY for non-unique where', () => {
      const noUniqueRegistry = registryFor(schemaNoUnique);
      const postModel = noUniqueRegistry.Post!;

      const query = buildUpsertQuery(postModel, { title: 'Test' }, { title: 'Test' }, { title: 'Updated' }, undefined);

      expect(query.text).toContain('UPSERT post');
      expect(query.text).not.toContain('UPSERT ONLY');
    });

    test('passes through select/include/registry to sub-builders', () => {
      const query = buildUpsertQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
        { id: true, name: true },
      );

      expect(query.text).toContain('RETURN');
      expect(query.text).toContain('id');
      expect(query.text).toContain('name');
    });
  });

  // --------------------------------------------------------------------------
  // null and NONE handling
  // --------------------------------------------------------------------------

  describe('null and NONE handling', () => {
    const registry = registryFor(schemaBasic);
    const userModel = registry.User!;

    test('skips undefined values in create data', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com', age: undefined },
        { name: 'Updated' },
        true,
        undefined,
      );

      // age is undefined in both sides - should not appear
      expect(query.text).not.toContain('age =');
    });

    test('skips undefined values in update data', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated', age: undefined },
        true,
        undefined,
      );

      expect(query.text).not.toContain('age =');
    });

    test('null in optional field appears in SET clause', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com', age: null },
        { name: 'Updated' },
        true,
        undefined,
      );

      // age is null in create, not in update - should appear as create-only
      expect(query.text).toMatch(/age = IF \$this == NONE THEN .+ ELSE age END/);
    });
  });

  // --------------------------------------------------------------------------
  // create-only (no update)
  // --------------------------------------------------------------------------

  describe('create-only (no update data)', () => {
    const registry = registryFor(schemaBasic);
    const userModel = registry.User!;

    test('WHERE-based: all fields use ELSE fieldName', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        {}, // empty update
        true,
        undefined,
      );

      // All fields should be create-only: IF $this == NONE THEN $val ELSE fieldName END
      expect(query.text).toMatch(/name = IF \$this == NONE THEN .+ ELSE name END/);
      expect(query.text).toMatch(/email = IF \$this == NONE THEN .+ ELSE email END/);
    });

    test('WHERE-based: still produces UPSERT, not UPDATE', () => {
      const query = buildUpsertWhereQuery(
        userModel,
        { email: 'john@test.com' },
        { name: 'John', email: 'john@test.com' },
        {},
        true,
        undefined,
      );

      expect(query.text).toContain('UPSERT');
    });

    test('ID-based: uses SELECT for update branch when no update data', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        {},
        undefined,
      );

      expect(query.text).toContain('CREATE ONLY user:abc123');
      expect(query.text).toMatch(/ELSE \(SELECT \* FROM ONLY user:abc123\)/);
      expect(query.text).not.toContain('UPDATE');
    });

    test('ID-based create-only with return before: null for new, existing for found', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        {},
        'before',
      );

      expect(query.text).toContain('RETURN IF $exists == NONE THEN null ELSE $result END');
    });
  });

  // --------------------------------------------------------------------------
  // Relations
  // --------------------------------------------------------------------------

  describe('with relations', () => {
    const registry = registryFor(schemaWithRelation);
    const authorModel = registry.Author!;

    test('skips relation fields in SET clauses', () => {
      const query = buildUpsertWhereQuery(
        authorModel,
        { email: 'author@test.com' },
        { name: 'Author', email: 'author@test.com' },
        { name: 'Updated Author' },
        true,
        undefined,
      );

      expect(query.text).not.toContain('profile =');
      expect(query.text).toContain('name =');
    });

    test('skips relation fields in ID-based update SET clauses', () => {
      const query = buildUpsertIdQuery(
        authorModel,
        { id: 'abc123' },
        { name: 'Author', email: 'author@test.com' },
        { name: 'Updated Author' },
        undefined,
      );

      expect(query.text).not.toContain('profile =');
      expect(query.text).toContain('SET name =');
    });

    test('includes record (FK) fields in SET clauses', () => {
      const query = buildUpsertWhereQuery(
        authorModel,
        { email: 'author@test.com' },
        { name: 'Author', email: 'author@test.com', profileId: 'author_profile:123' },
        { profileId: 'author_profile:456' },
        true,
        undefined,
      );

      expect(query.text).toMatch(/profileId = IF \$this == NONE THEN .+ ELSE .+ END/);
    });

    test('generates RETURN with include (relation subquery)', () => {
      const query = buildUpsertWhereQuery(
        authorModel,
        { email: 'author@test.com' },
        { name: 'Author', email: 'author@test.com' },
        { name: 'Updated' },
        true,
        undefined,
        undefined,
        { profile: true },
        registry,
      );

      expect(query.text).toContain('RETURN');
      // Should contain a subquery for the relation
      expect(query.text).toContain('profile');
    });
  });

  // --------------------------------------------------------------------------
  // buildUpsertWithNestedTransaction
  // --------------------------------------------------------------------------

  describe('buildUpsertWithNestedTransaction', () => {
    const registry = registryFor(schemaWithRelation);
    const authorModel = registry.Author!;

    test('returns separate create and update queries', () => {
      const result = buildUpsertWithNestedTransaction(
        authorModel,
        { email: 'author@test.com' },
        { name: 'Author', email: 'author@test.com' },
        { name: 'Updated Author' },
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        registry,
      );

      expect(result.createQuery).toBeDefined();
      expect(result.createQuery.text).toBeDefined();
      expect(result.updateQuery).toBeDefined();
      expect(result.updateQuery.text).toBeDefined();
    });

    test('uses SELECT fallback for update when no update data or nested ops', () => {
      const result = buildUpsertWithNestedTransaction(
        authorModel,
        { email: 'author@test.com' },
        { name: 'Author', email: 'author@test.com' },
        {},
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        registry,
      );

      expect(result.updateQuery.text).toContain('SELECT');
    });
  });

  // --------------------------------------------------------------------------
  // Include with ID-based
  // --------------------------------------------------------------------------

  describe('ID-based with include', () => {
    const registry = registryFor(schemaWithRelation);
    const authorModel = registry.Author!;

    test('includes relation subquery in RETURN clause for create/update', () => {
      const query = buildUpsertIdQuery(
        authorModel,
        { id: 'abc123' },
        { name: 'Author', email: 'author@test.com' },
        { name: 'Updated' },
        undefined,
        undefined,
        { profile: true },
        registry,
      );

      expect(query.text).toContain('RETURN');
      expect(query.text).toContain('profile');
    });
  });

  // --------------------------------------------------------------------------
  // Edge: all return options for ID-based
  // --------------------------------------------------------------------------

  describe('ID-based return options', () => {
    const registry = registryFor(schemaBasic);
    const userModel = registry.User!;

    test('return undefined generates RETURN * and RETURN $result', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        undefined,
      );

      expect(query.text).toContain('RETURN *');
      expect(query.text).toContain('RETURN $result;');
    });

    test('return null treated same as undefined', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        null as any,
      );

      expect(query.text).toContain('RETURN *');
    });

    test('return before generates RETURN BEFORE and conditional null', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        'before',
      );

      expect(query.text).toContain('RETURN BEFORE');
      expect(query.text).toContain('RETURN IF $exists == NONE THEN null ELSE $result END');
    });

    test('return true generates no RETURN in sub-queries, RETURN $result at end', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        true,
      );

      expect(query.text).not.toContain('RETURN BEFORE');
      expect(query.text).not.toContain('RETURN AFTER');
      expect(query.text).toContain('RETURN $result;');
    });

    test('return after with select generates RETURN selected fields', () => {
      const query = buildUpsertIdQuery(
        userModel,
        { id: 'abc123' },
        { name: 'John', email: 'john@test.com' },
        { name: 'Updated' },
        'after',
        { id: true, name: true },
      );

      expect(query.text).not.toContain('RETURN AFTER');
      expect(query.text).toContain('RETURN');
      expect(query.text).toContain('id');
      expect(query.text).toContain('name');
    });
  });

  // --------------------------------------------------------------------------
  // Optional record field (null → NONE)
  // --------------------------------------------------------------------------

  describe('optional record field null handling', () => {
    const registry = registryFor(schemaWithRelation);
    const authorModel = registry.Author!;

    test('null on optional record field uses NONE in WHERE-based', () => {
      const query = buildUpsertWhereQuery(
        authorModel,
        { email: 'author@test.com' },
        { name: 'Author', email: 'author@test.com', profileId: null },
        { profileId: null },
        true,
        undefined,
      );

      // null for optional record should produce NONE
      expect(query.text).toContain('NONE');
    });

    test('null on optional record field uses NONE in ID-based update SET', () => {
      const query = buildUpsertIdQuery(
        authorModel,
        { id: 'abc123' },
        { name: 'Author', email: 'author@test.com' },
        { profileId: null },
        undefined,
      );

      expect(query.text).toContain('profileId = NONE');
    });
  });
});
