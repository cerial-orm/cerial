/**
 * E2E Tests: One-to-One Optional - Update Operations
 *
 * Schema: one-to-one-optional.cerial
 * Tests connect, disconnect, and reassign for optional 1-1 relations.
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

describe('E2E One-to-One Optional: Update', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneOptional);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('connect', () => {
    test('should connect profile to user via update', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Unconnected' },
      });

      expect(profile.userId).toBeNull();

      const updated = await client.db.ProfileOptional.updateMany({
        where: { id: profile.id },
        data: {
          user: { connect: user.id },
        },
      });

      expect(updated[0]?.userId).toBe(user.id);
    });
  });

  describe('disconnect', () => {
    test('should disconnect optional relation', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Connected',
          user: { connect: user.id },
        },
      });

      expect(profile.userId).toBe(user.id);

      // Disconnect
      const updated = await client.db.ProfileOptional.updateMany({
        where: { id: profile.id },
        data: {
          user: { disconnect: true },
        },
      });

      expect(updated[0]?.userId).toBeNull();
    });

    test('should set userId to null via disconnect from user side', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Profile' },
      });

      const user = await client.db.UserOptional.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          profile: { connect: profile.id },
        },
      });

      // Disconnect from user side
      await client.db.UserOptional.updateMany({
        where: { id: user.id },
        data: {
          profile: { disconnect: true },
        },
      });

      // Profile should have null userId
      const updatedProfile = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
      });
      expect(updatedProfile?.userId).toBeNull();
    });
  });

  describe('reassign', () => {
    test('should reassign profile to different user', async () => {
      const user1 = await client.db.UserOptional.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserOptional.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Moving',
          user: { connect: user1.id },
        },
      });

      // Reassign to user2
      const updated = await client.db.ProfileOptional.updateMany({
        where: { id: profile.id },
        data: {
          user: { connect: user2.id },
        },
      });

      expect(updated[0]?.userId).toBe(user2.id);
    });

    test('should reassign via direct userId update', async () => {
      const user1 = await client.db.UserOptional.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserOptional.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Direct update',
          userId: user1.id,
        },
      });

      // Direct userId update
      const updated = await client.db.ProfileOptional.updateMany({
        where: { id: profile.id },
        data: { userId: user2.id },
      });

      expect(updated[0]?.userId).toBe(user2.id);
    });
  });

  describe('nested create on update', () => {
    test('should create new user and connect via update', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Orphan' },
      });

      const updated = await client.db.ProfileOptional.updateMany({
        where: { id: profile.id },
        data: {
          user: {
            create: { email: uniqueEmail(), name: 'New User' },
          },
        },
      });

      expect(updated[0]?.userId).toBeDefined();
      // userId is a plain ID string (table prefix stripped by ORM)
      expect(typeof updated[0]?.userId).toBe('string');

      const user = await client.db.UserOptional.findOne({
        where: { id: updated[0]?.userId! },
      });
      expect(user?.name).toBe('New User');
    });
  });

  describe('set to null', () => {
    test('should set userId to null directly', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Connected',
          user: { connect: user.id },
        },
      });

      // Set userId to null
      const updated = await client.db.ProfileOptional.updateMany({
        where: { id: profile.id },
        data: { userId: null },
      });

      expect(updated[0]?.userId).toBeNull();
    });
  });
});
