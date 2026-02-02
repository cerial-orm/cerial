/**
 * E2E Tests: One-to-One Optional - Create Operations
 *
 * Schema: one-to-one-optional.cerial
 * - UserOptional: id, email, name, profile (Relation? @model)
 * - ProfileOptional: id, bio?, userId (Record?), user (Relation? @field)
 *
 * Tests create operations for optional 1-1 relations.
 * Profile can exist without user, user can exist without profile.
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

describe('E2E One-to-One Optional: Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneOptional);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('create without relation', () => {
    test('should create profile without user', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Standalone profile',
        },
      });

      expect(profile).toBeDefined();
      expect(profile.bio).toBe('Standalone profile');
      expect(profile.userId).toBeNull();
    });

    test('should create user without profile', async () => {
      const user = await client.db.UserOptional.create({
        data: {
          email: uniqueEmail(),
          name: 'Standalone user',
        },
      });

      expect(user).toBeDefined();
      expect(user.name).toBe('Standalone user');
    });
  });

  describe('nested create from PK side (Profile)', () => {
    test('should create profile with nested user create', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'With user',
          user: {
            create: {
              email: uniqueEmail(),
              name: 'Created User',
            },
          },
        },
      });

      expect(profile.userId).toBeDefined();
      // ORM strips table prefix - userId is a plain ID string
      expect(typeof profile.userId).toBe('string');

      const user = await client.db.UserOptional.findOne({
        where: { id: profile.userId! },
      });
      expect(user?.name).toBe('Created User');
    });
  });

  describe('nested connect from PK side (Profile)', () => {
    test('should create profile connecting to existing user', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'Existing' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Connected',
          user: { connect: user.id },
        },
      });

      expect(profile.userId).toBe(user.id);
    });
  });

  describe('nested create from non-PK side (User)', () => {
    test('should create user with nested profile create', async () => {
      const user = await client.db.UserOptional.create({
        data: {
          email: uniqueEmail(),
          name: 'With Profile',
          profile: {
            create: { bio: 'Created from user' },
          },
        },
      });

      expect(user).toBeDefined();

      const profiles = await client.db.ProfileOptional.findMany({
        where: { userId: user.id },
      });

      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.bio).toBe('Created from user');
    });
  });

  describe('nested connect from non-PK side (User)', () => {
    test('should create user connecting to existing profile', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Orphan profile' },
      });

      const user = await client.db.UserOptional.create({
        data: {
          email: uniqueEmail(),
          name: 'Adopter',
          profile: { connect: profile.id },
        },
      });

      expect(user).toBeDefined();

      // Profile should now point to user
      const updatedProfile = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
      });
      expect(updatedProfile?.userId).toBe(user.id);
    });
  });

  describe('optional null handling', () => {
    test('should accept null for optional userId', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Null user',
          userId: null,
        },
      });

      expect(profile.userId).toBeNull();
    });

    test('should default userId to null when not provided', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'No user specified',
        },
      });

      expect(profile.userId).toBeNull();
    });
  });
});
