/**
 * E2E Tests: One-to-One Optional - Delete Operations
 *
 * Schema: one-to-one-optional.cerial
 * Tests delete behavior for optional 1-1 relations.
 * Note: Without @onDelete decorator, default is SetNull (clear the FK).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../../test-helper';

describe('E2E One-to-One Optional: Delete', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneOptional);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('SetNull default behavior', () => {
    test('should set profile.userId to null when user deleted', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'Will be deleted' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Will be orphaned',
          user: { connect: user.id },
        },
      });

      expect(profile.userId).toBe(user.id);

      // Delete user
      await client.db.UserOptional.deleteMany({
        where: { id: user.id },
      });

      // Profile still exists but userId is null (SetNull default)
      const profileAfter = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
      });

      expect(profileAfter).toBeDefined();
      // userId is set to null (SetNull default for optional relations)
      expect(profileAfter?.userId).toBeNull();
      expect(profileAfter?.bio).toBe('Will be orphaned');
    });

    test('should set userId to null when user deleted', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Profile',
          user: { connect: user.id },
        },
      });

      // Delete user
      await client.db.UserOptional.deleteMany({
        where: { id: user.id },
      });

      // Profile still exists with null userId
      const profiles = await client.db.ProfileOptional.findMany({
        where: { id: profile.id },
      });

      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.userId).toBeNull();
    });
  });

  describe('delete profile', () => {
    test('should delete profile without affecting user', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'To be deleted',
          user: { connect: user.id },
        },
      });

      // Delete profile
      await client.db.ProfileOptional.deleteMany({
        where: { id: profile.id },
      });

      // Profile should be gone
      const profileAfter = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter).toBeNull();

      // User should still exist
      const userAfter = await client.db.UserOptional.findOne({
        where: { id: user.id },
      });
      expect(userAfter).toBeDefined();
      expect(userAfter?.name).toBe('User');
    });
  });

  describe('delete many', () => {
    test('should set userId to null when multiple users deleted', async () => {
      const user1 = await client.db.UserOptional.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserOptional.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      await client.db.ProfileOptional.create({
        data: { bio: 'Profile 1', user: { connect: user1.id } },
      });
      await client.db.ProfileOptional.create({
        data: { bio: 'Profile 2', user: { connect: user2.id } },
      });

      // Delete all users
      await client.db.UserOptional.deleteMany({
        where: { name: { contains: 'User' } },
      });

      // All users gone
      const users = await client.db.UserOptional.findMany({});
      expect(users).toHaveLength(0);

      // Profiles still exist with null userId (SetNull default)
      const profiles = await client.db.ProfileOptional.findMany({});
      expect(profiles).toHaveLength(2);
      profiles.forEach((p) => {
        expect(p.userId).toBeNull();
      });
    });
  });
});
