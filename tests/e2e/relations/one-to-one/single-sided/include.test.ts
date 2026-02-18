/**
 * E2E Tests: One-to-One Single-Sided - Include Operations
 *
 * Schema: one-to-one-single-sided.cerial
 * Tests include behavior for single-sided relations.
 * Profile can include user, but User cannot include profile.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../../test-helper';

describe('E2E One-to-One Single-Sided: Include', () => {
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

  describe('include from PK side (Profile -> User)', () => {
    test('should include user when querying profile', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'Included User' },
      });

      const profile = await client.db.ProfileSingleSided.create({
        data: {
          bio: 'Has user',
          user: { connect: user.id },
        },
      });

      const result = await client.db.ProfileSingleSided.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result?.user).toBeDefined();
      expect(result?.user?.name).toBe('Included User');
    });

    test('should return null when user does not exist', async () => {
      const profile = await client.db.ProfileSingleSided.create({
        data: { bio: 'No user' },
      });

      const result = await client.db.ProfileSingleSided.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result).toBeDefined();
      expect(result?.user).toBeNull();
    });

    test('should return null when user was deleted', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'Will be deleted' },
      });

      const profile = await client.db.ProfileSingleSided.create({
        data: {
          bio: 'User will be deleted',
          user: { connect: user.id },
        },
      });

      // Delete user
      await client.db.UserSingleSided.deleteMany({
        where: { id: user.id },
      });

      // Include should return null
      const result = await client.db.ProfileSingleSided.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result?.user).toBeNull();
    });
  });

  describe('no include from non-PK side (User)', () => {
    test('user has no profile relation to include', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      // This would be a type error - User has no profile relation
      const result = await client.db.UserSingleSided.findOne({
        where: { id: user.id },
        // include: { profile: true }  // Type error - profile doesn't exist
      });

      expect(result).toBeDefined();
      expect((result as any).profile).toBeUndefined();
    });
  });

  describe('include in findMany', () => {
    test('should include users for multiple profiles', async () => {
      const user1 = await client.db.UserSingleSided.create({
        data: { name: 'User 1' },
      });
      const user2 = await client.db.UserSingleSided.create({
        data: { name: 'User 2' },
      });

      await client.db.ProfileSingleSided.create({
        data: { bio: 'P1', user: { connect: user1.id } },
      });
      await client.db.ProfileSingleSided.create({
        data: { bio: 'P2', user: { connect: user2.id } },
      });
      await client.db.ProfileSingleSided.create({
        data: { bio: 'P3' }, // No user
      });

      const profiles = await client.db.ProfileSingleSided.findMany({
        include: { user: true },
        orderBy: { bio: 'asc' },
      });

      expect(profiles).toHaveLength(3);
      expect(profiles[0]?.user?.name).toBe('User 1');
      expect(profiles[1]?.user?.name).toBe('User 2');
      expect(profiles[2]?.user).toBeNull();
    });
  });
});
