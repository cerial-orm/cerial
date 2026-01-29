/**
 * E2E Tests for CRUD Operations
 *
 * Tests the generated client against a real SurrealDB instance.
 * The client is generated from test.schema before these tests run.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  SurrealClient,
  testConfig,
} from './test-client';

describe('E2E CRUD Operations', () => {
  let client: SurrealClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client);
  });

  afterEach(async () => {
    await client.disconnect();
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

      // ID is auto-generated (format may include table prefix like 'user:xxx' or just 'xxx')
      expect(user.id).toBeDefined();
      expect(typeof user.id).toBe('string');
      expect(user.id.length).toBeGreaterThan(0);
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

      expect(user.id).toBe('user:custom123');
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
    let testUserId: string;

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
      expect(result?.id).toBe(testUserId);
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
  });
});
