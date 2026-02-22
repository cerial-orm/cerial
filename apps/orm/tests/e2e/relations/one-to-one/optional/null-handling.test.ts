/**
 * E2E Tests: One-to-One Optional - Null Handling
 *
 * Schema: one-to-one-optional.cerial
 * Tests null dereference safety for optional relations.
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

describe('E2E One-to-One Optional: Null Handling', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneOptional);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToOneOptional);
  });

  describe('null userId', () => {
    test('should handle profile with null userId', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Null user' },
      });

      expect(profile.userId).toBeNull();

      // Query should return the profile
      const found = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
      });
      expect(found?.userId).toBeNull();
    });

    test('should query profiles where userId is null', async () => {
      await client.db.ProfileOptional.create({
        data: { bio: 'Orphan 1' },
      });
      await client.db.ProfileOptional.create({
        data: { bio: 'Orphan 2' },
      });

      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });
      await client.db.ProfileOptional.create({
        data: { bio: 'Has user', user: { connect: user.id } },
      });

      // Find orphan profiles
      const orphans = await client.db.ProfileOptional.findMany({
        where: { userId: null },
      });

      expect(orphans).toHaveLength(2);
    });

    test('should query profiles where userId is not null', async () => {
      await client.db.ProfileOptional.create({
        data: { bio: 'Orphan' },
      });

      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });
      await client.db.ProfileOptional.create({
        data: { bio: 'Connected', user: { connect: user.id } },
      });

      // Find connected profiles
      const connected = await client.db.ProfileOptional.findMany({
        where: { userId: { not: null } },
      });

      expect(connected).toHaveLength(1);
      expect(connected[0]?.bio).toBe('Connected');
    });
  });

  describe('include null relation', () => {
    test('should safely include null user without error', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'No user' },
      });

      // Should not throw
      const result = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result).toBeDefined();
      expect(result?.user).toBeNull();
    });

    test('should safely include null profile without error', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'No profile' },
      });

      // Should not throw
      const result = await client.db.UserOptional.findOne({
        where: { id: user.id },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result?.profile).toBeNull();
    });
  });

  describe('filter by null relation', () => {
    test('should filter by user relation being null', async () => {
      await client.db.ProfileOptional.create({
        data: { bio: 'Has no user' },
      });

      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });
      await client.db.ProfileOptional.create({
        data: { bio: 'Has user', user: { connect: user.id } },
      });

      // Filter where user relation is null
      const noUser = await client.db.ProfileOptional.findMany({
        where: {
          user: null,
        },
      });

      expect(noUser).toHaveLength(1);
      expect(noUser[0]?.bio).toBe('Has no user');
    });
  });

  describe('dangling reference after delete', () => {
    test('should have dangling reference when user deleted (NoAction default)', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'Will be deleted' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Linked',
          user: { connect: user.id },
        },
      });

      // Delete user - without @onDelete decorator, default is SetNull
      await client.db.UserOptional.deleteMany({
        where: { id: user.id },
      });

      // Profile still exists but userId is now null (SetNull default)
      const result = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      // SetNull: userId is set to null
      expect(result?.userId).toBeNull();
      // User include returns null because userId is null
      expect(result?.user).toBeNull();
    });
  });

  describe('update with null', () => {
    test('should allow setting userId to null', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Connected',
          user: { connect: user.id },
        },
      });

      // Set to null
      const updated = await client.db.ProfileOptional.updateMany({
        where: { id: profile.id },
        data: { userId: null },
      });

      expect(updated[0]?.userId).toBeNull();
    });
  });
});
