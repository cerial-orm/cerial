/**
 * E2E Tests: One-to-One @onDelete(NoAction)
 *
 * Schema: one-to-one-noaction.cerial
 * - UserNoAction: id, name, profile (Relation? @model)
 * - ProfileNoAction: id, bio?, userId (Record?), user (Relation? @field @onDelete(NoAction))
 *
 * Tests NoAction behavior - profile.userId becomes dangling reference.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E One-to-One @onDelete(NoAction)', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneNoAction);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('noaction behavior', () => {
    test('should leave dangling reference when user deleted', async () => {
      const user = await client.db.UserNoAction.create({
        data: { name: 'Will leave reference' },
      });

      const profile = await client.db.ProfileNoAction.create({
        data: {
          bio: 'Will have dangling ref',
          user: { connect: user.id },
        },
      });

      const originalUserId = user.id;

      // Delete user
      await client.db.UserNoAction.deleteMany({
        where: { id: user.id },
      });

      // Profile still exists with original userId (now dangling)
      const profileAfter = await client.db.ProfileNoAction.findOne({
        where: { id: profile.id },
      });

      expect(profileAfter).toBeDefined();
      expect(profileAfter?.userId?.equals(originalUserId)).toBe(true);
      // userId points to non-existent record
    });

    test('should not modify other profiles', async () => {
      const user1 = await client.db.UserNoAction.create({
        data: { name: 'User 1' },
      });
      const user2 = await client.db.UserNoAction.create({
        data: { name: 'User 2' },
      });

      await client.db.ProfileNoAction.create({
        data: { bio: 'Profile 1', user: { connect: user1.id } },
      });
      const profile2 = await client.db.ProfileNoAction.create({
        data: { bio: 'Profile 2', user: { connect: user2.id } },
      });

      // Delete user1 only
      await client.db.UserNoAction.deleteMany({
        where: { id: user1.id },
      });

      // profile2 should be unaffected
      const profile2After = await client.db.ProfileNoAction.findOne({
        where: { id: profile2.id },
      });
      expect(profile2After?.userId?.equals(user2.id)).toBe(true);

      // user2 should still exist
      expect(await client.db.UserNoAction.findOne({ where: { id: user2.id } })).toBeDefined();
    });
  });

  describe('include with dangling reference', () => {
    test('should return null for include when user is deleted', async () => {
      const user = await client.db.UserNoAction.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileNoAction.create({
        data: { bio: 'Profile', user: { connect: user.id } },
      });

      // Delete user
      await client.db.UserNoAction.deleteMany({
        where: { id: user.id },
      });

      // Include should return null (user doesn't exist)
      const result = await client.db.ProfileNoAction.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result).toBeDefined();
      // userId still has the old value
      expect(result?.userId).toBeDefined();
      // But include returns null because user doesn't exist
      expect(result?.user).toBeNull();
    });
  });

  describe('querying dangling references', () => {
    test('should be able to find profiles with dangling references', async () => {
      const user = await client.db.UserNoAction.create({
        data: { name: 'User' },
      });

      await client.db.ProfileNoAction.create({
        data: { bio: 'Dangling', user: { connect: user.id } },
      });
      await client.db.ProfileNoAction.create({
        data: { bio: 'Orphan' }, // No user
      });

      const danglingUserId = user.id;

      // Delete user
      await client.db.UserNoAction.deleteMany({
        where: { id: user.id },
      });

      // Can still query by the dangling userId
      const dangling = await client.db.ProfileNoAction.findMany({
        where: { userId: danglingUserId },
      });

      expect(dangling).toHaveLength(1);
      expect(dangling[0]?.bio).toBe('Dangling');
    });
  });

  describe('cleanup dangling references', () => {
    test('should allow manual cleanup of dangling references', async () => {
      const user = await client.db.UserNoAction.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileNoAction.create({
        data: { bio: 'Profile', user: { connect: user.id } },
      });

      const danglingUserId = user.id;

      // Delete user
      await client.db.UserNoAction.deleteMany({
        where: { id: user.id },
      });

      // Manual cleanup - set userId to null
      await client.db.ProfileNoAction.updateMany({
        where: { userId: danglingUserId },
        data: { userId: null },
      });

      const cleaned = await client.db.ProfileNoAction.findOne({
        where: { id: profile.id },
      });
      expect(cleaned?.userId).toBeNull();
    });
  });
});
