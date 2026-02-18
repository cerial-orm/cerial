/**
 * E2E Tests for SELECT functionality
 *
 * Tests selecting specific fields from query results.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialClient, cleanupTables, createTestClient, truncateTables, testConfig, ROOT_TABLES } from './test-helper';

describe('E2E Select', () => {
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

  describe('Basic select', () => {
    test('should select specific fields from create result', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBeDefined();
      expect(user?.email).toBe('test@example.com');
      // Fields not selected should be undefined (cast to test runtime)
      expect((user as Record<string, unknown>)?.name).toBeUndefined();
      expect((user as Record<string, unknown>)?.isActive).toBeUndefined();
    });

    test('should select specific fields from findOne result', async () => {
      const created = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      const user = await client.db.User.findOne({
        where: { id: created.id },
        select: {
          id: true,
          name: true,
        },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBeDefined();
      expect(user?.name).toBe('Test User');
      expect((user as Record<string, unknown>)?.email).toBeUndefined();
    });

    test('should select specific fields from findMany result', async () => {
      await client.db.User.create({
        data: { email: 'user1@example.com', name: 'User 1', isActive: true },
      });
      await client.db.User.create({
        data: { email: 'user2@example.com', name: 'User 2', isActive: false },
      });

      const users = await client.db.User.findMany({
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      });

      expect(users).toHaveLength(2);
      users.forEach((user) => {
        expect(user.id).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.isActive).toBeDefined();
        expect((user as Record<string, unknown>).name).toBeUndefined();
      });
    });

    test('should select specific fields from updateMany result', async () => {
      const created = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: created.id },
        data: { name: 'Updated User' },
        select: {
          id: true,
          name: true,
        },
      });

      expect(updated).toHaveLength(1);
      expect(updated[0]?.id).toBeDefined();
      expect(updated[0]?.name).toBe('Updated User');
      expect((updated[0] as Record<string, unknown>)?.email).toBeUndefined();
    });
  });

  describe('Select with arrays', () => {
    test('should select array fields', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          nicknames: ['nick1', 'nick2'],
          scores: [100, 95],
        },
        select: {
          id: true,
          nicknames: true,
          scores: true,
        },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBeDefined();
      expect(user?.nicknames).toEqual(['nick1', 'nick2']);
      expect(user?.scores).toEqual([100, 95]);
      expect((user as Record<string, unknown>)?.email).toBeUndefined();
    });
  });

  describe('Select with Record fields', () => {
    test('should select Record field', async () => {
      const profile = await client.db.Profile.create({
        data: { bio: 'Test bio', userId: 'user:temp' },
      });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          profileId: profile.id,
        },
        select: {
          id: true,
          profileId: true,
        },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBeDefined();
      expect(user?.profileId?.equals(profile.id)).toBe(true);
      expect((user as Record<string, unknown>)?.email).toBeUndefined();
    });

    test('should select Record[] field', async () => {
      const tag1 = await client.db.Tag.create({ data: { name: 'tag1' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'tag2' } });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tagIds: [tag1.id, tag2.id],
        },
        select: {
          id: true,
          tagIds: true,
        },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBeDefined();
      expect(user?.tagIds).toHaveLength(2);
      expect((user as Record<string, unknown>)?.email).toBeUndefined();
    });
  });

  describe('Select all fields', () => {
    test('should return all fields when no select is provided', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          nicknames: ['nick1'],
          scores: [100],
        },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBeDefined();
      expect(user?.email).toBe('test@example.com');
      expect(user?.name).toBe('Test User');
      expect(user?.isActive).toBe(true);
      expect(user?.nicknames).toEqual(['nick1']);
      expect(user?.scores).toEqual([100]);
    });
  });

  describe('Select with findUnique', () => {
    test('should select specific fields from findUnique result', async () => {
      const created = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      const user = await client.db.User.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          email: true,
        },
      });

      expect(user).toBeDefined();
      expect(user?.id.equals(created.id)).toBe(true);
      expect(user?.email).toBe('test@example.com');
      expect((user as Record<string, unknown>)?.name).toBeUndefined();
    });

    test('should select specific fields when finding by unique email', async () => {
      await client.db.User.create({
        data: {
          email: 'unique@example.com',
          name: 'Unique User',
          isActive: true,
        },
      });

      const user = await client.db.User.findUnique({
        where: { email: 'unique@example.com' },
        select: {
          id: true,
          name: true,
        },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBeDefined();
      expect(user?.name).toBe('Unique User');
      expect((user as Record<string, unknown>)?.email).toBeUndefined();
    });
  });
});
