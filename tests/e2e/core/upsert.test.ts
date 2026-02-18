/**
 * E2E Tests for Upsert Operations
 *
 * Tests the generated client's upsert method against a real SurrealDB instance.
 * The client is generated from test schemas before these tests run.
 *
 * Upsert uses two strategies:
 * - WHERE-based (unique field / non-unique): UPSERT SET with IF $this == NONE
 * - ID-based: Transaction with explicit CREATE / UPDATE branches
 *
 * `create` is required. `update` is optional.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  ROOT_TABLES,
  testConfig,
  truncateTables,
} from '../test-helper';

describe('E2E Upsert Operations', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ROOT_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ROOT_TABLES);
  });

  // ==========================================================================
  // Unique field upsert (WHERE-based) — create path
  // ==========================================================================

  describe('unique field upsert — create path', () => {
    test('creates a new record when no match exists', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'john@test.com' },
        create: { name: 'John', email: 'john@test.com', isActive: true },
        update: { name: 'John Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('John');
      expect(result!.email).toBe('john@test.com');
      expect(result!.isActive).toBe(true);
      expect(isCerialId(result!.id)).toBe(true);
    });

    test('sets all create fields when creating', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'new@test.com' },
        create: {
          name: 'New User',
          email: 'new@test.com',
          isActive: true,
          age: 30,
        },
        update: { name: 'Should Not Be Used' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('New User');
      expect(result!.email).toBe('new@test.com');
      expect(result!.isActive).toBe(true);
      expect(result!.age).toBe(30);
    });

    test('update-only fields are absent (NONE) when creating', async () => {
      // name is in both, age is only in update
      const result = await client.db.User.upsert({
        where: { email: 'create-noupdate@test.com' },
        create: {
          name: 'Created',
          email: 'create-noupdate@test.com',
          isActive: true,
        },
        update: { name: 'Updated', age: 99 },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Created');
      // age is only in update, so on create path it should be NONE (absent)
      expect(result!.age).toBeUndefined();
    });
  });

  // ==========================================================================
  // Unique field upsert (WHERE-based) — update path
  // ==========================================================================

  describe('unique field upsert — update path', () => {
    test('updates an existing record when match exists', async () => {
      await client.db.User.create({
        data: { name: 'John', email: 'john@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { email: 'john@test.com' },
        create: {
          name: 'Should Not See',
          email: 'john@test.com',
          isActive: false,
        },
        update: { name: 'John Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('John Updated');
      expect(result!.email).toBe('john@test.com');
      // isActive should be preserved from existing (true), not from create (false)
      expect(result!.isActive).toBe(true);
    });

    test('preserves create-only fields on update (existing values kept)', async () => {
      await client.db.User.create({
        data: { name: 'John', email: 'john@test.com', isActive: true, age: 25 },
      });

      // age is only in create, not in update
      const result = await client.db.User.upsert({
        where: { email: 'john@test.com' },
        create: {
          name: 'New',
          email: 'john@test.com',
          isActive: true,
          age: 99,
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated');
      // age should be preserved from existing record (25), not overwritten with create value (99)
      expect(result!.age).toBe(25);
    });

    test('updates multiple fields on update path', async () => {
      await client.db.User.create({
        data: { name: 'John', email: 'john@test.com', isActive: true, age: 25 },
      });

      const result = await client.db.User.upsert({
        where: { email: 'john@test.com' },
        create: { name: 'New', email: 'john@test.com', isActive: true },
        update: { name: 'Updated', age: 30 },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated');
      expect(result!.age).toBe(30);
    });

    test('same record ID is preserved after update', async () => {
      const created = await client.db.User.create({
        data: { name: 'John', email: 'john@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { email: 'john@test.com' },
        create: { name: 'New', email: 'john@test.com', isActive: true },
        update: { name: 'Updated' },
      });

      expect(result!.id.equals(created.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Create-only (no update data)
  // ==========================================================================

  describe('create-only (no update)', () => {
    test('creates when record does not exist', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'createonly@test.com' },
        create: {
          name: 'Create Only',
          email: 'createonly@test.com',
          isActive: true,
        },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Create Only');
      expect(result!.email).toBe('createonly@test.com');
    });

    test('returns existing record unchanged when it already exists', async () => {
      await client.db.User.create({
        data: {
          name: 'Original',
          email: 'existing@test.com',
          isActive: true,
          age: 42,
        },
      });

      const result = await client.db.User.upsert({
        where: { email: 'existing@test.com' },
        create: {
          name: 'Should Not See',
          email: 'existing@test.com',
          isActive: false,
        },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Original');
      expect(result!.isActive).toBe(true);
      expect(result!.age).toBe(42);
    });
  });

  // ==========================================================================
  // ID-based upsert (transaction) — create path
  // ==========================================================================

  describe('ID-based upsert — create path', () => {
    test('creates a new record with specific ID', async () => {
      const result = await client.db.User.upsert({
        where: { id: 'user:testid1' },
        create: { name: 'ID User', email: 'id@test.com', isActive: true },
        update: { name: 'Updated ID User' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('ID User');
      expect(result!.email).toBe('id@test.com');
    });

    test('sets all create fields when creating by ID', async () => {
      const result = await client.db.User.upsert({
        where: { id: 'user:idfull' },
        create: {
          name: 'Full Create',
          email: 'idfull@test.com',
          isActive: true,
          age: 28,
        },
        update: { name: 'Nope' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Full Create');
      expect(result!.age).toBe(28);
    });
  });

  // ==========================================================================
  // ID-based upsert (transaction) — update path
  // ==========================================================================

  describe('ID-based upsert — update path', () => {
    test('updates existing record with matching ID', async () => {
      await client.db.User.create({
        data: {
          id: 'user:testid2',
          name: 'Original',
          email: 'original@test.com',
          isActive: true,
        },
      });

      const result = await client.db.User.upsert({
        where: { id: 'user:testid2' },
        create: {
          name: 'Should Not See',
          email: 'nope@test.com',
          isActive: false,
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated');
      expect(result!.email).toBe('original@test.com');
    });

    test('preserves non-updated fields on update path by ID', async () => {
      await client.db.User.create({
        data: {
          id: 'user:preserve',
          name: 'Original',
          email: 'preserve@test.com',
          isActive: true,
          age: 33,
        },
      });

      const result = await client.db.User.upsert({
        where: { id: 'user:preserve' },
        create: { name: 'New', email: 'new@test.com', isActive: true },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated');
      expect(result!.age).toBe(33);
      expect(result!.email).toBe('preserve@test.com');
    });
  });

  // ==========================================================================
  // ID-based create-only (no update)
  // ==========================================================================

  describe('ID-based create-only', () => {
    test('creates when record does not exist by ID', async () => {
      const result = await client.db.User.upsert({
        where: { id: 'user:idcreateonly' },
        create: {
          name: 'ID Create Only',
          email: 'idcreateonly@test.com',
          isActive: true,
        },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('ID Create Only');
    });

    test('returns existing record unchanged when it exists by ID', async () => {
      await client.db.User.create({
        data: {
          id: 'user:idexists',
          name: 'Existing',
          email: 'idexists@test.com',
          isActive: true,
        },
      });

      const result = await client.db.User.upsert({
        where: { id: 'user:idexists' },
        create: {
          name: 'Should Not See',
          email: 'nope@test.com',
          isActive: false,
        },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Existing');
      expect(result!.isActive).toBe(true);
    });
  });

  // ==========================================================================
  // Return options — WHERE-based (unique)
  // ==========================================================================

  describe('return options — WHERE-based (unique)', () => {
    test('default (undefined) returns the upserted record on create', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'ret@test.com' },
        create: { name: 'Return Test', email: 'ret@test.com', isActive: true },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Return Test');
    });

    test('explicit after returns the upserted record', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'ret2@test.com' },
        create: { name: 'After Test', email: 'ret2@test.com', isActive: true },
        update: { name: 'Updated' },
        return: 'after',
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('After Test');
    });

    test('return before returns null for new records (WHERE-based)', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'before@test.com' },
        create: {
          name: 'Before Test',
          email: 'before@test.com',
          isActive: true,
        },
        update: { name: 'Updated' },
        return: 'before',
      });

      expect(result).toBeNull();
    });

    test('return before returns previous state for existing records (WHERE-based)', async () => {
      await client.db.User.create({
        data: { name: 'Original', email: 'before2@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { email: 'before2@test.com' },
        create: { name: 'Nope', email: 'before2@test.com', isActive: false },
        update: { name: 'Updated' },
        return: 'before',
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Original');
    });

    test('return true returns boolean', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'bool@test.com' },
        create: { name: 'Bool Test', email: 'bool@test.com', isActive: true },
        update: { name: 'Updated' },
        return: true,
      });

      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    test('return true returns boolean for existing record', async () => {
      await client.db.User.create({
        data: { name: 'Existing', email: 'boolexist@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { email: 'boolexist@test.com' },
        create: { name: 'New', email: 'boolexist@test.com', isActive: true },
        update: { name: 'Updated' },
        return: true,
      });

      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // Return options — ID-based
  // ==========================================================================

  describe('return options — ID-based', () => {
    test('return before returns null for new record (ID-based)', async () => {
      const result = await client.db.User.upsert({
        where: { id: 'user:beforeid' },
        create: {
          name: 'Before ID',
          email: 'beforeid@test.com',
          isActive: true,
        },
        update: { name: 'Updated' },
        return: 'before',
      });

      expect(result).toBeNull();
    });

    test('return before returns previous state for existing record (ID-based)', async () => {
      await client.db.User.create({
        data: {
          id: 'user:beforeid2',
          name: 'Original',
          email: 'beforeid2@test.com',
          isActive: true,
        },
      });

      const result = await client.db.User.upsert({
        where: { id: 'user:beforeid2' },
        create: { name: 'Nope', email: 'nope@test.com', isActive: false },
        update: { name: 'Updated' },
        return: 'before',
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Original');
    });

    test('return true returns boolean for ID-based create', async () => {
      const result = await client.db.User.upsert({
        where: { id: 'user:boolid' },
        create: { name: 'Bool ID', email: 'boolid@test.com', isActive: true },
        update: { name: 'Updated' },
        return: true,
      });

      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    test('return true returns boolean for ID-based update', async () => {
      await client.db.User.create({
        data: {
          id: 'user:boolidexist',
          name: 'Existing',
          email: 'boolidexist@test.com',
          isActive: true,
        },
      });

      const result = await client.db.User.upsert({
        where: { id: 'user:boolidexist' },
        create: { name: 'New', email: 'new@test.com', isActive: true },
        update: { name: 'Updated' },
        return: true,
      });

      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    test('default return for ID-based create returns the record', async () => {
      const result = await client.db.User.upsert({
        where: { id: 'user:iddefault' },
        create: {
          name: 'ID Default',
          email: 'iddefault@test.com',
          isActive: true,
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('ID Default');
    });
  });

  // ==========================================================================
  // Select
  // ==========================================================================

  describe('select', () => {
    test('returns only selected fields on create path', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'select@test.com' },
        create: {
          name: 'Select Test',
          email: 'select@test.com',
          isActive: true,
          age: 25,
        },
        update: { name: 'Updated' },
        select: { id: true, name: true },
      });

      expect(result).toBeDefined();
      expect(result!.id).toBeDefined();
      expect(result!.name).toBe('Select Test');
      expect((result as any).email).toBeUndefined();
    });

    test('returns only selected fields on update path', async () => {
      await client.db.User.create({
        data: { name: 'Original', email: 'selectup@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { email: 'selectup@test.com' },
        create: { name: 'New', email: 'selectup@test.com', isActive: true },
        update: { name: 'Updated' },
        select: { id: true, name: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated');
      expect((result as any).email).toBeUndefined();
    });

    test('returns only selected fields for ID-based', async () => {
      const result = await client.db.User.upsert({
        where: { id: 'user:selectid' },
        create: {
          name: 'Select ID',
          email: 'selectid@test.com',
          isActive: true,
        },
        update: { name: 'Updated' },
        select: { id: true, name: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Select ID');
      expect((result as any).email).toBeUndefined();
    });
  });

  // ==========================================================================
  // Include
  // ==========================================================================

  describe('include', () => {
    test('includes related records in upsert result (update path)', async () => {
      const user = await client.db.User.create({
        data: {
          name: 'With Profile',
          email: 'profile@test.com',
          isActive: true,
        },
      });

      const profile = await client.db.Profile.create({
        data: { bio: 'Bio', userId: user.id },
      });

      await client.db.User.updateUnique({
        where: { id: user.id },
        data: { profileId: profile.id },
      });

      const result = await client.db.User.upsert({
        where: { email: 'profile@test.com' },
        create: { name: 'Not This', email: 'profile@test.com', isActive: true },
        update: { name: 'Updated With Profile' },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated With Profile');
      expect(result!.profile).toBeDefined();
      expect(result!.profile!.bio).toBe('Bio');
    });
  });

  // ==========================================================================
  // Non-unique where (array return)
  // ==========================================================================

  describe('non-unique where (array return)', () => {
    test('returns array for non-unique where with matching records', async () => {
      await client.db.User.create({
        data: { name: 'Alice', email: 'alice@test.com', isActive: true },
      });
      await client.db.User.create({
        data: { name: 'Bob', email: 'bob@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { isActive: true },
        create: { name: 'New', email: 'new@test.com', isActive: true },
        update: { name: 'Bulk Updated' },
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]!.name).toBe('Bulk Updated');
      expect(result[1]!.name).toBe('Bulk Updated');
    });

    test('creates new record for non-unique where with no matches', async () => {
      const result = await client.db.User.upsert({
        where: { isActive: false },
        create: { name: 'Fresh', email: 'fresh@test.com', isActive: false },
        update: { name: 'Updated' },
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]!.name).toBe('Fresh');
    });

    test('non-unique where with return before returns array', async () => {
      await client.db.User.create({
        data: { name: 'Alice', email: 'alice2@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { isActive: true },
        create: { name: 'New', email: 'new2@test.com', isActive: true },
        update: { name: 'Updated' },
        return: 'before',
      });

      expect(Array.isArray(result)).toBe(true);
      // Should have the pre-update state
      if (result.length) {
        expect(result[0]!.name).toBe('Alice');
      }
    });

    test('non-unique where with return true returns boolean', async () => {
      await client.db.User.create({
        data: { name: 'Alice', email: 'alice3@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { isActive: true },
        create: { name: 'New', email: 'new3@test.com', isActive: true },
        update: { name: 'Updated' },
        return: true,
      });

      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    test('non-unique where with select returns selected fields', async () => {
      await client.db.User.create({
        data: { name: 'Alice', email: 'alice4@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { isActive: true },
        create: { name: 'New', email: 'new4@test.com', isActive: true },
        update: { name: 'Updated' },
        select: { id: true, name: true },
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.name).toBe('Updated');
      expect((result[0] as any).email).toBeUndefined();
    });
  });

  // ==========================================================================
  // $transaction support
  // ==========================================================================

  describe('$transaction support', () => {
    test('works with $transaction for multiple upserts', async () => {
      const [user1, user2] = await client.$transaction([
        client.db.User.upsert({
          where: { email: 'txn1@test.com' },
          create: {
            name: 'Txn User 1',
            email: 'txn1@test.com',
            isActive: true,
          },
          update: { name: 'Updated 1' },
        }),
        client.db.User.upsert({
          where: { email: 'txn2@test.com' },
          create: {
            name: 'Txn User 2',
            email: 'txn2@test.com',
            isActive: true,
          },
          update: { name: 'Updated 2' },
        }),
      ]);

      expect(user1).toBeDefined();
      expect(user1!.name).toBe('Txn User 1');
      expect(user2).toBeDefined();
      expect(user2!.name).toBe('Txn User 2');
    });

    test('works with $transaction mixing upsert and other operations', async () => {
      const [user, count] = await client.$transaction([
        client.db.User.upsert({
          where: { email: 'txnmix@test.com' },
          create: { name: 'Txn Mix', email: 'txnmix@test.com', isActive: true },
          update: { name: 'Updated' },
        }),
        client.db.User.count(),
      ]);

      expect(user).toBeDefined();
      expect(typeof count).toBe('number');
    });
  });

  // ==========================================================================
  // Auto-populated fields
  // ==========================================================================

  describe('auto-populated fields', () => {
    test('createdAt is auto-populated on create path', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'autopop@test.com' },
        create: { name: 'Auto Pop', email: 'autopop@test.com', isActive: true },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.createdAt).toBeDefined();
    });

    test('array fields default to empty array on create path', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'arrays@test.com' },
        create: {
          name: 'Array User',
          email: 'arrays@test.com',
          isActive: true,
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result!.nicknames)).toBe(true);
      expect(result!.nicknames.length).toBe(0);
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('error handling', () => {
    test('throws on invalid create data (missing required field)', async () => {
      await expect(
        (async () => {
          await client.db.User.upsert({
            where: { email: 'invalid@test.com' },
            // @ts-expect-error - Testing runtime validation: missing required 'isActive' field
            create: { name: 'Invalid', email: 'invalid@test.com' },
            update: { name: 'Updated' },
          });
        })(),
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // CerialId mapping
  // ==========================================================================

  describe('CerialId mapping', () => {
    test('returned id is a CerialId instance', async () => {
      const result = await client.db.User.upsert({
        where: { email: 'cerialid@test.com' },
        create: {
          name: 'CerialId Test',
          email: 'cerialid@test.com',
          isActive: true,
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(isCerialId(result!.id)).toBe(true);
      expect(result!.id.table).toBe('user');
    });

    test('returned id on update is still a CerialId', async () => {
      await client.db.User.create({
        data: { name: 'Original', email: 'cerialid2@test.com', isActive: true },
      });

      const result = await client.db.User.upsert({
        where: { email: 'cerialid2@test.com' },
        create: { name: 'New', email: 'cerialid2@test.com', isActive: true },
        update: { name: 'Updated' },
      });

      expect(isCerialId(result!.id)).toBe(true);
    });
  });
});
