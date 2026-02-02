/**
 * E2E Tests: One-to-One @onDelete(SetNull) - Explicit
 *
 * Schema: one-to-one-setnull.cerial
 * Tests that @onDelete(SetNull) sets FK to null when referenced record is deleted.
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

describe('E2E One-to-One @onDelete(SetNull)', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneSetNull);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('setnull behavior', () => {
    test('should set profile.userId to null when user deleted', async () => {
      const user = await client.db.UserSetNull.create({
        data: { email: uniqueEmail(), name: 'Will be deleted' },
      });

      const profile = await client.db.ProfileSetNull.create({
        data: {
          bio: 'Will become orphan',
          user: { connect: user.id },
        },
      });

      expect(profile.userId).toBe(user.id);

      // Delete user
      await client.db.UserSetNull.deleteMany({
        where: { id: user.id },
      });

      // Profile should still exist with null userId
      const profileAfter = await client.db.ProfileSetNull.findOne({
        where: { id: profile.id },
      });

      expect(profileAfter).toBeDefined();
      expect(profileAfter?.userId).toBeNull();
    });

    test('should handle multiple profiles becoming orphans', async () => {
      const user = await client.db.UserSetNull.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileSetNull.create({
        data: {
          bio: 'Profile',
          user: { connect: user.id },
        },
      });

      // Delete user
      await client.db.UserSetNull.deleteMany({
        where: { id: user.id },
      });

      // Profile should be orphaned
      const profileAfter = await client.db.ProfileSetNull.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter?.userId).toBeNull();
    });
  });

  describe('orphan profile behavior', () => {
    test('should be able to query orphan profiles', async () => {
      const user = await client.db.UserSetNull.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      await client.db.ProfileSetNull.create({
        data: { bio: 'Will be orphaned', user: { connect: user.id } },
      });

      // Delete user
      await client.db.UserSetNull.deleteMany({
        where: { id: user.id },
      });

      // Find orphan profiles
      const orphans = await client.db.ProfileSetNull.findMany({
        where: { userId: null },
      });

      expect(orphans).toHaveLength(1);
      expect(orphans[0]?.bio).toBe('Will be orphaned');
    });

    test('should be able to re-connect orphan profile to new user', async () => {
      const user1 = await client.db.UserSetNull.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });

      const profile = await client.db.ProfileSetNull.create({
        data: { bio: 'Moving', user: { connect: user1.id } },
      });

      // Delete user1 - profile becomes orphan
      await client.db.UserSetNull.deleteMany({
        where: { id: user1.id },
      });

      const orphan = await client.db.ProfileSetNull.findOne({
        where: { id: profile.id },
      });
      expect(orphan?.userId).toBeNull();

      // Create new user and connect
      const user2 = await client.db.UserSetNull.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      await client.db.ProfileSetNull.updateMany({
        where: { id: profile.id },
        data: { user: { connect: user2.id } },
      });

      const reconnected = await client.db.ProfileSetNull.findOne({
        where: { id: profile.id },
      });
      expect(reconnected?.userId).toBe(user2.id);
    });
  });

  describe('include after setnull', () => {
    test('should return null user in include after deletion', async () => {
      const user = await client.db.UserSetNull.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileSetNull.create({
        data: { bio: 'Profile', user: { connect: user.id } },
      });

      // Delete user
      await client.db.UserSetNull.deleteMany({
        where: { id: user.id },
      });

      // Include should return null
      const result = await client.db.ProfileSetNull.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result?.userId).toBeNull();
      expect(result?.user).toBeNull();
    });
  });
});
