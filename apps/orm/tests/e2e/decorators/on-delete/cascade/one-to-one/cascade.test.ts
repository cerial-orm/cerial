/**
 * E2E Tests: One-to-One @onDelete(Cascade)
 *
 * Schema: one-to-one-cascade.cerial
 * - UserCascade: id, name, profile (Relation? @model)
 * - ProfileCascade: id, bio?, userId (Record?), user (Relation? @field @onDelete(Cascade))
 *
 * Tests cascade delete behavior for optional 1-1 with @onDelete(Cascade).
 * Profile is deleted when user is deleted (even though FK is optional).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('E2E One-to-One @onDelete(Cascade)', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneCascade);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToOneCascade);
  });

  describe('cascade behavior', () => {
    test('should delete profile when user is deleted', async () => {
      const user = await client.db.UserCascade.create({
        data: { name: 'Will cascade' },
      });

      const profile = await client.db.ProfileCascade.create({
        data: {
          bio: 'Will be deleted',
          user: { connect: user.id },
        },
      });

      // Verify both exist
      expect(await client.db.UserCascade.findOne({ where: { id: user.id } })).toBeDefined();
      expect(await client.db.ProfileCascade.findOne({ where: { id: profile.id } })).toBeDefined();

      // Delete user
      await client.db.UserCascade.deleteMany({
        where: { id: user.id },
      });

      // User gone
      const userAfter = await client.db.UserCascade.findOne({
        where: { id: user.id },
      });
      expect(userAfter).toBeNull();

      // Profile also gone (cascaded even though FK was optional)
      const profileAfter = await client.db.ProfileCascade.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter).toBeNull();
    });

    test('should cascade delete even when profile created without connect', async () => {
      const user = await client.db.UserCascade.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileCascade.create({
        data: {
          bio: 'Direct userId',
          userId: user.id,
        },
      });

      // Delete user
      await client.db.UserCascade.deleteMany({
        where: { id: user.id },
      });

      // Profile should be cascaded
      const profileAfter = await client.db.ProfileCascade.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter).toBeNull();
    });
  });

  describe('no cascade for orphans', () => {
    test('should not affect orphan profiles when user deleted', async () => {
      const user = await client.db.UserCascade.create({
        data: { name: 'User' },
      });

      // Create connected profile
      const connectedProfile = await client.db.ProfileCascade.create({
        data: { bio: 'Connected', user: { connect: user.id } },
      });

      // Create orphan profile (not connected to any user)
      const orphanProfile = await client.db.ProfileCascade.create({
        data: { bio: 'Orphan' },
      });

      // Delete user
      await client.db.UserCascade.deleteMany({
        where: { id: user.id },
      });

      // Connected profile gone
      expect(
        await client.db.ProfileCascade.findOne({
          where: { id: connectedProfile.id },
        }),
      ).toBeNull();

      // Orphan profile still exists
      expect(
        await client.db.ProfileCascade.findOne({
          where: { id: orphanProfile.id },
        }),
      ).toBeDefined();
    });
  });

  describe('delete many cascade', () => {
    test('should cascade delete all related profiles', async () => {
      const user1 = await client.db.UserCascade.create({
        data: { name: 'User 1' },
      });
      const user2 = await client.db.UserCascade.create({
        data: { name: 'User 2' },
      });

      await client.db.ProfileCascade.create({
        data: { bio: 'Profile 1', user: { connect: user1.id } },
      });
      await client.db.ProfileCascade.create({
        data: { bio: 'Profile 2', user: { connect: user2.id } },
      });

      // Delete all users
      await client.db.UserCascade.deleteMany({
        where: { name: { contains: 'User' } },
      });

      // All profiles should be gone
      const profiles = await client.db.ProfileCascade.findMany({});
      expect(profiles).toHaveLength(0);
    });
  });

  describe('delete profile directly', () => {
    test('should delete profile without affecting user', async () => {
      const user = await client.db.UserCascade.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileCascade.create({
        data: { bio: 'Profile', user: { connect: user.id } },
      });

      // Delete profile directly
      await client.db.ProfileCascade.deleteMany({
        where: { id: profile.id },
      });

      // Profile gone
      expect(await client.db.ProfileCascade.findOne({ where: { id: profile.id } })).toBeNull();

      // User still exists
      expect(await client.db.UserCascade.findOne({ where: { id: user.id } })).toBeDefined();
    });
  });
});
