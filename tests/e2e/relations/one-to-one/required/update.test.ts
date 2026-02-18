/**
 * E2E Tests: One-to-One Required - Update Operations
 *
 * Schema: one-to-one-required.cerial
 * Tests update operations including reassigning relations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../../test-helper';

describe('E2E One-to-One Required: Update', () => {
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

  describe('update relation via connect', () => {
    test('should update profile to connect to different user', async () => {
      // Create two users
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('user1'), name: 'User 1' },
      });
      const user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('user2'), name: 'User 2' },
      });

      // Create profile connected to user1
      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test profile',
          user: { connect: user1.id },
        },
      });

      expect(profile.userId.equals(user1.id)).toBe(true);

      // Update profile to connect to user2
      const updated = await client.db.ProfileRequired.updateMany({
        where: { id: profile.id },
        data: {
          user: { connect: user2.id },
        },
      });

      expect(updated[0]?.userId?.equals(user2.id)).toBe(true);
    });
  });

  describe('update with nested create', () => {
    test('should update profile by creating new user and connecting', async () => {
      // Create initial user and profile
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('user1'), name: 'User 1' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test profile',
          user: { connect: user1.id },
        },
      });

      // Update profile with nested user create
      const updated = await client.db.ProfileRequired.updateMany({
        where: { id: profile.id },
        data: {
          user: {
            create: { email: uniqueEmail('new'), name: 'New User' },
          },
        },
      });

      expect(updated[0]?.userId).toBeDefined();
      expect(updated[0]?.userId).not.toBe(user1.id);
      // userId should be a plain ID (table prefix is stripped by the ORM)
      expect(isCerialId(updated[0]?.userId)).toBe(true);

      // Verify new user was created
      const newUser = await client.db.UserRequired.findOne({
        where: { id: updated[0]?.userId },
      });
      expect(newUser?.name).toBe('New User');
    });
  });

  describe('update user fields', () => {
    test('should update user name without affecting relation', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Original Name' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test',
          user: { connect: user.id },
        },
      });

      // Update user name
      await client.db.UserRequired.updateMany({
        where: { id: user.id },
        data: { name: 'Updated Name' },
      });

      // Profile should still point to same user
      const profileAfter = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
      });
      expect(profileAfter?.userId?.equals(user.id)).toBe(true);

      // User should have new name
      const userAfter = await client.db.UserRequired.findOne({
        where: { id: user.id },
      });
      expect(userAfter?.name).toBe('Updated Name');
    });
  });

  describe('update profile fields', () => {
    test('should update profile bio without affecting relation', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Original bio',
          user: { connect: user.id },
        },
      });

      // Update profile bio
      const updated = await client.db.ProfileRequired.updateMany({
        where: { id: profile.id },
        data: { bio: 'Updated bio' },
      });

      expect(updated[0]?.bio).toBe('Updated bio');
      expect(updated[0]?.userId?.equals(user.id)).toBe(true);
    });
  });

  describe('reassign relation', () => {
    test('should handle reassigning profile from one user to another', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      // Create profile for user1
      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Moving profile',
          user: { connect: user1.id },
        },
      });

      // Reassign to user2
      await client.db.ProfileRequired.updateMany({
        where: { id: profile.id },
        data: { userId: user2.id },
      });

      // Verify profile now belongs to user2
      const updated = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
      });
      expect(updated?.userId?.equals(user2.id)).toBe(true);
    });
  });
});
