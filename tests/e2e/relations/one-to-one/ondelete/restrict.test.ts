/**
 * E2E Tests: One-to-One @onDelete(Restrict)
 *
 * Schema: one-to-one-restrict.cerial
 * - UserRestrict: id, name, profile (Relation? @model)
 * - ProfileRestrict: id, bio?, userId (Record?), user (Relation? @field @onDelete(Restrict))
 *
 * Tests restrict delete behavior - error when trying to delete user with profile.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E One-to-One @onDelete(Restrict)', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneRestrict);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('restrict behavior', () => {
    test('should error when deleting user that has profile', async () => {
      const user = await client.db.UserRestrict.create({
        data: { name: 'Protected' },
      });

      await client.db.ProfileRestrict.create({
        data: {
          bio: 'Protector',
          user: { connect: user.id },
        },
      });

      // Attempting to delete user should fail
      await expect(
        (async () => {
          await client.db.UserRestrict.deleteMany({
            where: { id: user.id },
          });
        })(),
      ).rejects.toThrow();

      // User should still exist
      const userAfter = await client.db.UserRestrict.findOne({
        where: { id: user.id },
      });
      expect(userAfter).toBeDefined();
    });

    test('should allow deleting user without profile', async () => {
      const user = await client.db.UserRestrict.create({
        data: { name: 'No profile' },
      });

      // Should succeed - no profile to restrict
      await client.db.UserRestrict.deleteMany({
        where: { id: user.id },
      });

      const userAfter = await client.db.UserRestrict.findOne({
        where: { id: user.id },
      });
      expect(userAfter).toBeNull();
    });
  });

  describe('delete profile first', () => {
    test('should allow deleting user after profile is deleted', async () => {
      const user = await client.db.UserRestrict.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileRestrict.create({
        data: {
          bio: 'Will be deleted first',
          user: { connect: user.id },
        },
      });

      // Delete profile first
      await client.db.ProfileRestrict.deleteMany({
        where: { id: profile.id },
      });

      // Now user can be deleted
      await client.db.UserRestrict.deleteMany({
        where: { id: user.id },
      });

      expect(await client.db.UserRestrict.findOne({ where: { id: user.id } })).toBeNull();
    });

    test('should allow deleting user after profile is disconnected', async () => {
      const user = await client.db.UserRestrict.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileRestrict.create({
        data: {
          bio: 'Will be disconnected',
          user: { connect: user.id },
        },
      });

      // Disconnect profile from user
      await client.db.ProfileRestrict.updateMany({
        where: { id: profile.id },
        data: { user: { disconnect: true } },
      });

      // Now user can be deleted
      await client.db.UserRestrict.deleteMany({
        where: { id: user.id },
      });

      expect(await client.db.UserRestrict.findOne({ where: { id: user.id } })).toBeNull();

      // Profile still exists as orphan
      const profileAfter = await client.db.ProfileRestrict.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter).toBeDefined();
      expect(profileAfter?.userId).toBeNull();
    });
  });

  describe('delete many with restrict', () => {
    test('should fail deleteMany if any user has profile', async () => {
      const user1 = await client.db.UserRestrict.create({
        data: { name: 'User 1' },
      });
      const user2 = await client.db.UserRestrict.create({
        data: { name: 'User 2' },
      });

      // Only user1 has profile
      await client.db.ProfileRestrict.create({
        data: { bio: 'Profile', user: { connect: user1.id } },
      });

      // DeleteMany should fail because user1 has profile
      await expect(
        (async () => {
          await client.db.UserRestrict.deleteMany({
            where: { name: { contains: 'User' } },
          });
        })(),
      ).rejects.toThrow();

      // Both users should still exist
      const users = await client.db.UserRestrict.findMany({});
      expect(users).toHaveLength(2);
    });
  });

  describe('delete profile directly', () => {
    test('should allow deleting profile (no reverse restriction)', async () => {
      const user = await client.db.UserRestrict.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileRestrict.create({
        data: {
          bio: 'Profile',
          user: { connect: user.id },
        },
      });

      // Deleting profile should work (restriction is only on user deletion)
      await client.db.ProfileRestrict.deleteMany({
        where: { id: profile.id },
      });

      expect(await client.db.ProfileRestrict.findOne({ where: { id: profile.id } })).toBeNull();
    });
  });
});
