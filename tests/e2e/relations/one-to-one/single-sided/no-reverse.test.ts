/**
 * E2E Tests: One-to-One Single-Sided - No Reverse Access
 *
 * Schema: one-to-one-single-sided.cerial
 * Tests that User has no profile accessor (single-sided).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../test-helper';

describe('E2E One-to-One Single-Sided: No Reverse', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneSingleSided);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToOneSingleSided);
  });

  describe('user has no profile field', () => {
    test('user model should not have profile relation', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      // User only has id and name - no profile
      expect(user.id).toBeDefined();
      expect(user.name).toBe('User');
      expect('profile' in user).toBe(false);
      expect('profileId' in user).toBe(false);
    });

    test('findOne on user should not have profile in result', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      const found = await client.db.UserSingleSided.findOne({
        where: { id: user.id },
      });

      expect(found).toBeDefined();
      expect(Object.keys(found!)).not.toContain('profile');
    });
  });

  describe('manual reverse query', () => {
    test('should find profiles by userId manually', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      await client.db.ProfileSingleSided.create({
        data: { bio: 'Profile 1', user: { connect: user.id } },
      });
      await client.db.ProfileSingleSided.create({
        data: { bio: 'Profile 2', user: { connect: user.id } },
      });

      // Manual query to find profiles for user
      const profiles = await client.db.ProfileSingleSided.findMany({
        where: { userId: user.id },
      });

      expect(profiles).toHaveLength(2);
    });

    test('should find if user has any profile via manual query', async () => {
      const userWithProfile = await client.db.UserSingleSided.create({
        data: { name: 'Has Profile' },
      });
      const userWithoutProfile = await client.db.UserSingleSided.create({
        data: { name: 'No Profile' },
      });

      await client.db.ProfileSingleSided.create({
        data: { bio: 'Profile', user: { connect: userWithProfile.id } },
      });

      // Check if user has profile
      const profilesForUser1 = await client.db.ProfileSingleSided.findMany({
        where: { userId: userWithProfile.id },
      });
      expect(profilesForUser1.length).toBeGreaterThan(0);

      const profilesForUser2 = await client.db.ProfileSingleSided.findMany({
        where: { userId: userWithoutProfile.id },
      });
      expect(profilesForUser2.length).toBe(0);
    });
  });

  describe('no nested operations from user side', () => {
    test('user create should not support profile nested ops', async () => {
      // Create user - no profile operations available
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      expect(user).toBeDefined();
      // Can't create profile via nested operation from user side
    });

    test('user update should not support profile nested ops', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      // Update user - only name can be updated
      const updated = await client.db.UserSingleSided.updateMany({
        where: { id: user.id },
        data: { name: 'Updated' },
      });

      expect(updated[0]?.name).toBe('Updated');
      // No profile operations available
    });
  });

  describe('delete behavior', () => {
    test('deleting user should SetNull profile.userId (single-sided)', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      const profile = await client.db.ProfileSingleSided.create({
        data: { bio: 'Profile', user: { connect: user.id } },
      });

      // Delete user
      await client.db.UserSingleSided.deleteMany({
        where: { id: user.id },
      });

      // Profile should still exist with userId set to null (SetNull default)
      const profileAfter = await client.db.ProfileSingleSided.findOne({
        where: { id: profile.id },
      });

      expect(profileAfter).toBeDefined();
      // SetNull default for optional relations
      expect(profileAfter?.userId).toBeNull();
    });
  });
});
