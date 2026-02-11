/**
 * E2E Tests: One-to-One Required - Create Operations
 *
 * Schema: one-to-one-required.cerial
 * - UserRequired: id, email, name, profile (Relation @model)
 * - ProfileRequired: id, bio?, avatarUrl?, userId (Record), user (Relation @field)
 *
 * Tests nested create and connect operations for required 1-1 relations.
 * FK on Profile side (required) - User deletion cascades to Profile.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig, uniqueEmail } from '../../test-helper';
import { isCerialId } from 'cerial';

describe('E2E One-to-One Required: Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('nested create from PK side (Profile)', () => {
    test('should create profile with nested user create', async () => {
      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test bio',
          user: {
            create: {
              email: uniqueEmail(),
              name: 'Test User',
            },
          },
        },
      });

      expect(profile).toBeDefined();
      expect(profile.userId).toBeDefined();
      // userId is a plain ID string (table prefix stripped by ORM)
      expect(isCerialId(profile.userId)).toBe(true);
      expect(profile.bio).toBe('Test bio');

      // Verify user was created
      const user = await client.db.UserRequired.findOne({
        where: { id: profile.userId },
      });
      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');
    });

    test('should create profile with nested user create including all fields', async () => {
      const email = uniqueEmail();
      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Developer',
          avatarUrl: 'https://example.com/avatar.png',
          user: {
            create: {
              email,
              name: 'Full User',
            },
          },
        },
      });

      expect(profile.bio).toBe('Developer');
      expect(profile.avatarUrl).toBe('https://example.com/avatar.png');

      const user = await client.db.UserRequired.findOne({
        where: { id: profile.userId },
      });
      expect(user?.email).toBe(email);
    });
  });

  describe('nested connect from PK side (Profile)', () => {
    test('should create profile connecting to existing user', async () => {
      // Create user first
      const user = await client.db.UserRequired.create({
        data: {
          email: uniqueEmail(),
          name: 'Existing User',
        },
      });

      // Create profile connecting to user
      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Connected profile',
          user: { connect: user.id },
        },
      });

      expect(profile.userId.equals(user.id)).toBe(true);
    });

    test('should reject connect to non-existent user id', async () => {
      // ORM validates that connected records exist
      await expect(
        (async () => {
          await client.db.ProfileRequired.create({
            data: {
              bio: 'Test',
              user: { connect: 'nonexistent123' },
            },
          });
        })(),
      ).rejects.toThrow();
    });
  });

  describe('nested create from non-PK side (User)', () => {
    test('should create user with nested profile create', async () => {
      const user = await client.db.UserRequired.create({
        data: {
          email: uniqueEmail(),
          name: 'User with Profile',
          profile: {
            create: { bio: 'Created from user side' },
          },
        },
      });

      expect(user).toBeDefined();

      // Find the profile that was created
      const profiles = await client.db.ProfileRequired.findMany({
        where: { userId: user.id },
      });

      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.bio).toBe('Created from user side');
    });

    test('should create user without profile', async () => {
      // User can exist without profile - profile is what requires the user
      const user = await client.db.UserRequired.create({
        data: {
          email: uniqueEmail(),
          name: 'Solo User',
        },
      });

      expect(user).toBeDefined();
      expect(user.name).toBe('Solo User');

      // No profile should exist for this user
      const profiles = await client.db.ProfileRequired.findMany({
        where: { userId: user.id },
      });
      expect(profiles).toHaveLength(0);
    });
  });

  describe('nested connect from non-PK side (User)', () => {
    test('should create user connecting to existing profile', async () => {
      // Create profile first (with temp userId that will be updated)
      const tempUser = await client.db.UserRequired.create({
        data: {
          email: uniqueEmail('temp'),
          name: 'Temp User',
        },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Existing profile',
          user: { connect: tempUser.id },
        },
      });

      // Create new user connecting to profile
      const newUser = await client.db.UserRequired.create({
        data: {
          email: uniqueEmail('new'),
          name: 'New User',
          profile: { connect: profile.id },
        },
      });

      expect(newUser).toBeDefined();

      // Profile should now point to new user
      const updatedProfile = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
      });
      expect(updatedProfile?.userId?.equals(newUser.id)).toBe(true);
    });
  });

  describe('direct field access', () => {
    test('should allow creating profile with raw userId field', async () => {
      // Creating profile with raw userId (bypassing relation) should work
      const user = await client.db.UserRequired.create({
        data: {
          email: uniqueEmail(),
          name: 'Test User',
        },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Direct userId',
          userId: user.id,
        },
      });

      expect(profile.userId.equals(user.id)).toBe(true);
    });
  });
});
