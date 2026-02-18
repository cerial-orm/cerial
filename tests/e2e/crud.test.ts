/**
 * E2E Tests for CRUD Operations
 *
 * Tests the generated client against a real SurrealDB instance.
 * The client is generated from test.schema before these tests run.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId, isCerialId } from 'cerial';
import { cleanupTables, createTestClient, truncateTables, CerialClient, testConfig, ROOT_TABLES } from './test-helper';

describe('E2E CRUD Operations', () => {
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

  describe('Create', () => {
    test('should create a user with required fields', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.isActive).toBe(true);
    });

    test('should create a user with optional fields', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          age: 25,
        },
      });

      expect(user).toBeDefined();
      expect(user.age).toBe(25);
    });

    test('should create with auto-generated id', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      // ID is auto-generated as CerialId with table 'user'
      expect(user.id).toBeDefined();
      expect(isCerialId(user.id)).toBe(true);
      expect(user.id.table).toBe('user');
      expect(user.id.id.length).toBeGreaterThan(0);
    });

    test('should create with custom id', async () => {
      const user = await client.db.User.create({
        data: {
          id: 'user:custom123',
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      expect(user.id.toString()).toBe('user:custom123');
      expect(user.id.id).toBe('custom123');
    });

    test('should default array fields to empty arrays', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      expect(user.nicknames).toEqual([]);
      expect(user.scores).toEqual([]);
      expect(user.tagIds).toEqual([]);
    });

    test('should create with array fields populated', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          nicknames: ['nick1', 'nick2'],
          scores: [100, 95],
        },
      });

      expect(user.nicknames).toEqual(['nick1', 'nick2']);
      expect(user.scores).toEqual([100, 95]);
    });
  });

  describe('Read', () => {
    beforeEach(async () => {
      await client.db.User.create({
        data: { email: 'user1@example.com', name: 'User 1', isActive: true },
      });
      await client.db.User.create({
        data: { email: 'user2@example.com', name: 'User 2', isActive: false },
      });
      await client.db.User.create({
        data: { email: 'user3@example.com', name: 'User 3', age: 30, isActive: true },
      });
    });

    test('should find all users', async () => {
      const results = await client.db.User.findMany();
      expect(results.length).toBe(3);
    });

    test('should find users with where clause', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: true },
      });
      expect(results.length).toBe(2);
    });

    test('should find one user', async () => {
      const result = await client.db.User.findOne({
        where: { email: 'user1@example.com' },
      });
      expect(result).toBeDefined();
      expect(result?.email).toBe('user1@example.com');
    });

    test('should return null when findOne finds nothing', async () => {
      const result = await client.db.User.findOne({
        where: { email: 'nonexistent@example.com' },
      });
      expect(result).toBeNull();
    });

    test('should find with orderBy', async () => {
      const results = await client.db.User.findMany({
        orderBy: { name: 'desc' },
      });
      expect(results.length).toBe(3);
      expect(results[0]?.name).toBe('User 3');
    });

    test('should find with limit', async () => {
      const results = await client.db.User.findMany({
        limit: 2,
      });
      expect(results.length).toBe(2);
    });

    test('should find with offset', async () => {
      const results = await client.db.User.findMany({
        orderBy: { name: 'asc' },
        offset: 1,
      });
      expect(results.length).toBe(2);
      expect(results[0]?.name).toBe('User 2');
    });

    test('should use complex where clause', async () => {
      const results = await client.db.User.findMany({
        where: { age: { gt: 25 } },
      });
      expect(results.length).toBe(1);
      expect(results[0]?.age).toBe(30);
    });

    test('should use AND in where clause', async () => {
      const results = await client.db.User.findMany({
        where: {
          AND: [{ isActive: true }, { name: 'User 1' }],
        },
      });
      expect(results.length).toBe(1);
    });

    test('should use OR in where clause', async () => {
      const results = await client.db.User.findMany({
        where: {
          OR: [{ name: 'User 1' }, { name: 'User 2' }],
        },
      });
      expect(results.length).toBe(2);
    });
  });

  describe('FindUnique', () => {
    let testUserId: CerialId<string>;

    beforeEach(async () => {
      const user = await client.db.User.create({
        data: {
          email: 'unique@example.com',
          name: 'Unique User',
          isActive: true,
        },
      });
      testUserId = user.id;
    });

    test('should find user by id', async () => {
      const result = await client.db.User.findUnique({
        where: { id: testUserId },
      });
      expect(result).toBeDefined();
      expect(result?.id.equals(testUserId)).toBe(true);
    });

    test('should find user by unique email', async () => {
      const result = await client.db.User.findUnique({
        where: { email: 'unique@example.com' },
      });
      expect(result).toBeDefined();
      expect(result?.email).toBe('unique@example.com');
    });

    test('should return null when not found', async () => {
      const result = await client.db.User.findUnique({
        where: { email: 'nonexistent@example.com' },
      });
      expect(result).toBeNull();
    });
  });

  describe('Update', () => {
    beforeEach(async () => {
      await client.db.User.create({
        data: {
          email: 'update@example.com',
          name: 'Update User',
          isActive: true,
          age: 25,
        },
      });
    });

    test('should update user fields', async () => {
      const results = await client.db.User.updateMany({
        where: { email: 'update@example.com' },
        data: { name: 'Updated', age: 35 },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('Updated');
      expect(results[0]!.age).toBe(35);
    });

    test('should return empty array when no users match', async () => {
      const results = await client.db.User.updateMany({
        where: { email: 'nonexistent@example.com' },
        data: { name: 'No Match' },
      });
      expect(results.length).toBe(0);
    });
  });

  describe('Delete', () => {
    beforeEach(async () => {
      await client.db.User.create({
        data: { email: 'delete1@example.com', name: 'Delete 1', isActive: true },
      });
      await client.db.User.create({
        data: { email: 'delete2@example.com', name: 'Delete 2', isActive: true },
      });
    });

    test('should delete matching users', async () => {
      const count = await client.db.User.deleteMany({
        where: { email: 'delete1@example.com' },
      });
      expect(count).toBe(1);

      const remaining = await client.db.User.findMany();
      expect(remaining.length).toBe(1);
    });

    test('should delete all matching users', async () => {
      const count = await client.db.User.deleteMany({
        where: { isActive: true },
      });
      expect(count).toBe(2);

      const remaining = await client.db.User.findMany();
      expect(remaining.length).toBe(0);
    });

    test('should return 0 when no users match', async () => {
      const count = await client.db.User.deleteMany({
        where: { email: 'nonexistent@example.com' },
      });
      expect(count).toBe(0);
    });
  });

  describe('Count', () => {
    beforeEach(async () => {
      await client.db.User.create({
        data: { email: 'count1@example.com', name: 'Count 1', isActive: true },
      });
      await client.db.User.create({
        data: { email: 'count2@example.com', name: 'Count 2', isActive: false },
      });
    });

    test('should count all users', async () => {
      const count = await client.db.User.count();
      expect(count).toBe(2);
    });

    test('should count with where clause', async () => {
      const count = await client.db.User.count({ isActive: true });
      expect(count).toBe(1);
    });

    test('should count with relation filter', async () => {
      // Create users with posts
      const userWithPosts = await client.db.User.create({
        data: { email: 'author@example.com', name: 'Author', isActive: true },
      });
      await client.db.User.create({
        data: { email: 'lurker@example.com', name: 'Lurker', isActive: true },
      });
      await client.db.Post.create({
        data: { title: 'Post 1', authorId: userWithPosts!.id },
      });
      await client.db.Post.create({
        data: { title: 'Post 2', authorId: userWithPosts!.id },
      });

      // Count users who have posts with a specific title
      const count = await client.db.User.count({
        posts: { some: { title: 'Post 1' } },
      });
      expect(count).toBe(1);

      // Count users who have any posts (no matching filter)
      const noMatch = await client.db.User.count({
        posts: { some: { title: 'Nonexistent' } },
      });
      expect(noMatch).toBe(0);
    });

    test('should return 0 when no records match', async () => {
      const count = await client.db.User.count({ name: 'Nobody' });
      expect(count).toBe(0);
    });
  });

  describe('Exists', () => {
    beforeEach(async () => {
      await client.db.User.create({
        data: { email: 'exists@example.com', name: 'Exists User', isActive: true },
      });
    });

    test('should return true when user exists', async () => {
      const exists = await client.db.User.exists({ email: 'exists@example.com' });
      expect(exists).toBe(true);
    });

    test('should return false when user does not exist', async () => {
      const exists = await client.db.User.exists({ email: 'nonexistent@example.com' });
      expect(exists).toBe(false);
    });

    test('should check existence with relation filter', async () => {
      const user = await client.db.User.create({
        data: { email: 'poster@example.com', name: 'Poster', isActive: true },
      });
      await client.db.Post.create({
        data: { title: 'My Post', authorId: user!.id },
      });

      // User with matching post exists
      const hasPostAuthor = await client.db.User.exists({
        posts: { some: { title: 'My Post' } },
      });
      expect(hasPostAuthor).toBe(true);

      // No user has a post with this title
      const hasNoMatch = await client.db.User.exists({
        posts: { some: { title: 'Nonexistent' } },
      });
      expect(hasNoMatch).toBe(false);
    });

    test('should work without where clause', async () => {
      const exists = await client.db.User.exists();
      expect(exists).toBe(true);
    });
  });

  describe('DeleteUnique', () => {
    let testUserId: CerialId<string>;

    beforeEach(async () => {
      const user = await client.db.User.create({
        data: {
          email: 'deleteunique@example.com',
          name: 'Delete Unique User',
          isActive: true,
          age: 25,
        },
      });
      testUserId = user.id;
    });

    describe('return: undefined (default)', () => {
      test('should return true when deleting by id', async () => {
        const result = await client.db.User.deleteUnique({
          where: { id: testUserId },
        });

        expect(result).toBe(true);

        // Verify deletion
        const found = await client.db.User.findUnique({ where: { id: testUserId } });
        expect(found).toBeNull();
      });

      test('should return true when deleting by unique email', async () => {
        const result = await client.db.User.deleteUnique({
          where: { email: 'deleteunique@example.com' },
        });

        expect(result).toBe(true);

        // Verify deletion
        const found = await client.db.User.findUnique({ where: { email: 'deleteunique@example.com' } });
        expect(found).toBeNull();
      });

      test('should return true even when record does not exist', async () => {
        const result = await client.db.User.deleteUnique({
          where: { id: 'nonexistent-id' },
        });

        // Default behavior: returns true (operation completed)
        expect(result).toBe(true);
      });
    });

    describe('return: true', () => {
      test('should return true when record existed', async () => {
        const result = await client.db.User.deleteUnique({
          where: { id: testUserId },
          return: true,
        });

        expect(result).toBe(true);
      });

      test('should return false when record did not exist', async () => {
        const result = await client.db.User.deleteUnique({
          where: { id: 'nonexistent-id' },
          return: true,
        });

        expect(result).toBe(false);
      });

      test('should return true when deleting by unique email', async () => {
        const result = await client.db.User.deleteUnique({
          where: { email: 'deleteunique@example.com' },
          return: true,
        });

        expect(result).toBe(true);
      });

      test('should return false when email does not exist', async () => {
        const result = await client.db.User.deleteUnique({
          where: { email: 'nonexistent@example.com' },
          return: true,
        });

        expect(result).toBe(false);
      });
    });

    describe("return: 'before'", () => {
      test('should return the deleted record when it existed', async () => {
        const result = await client.db.User.deleteUnique({
          where: { id: testUserId },
          return: 'before',
        });

        expect(result).toBeDefined();
        expect(result?.id.equals(testUserId)).toBe(true);
        expect(result?.email).toBe('deleteunique@example.com');
        expect(result?.name).toBe('Delete Unique User');
        expect(result?.age).toBe(25);
      });

      test('should return null when record did not exist', async () => {
        const result = await client.db.User.deleteUnique({
          where: { id: 'nonexistent-id' },
          return: 'before',
        });

        expect(result).toBeNull();
      });

      test('should return the deleted record when deleting by email', async () => {
        const result = await client.db.User.deleteUnique({
          where: { email: 'deleteunique@example.com' },
          return: 'before',
        });

        expect(result).toBeDefined();
        expect(result?.email).toBe('deleteunique@example.com');
      });
    });
  });

  describe('UpdateUnique', () => {
    let testUserId: CerialId<string>;

    beforeEach(async () => {
      const user = await client.db.User.create({
        data: {
          email: 'updateunique@example.com',
          name: 'Update Unique User',
          isActive: true,
          age: 25,
        },
      });
      testUserId = user.id;
    });

    describe('return: undefined (default)', () => {
      test('should return updated record when updating by id', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId },
          data: { name: 'Updated Name' },
        });

        expect(result).toBeDefined();
        expect(result?.id.equals(testUserId)).toBe(true);
        expect(result?.name).toBe('Updated Name');
        expect(result?.email).toBe('updateunique@example.com');
      });

      test('should return null when record does not exist', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: 'nonexistent-id' },
          data: { name: 'Updated Name' },
        });

        expect(result).toBeNull();
      });

      test('should update by unique email field', async () => {
        const result = await client.db.User.updateUnique({
          where: { email: 'updateunique@example.com' },
          data: { name: 'Updated via Email' },
        });

        expect(result).toBeDefined();
        expect(result?.name).toBe('Updated via Email');
        expect(result?.email).toBe('updateunique@example.com');
      });

      test('should update multiple fields', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId },
          data: { name: 'New Name', age: 30 },
        });

        expect(result).toBeDefined();
        expect(result?.name).toBe('New Name');
        expect(result?.age).toBe(30);
      });

      test('should update with id and additional where fields', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId, email: 'updateunique@example.com' },
          data: { name: 'Updated with Extra Where' },
        });

        expect(result).toBeDefined();
        expect(result?.name).toBe('Updated with Extra Where');
      });

      test('should return null when additional where fields do not match', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId, email: 'wrong@example.com' },
          data: { name: 'Should Not Update' },
        });

        expect(result).toBeNull();

        // Verify original data unchanged
        const found = await client.db.User.findUnique({ where: { id: testUserId } });
        expect(found?.name).toBe('Update Unique User');
      });
    });

    describe('return: true', () => {
      test('should return true when record existed and was updated', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId },
          data: { name: 'Updated' },
          return: true,
        });

        expect(result).toBe(true);

        // Verify update
        const found = await client.db.User.findUnique({ where: { id: testUserId } });
        expect(found?.name).toBe('Updated');
      });

      test('should return false when record does not exist', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: 'nonexistent-id' },
          data: { name: 'Should Not Update' },
          return: true,
        });

        expect(result).toBe(false);
      });

      test('should return true when updating by unique email', async () => {
        const result = await client.db.User.updateUnique({
          where: { email: 'updateunique@example.com' },
          data: { name: 'Updated via Email' },
          return: true,
        });

        expect(result).toBe(true);
      });

      test('should return false when email does not exist', async () => {
        const result = await client.db.User.updateUnique({
          where: { email: 'nonexistent@example.com' },
          data: { name: 'Should Not Update' },
          return: true,
        });

        expect(result).toBe(false);
      });
    });

    describe("return: 'before'", () => {
      test('should return pre-update state when record exists', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId },
          data: { name: 'New Name', age: 99 },
          return: 'before',
        });

        expect(result).toBeDefined();
        expect(result?.id.equals(testUserId)).toBe(true);
        expect(result?.name).toBe('Update Unique User'); // Old value
        expect(result?.age).toBe(25); // Old value

        // Verify update happened
        const found = await client.db.User.findUnique({ where: { id: testUserId } });
        expect(found?.name).toBe('New Name');
        expect(found?.age).toBe(99);
      });

      test('should return null when record does not exist', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: 'nonexistent-id' },
          data: { name: 'Should Not Update' },
          return: 'before',
        });

        expect(result).toBeNull();
      });

      test('should return pre-update state when updating by email', async () => {
        const result = await client.db.User.updateUnique({
          where: { email: 'updateunique@example.com' },
          data: { name: 'New Name' },
          return: 'before',
        });

        expect(result).toBeDefined();
        expect(result?.name).toBe('Update Unique User'); // Old value
      });
    });

    describe("return: 'after'", () => {
      test('should behave same as default - return updated record', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId },
          data: { name: 'After Mode Name' },
          return: 'after',
        });

        expect(result).toBeDefined();
        expect(result?.name).toBe('After Mode Name'); // New value
      });

      test('should return null when record does not exist', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: 'nonexistent-id' },
          data: { name: 'Should Not Update' },
          return: 'after',
        });

        expect(result).toBeNull();
      });
    });

    describe('with select', () => {
      test('should return only selected fields', async () => {
        const result = await client.db.User.updateUnique({
          where: { id: testUserId },
          data: { name: 'Selected Update' },
          select: { id: true, name: true },
        });

        expect(result).toBeDefined();
        expect(result?.id.equals(testUserId)).toBe(true);
        expect(result?.name).toBe('Selected Update');
        // Note: Other fields may or may not be present depending on implementation
      });
    });
  });
});
