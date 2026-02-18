/**
 * E2E Tests: One-to-One Required - Delete Operations
 *
 * Schema: one-to-one-required.cerial
 * Tests delete behavior for required 1-1 relations.
 * Note: Required relations auto-cascade on delete (profiles are deleted with user).
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

describe('E2E One-to-One Required: Delete', () => {
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

  describe('delete user cascades to profile (required relation)', () => {
    test('should delete user and cascade delete profile', async () => {
      // Create user with profile
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Will be cascade deleted',
          user: { connect: user.id },
        },
      });

      // Verify both exist
      expect(await client.db.UserRequired.findOne({ where: { id: user.id } })).toBeDefined();
      expect(await client.db.ProfileRequired.findOne({ where: { id: profile.id } })).toBeDefined();

      // Delete user
      await client.db.UserRequired.deleteMany({
        where: { id: user.id },
      });

      // User should be gone
      const userAfter = await client.db.UserRequired.findOne({
        where: { id: user.id },
      });
      expect(userAfter).toBeNull();

      // Profile should also be gone (cascade delete for required relations)
      const profileAfter = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter).toBeNull();
    });

    test('should cascade delete profiles when user deleted', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      // Create profile
      await client.db.ProfileRequired.create({
        data: {
          bio: 'Profile',
          user: { connect: user.id },
        },
      });

      // Delete user
      await client.db.UserRequired.deleteMany({
        where: { id: user.id },
      });

      // Profile should be cascade deleted (required relation)
      const profiles = await client.db.ProfileRequired.findMany({
        where: { userId: user.id },
      });
      expect(profiles).toHaveLength(0);
    });
  });

  describe('delete profile only', () => {
    test('should delete profile without affecting user', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'To be deleted',
          user: { connect: user.id },
        },
      });

      // Delete profile only
      await client.db.ProfileRequired.deleteMany({
        where: { id: profile.id },
      });

      // Profile should be gone
      const profileAfter = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter).toBeNull();

      // User should still exist
      const userAfter = await client.db.UserRequired.findOne({
        where: { id: user.id },
      });
      expect(userAfter).toBeDefined();
      expect(userAfter?.name).toBe('Test User');
    });
  });

  describe('delete user with no profile', () => {
    test('should delete user that has no profile', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'No Profile User' },
      });

      // Delete user (no cascade needed)
      await client.db.UserRequired.deleteMany({
        where: { id: user.id },
      });

      const userAfter = await client.db.UserRequired.findOne({
        where: { id: user.id },
      });
      expect(userAfter).toBeNull();
    });
  });

  describe('delete many', () => {
    test('should delete multiple users and cascade delete their profiles', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      await client.db.ProfileRequired.create({
        data: { bio: 'Profile 1', user: { connect: user1.id } },
      });
      await client.db.ProfileRequired.create({
        data: { bio: 'Profile 2', user: { connect: user2.id } },
      });

      // Delete all users
      await client.db.UserRequired.deleteMany({
        where: { name: { contains: 'User' } },
      });

      // All users gone
      const users = await client.db.UserRequired.findMany({});
      expect(users).toHaveLength(0);

      // Profiles should also be gone (cascade delete for required relations)
      const profiles = await client.db.ProfileRequired.findMany({});
      expect(profiles).toHaveLength(0);
    });
  });
});
