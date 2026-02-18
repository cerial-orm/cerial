/**
 * E2E Tests: One-to-One Required - Include Operations
 *
 * Schema: one-to-one-required.cerial
 * Tests including related records from both sides of 1-1 relation.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../../test-helper';

describe('E2E One-to-One Required: Include', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneRequired);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToOneRequired);
  });

  describe('include from PK side (Profile -> User)', () => {
    test('should include user when querying profile', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test bio',
          user: { connect: user.id },
        },
      });

      // Query profile with user included
      const result = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result).toBeDefined();
      expect(result?.user).toBeDefined();
      expect(result?.user?.id?.equals(user.id)).toBe(true);
      expect(result?.user?.name).toBe('Test User');
    });

    test('should include user with select', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test bio',
          user: { connect: user.id },
        },
      });

      // Include user with specific fields
      const result = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
        include: {
          user: {
            select: { name: true },
          },
        },
      });

      expect(result?.user).toBeDefined();
      expect(result?.user?.name).toBe('Test User');
      // Email should not be included if select is respected
    });
  });

  describe('include from non-PK side (User -> Profile)', () => {
    test('should include profile when querying user', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      await client.db.ProfileRequired.create({
        data: {
          bio: 'User profile',
          avatarUrl: 'https://example.com/avatar.png',
          user: { connect: user.id },
        },
      });

      // Query user with profile included
      const result = await client.db.UserRequired.findOne({
        where: { id: user.id },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result?.profile).toBeDefined();
      expect(result?.profile?.bio).toBe('User profile');
      expect(result?.profile?.avatarUrl).toBe('https://example.com/avatar.png');
    });

    test('should return null profile when user has no profile', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'No Profile' },
      });

      const result = await client.db.UserRequired.findOne({
        where: { id: user.id },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result?.profile).toBeNull();
    });
  });

  describe('include in findMany', () => {
    test('should include relations for multiple profiles', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      await client.db.ProfileRequired.create({
        data: { bio: 'Bio 1', user: { connect: user1.id } },
      });
      await client.db.ProfileRequired.create({
        data: { bio: 'Bio 2', user: { connect: user2.id } },
      });

      const profiles = await client.db.ProfileRequired.findMany({
        include: { user: true },
      });

      expect(profiles).toHaveLength(2);
      expect(profiles[0]?.user).toBeDefined();
      expect(profiles[1]?.user).toBeDefined();
    });

    test('should include relations for multiple users', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const _user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      await client.db.ProfileRequired.create({
        data: { bio: 'Bio 1', user: { connect: user1.id } },
      });
      // user2 has no profile

      const users = await client.db.UserRequired.findMany({
        include: { profile: true },
        orderBy: { name: 'asc' },
      });

      expect(users).toHaveLength(2);
      expect(users[0]?.profile).toBeDefined();
      expect(users[0]?.profile?.bio).toBe('Bio 1');
      expect(users[1]?.profile).toBeNull();
    });
  });

  describe('nested include', () => {
    test('should support nested includes (profile -> user -> profile)', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Nested User' },
      });

      await client.db.ProfileRequired.create({
        data: { bio: 'Nested bio', user: { connect: user.id } },
      });

      // Include user which includes profile (circular)
      const result = await client.db.ProfileRequired.findOne({
        where: { userId: user.id },
        include: {
          user: {
            include: { profile: true },
          },
        },
      });

      expect(result?.user?.profile).toBeDefined();
      expect(result?.user?.profile?.bio).toBe('Nested bio');
    });
  });
});
