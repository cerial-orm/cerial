/**
 * E2E Tests: One-to-One Optional - Upsert
 *
 * Schema: one-to-one-optional.cerial
 * - UserOptional: id, email (@unique), name, profile (Relation? @model)
 * - ProfileOptional: id, bio?, userId (Record?), user (Relation? @field(userId) @model)
 *
 * Tests upsert operations involving optional one-to-one relations:
 * FK operations, nested create/connect, include, and disconnect.
 * Generic upsert behavior (return options, create-only, etc.) is tested in tests/e2e/upsert.test.ts.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../../../test-helper';

describe('E2E One-to-One Optional: Upsert', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneOptional);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToOneOptional);
  });

  // ==========================================================================
  // FK (Record) field in upsert
  // ==========================================================================

  describe('upsert with FK record field', () => {
    test('creates profile with FK pointing to user on create path', async () => {
      const user = await client.db.UserOptional.create({
        data: { name: 'FK Create', email: uniqueEmail('fk') },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: 'profile_optional:fk_create' },
        create: { bio: 'Created Bio', userId: user.id },
        update: { bio: 'Updated Bio' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Created Bio');
      expect(result!.userId?.equals(user.id)).toBe(true);
    });

    test('updates profile FK to different user on update path', async () => {
      const user1 = await client.db.UserOptional.create({
        data: { name: 'User 1', email: uniqueEmail('u1') },
      });
      const user2 = await client.db.UserOptional.create({
        data: { name: 'User 2', email: uniqueEmail('u2') },
      });

      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Bio', userId: user1.id },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: profile.id },
        create: { bio: 'New Bio' },
        update: { userId: user2.id },
      });

      expect(result).toBeDefined();
      expect(result!.userId?.equals(user2.id)).toBe(true);
    });

    test('preserves FK when not in update data', async () => {
      const user = await client.db.UserOptional.create({
        data: { name: 'Preserve FK', email: uniqueEmail('pfk') },
      });

      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Original', userId: user.id },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: profile.id },
        create: { bio: 'New' },
        update: { bio: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Updated');
      expect(result!.userId?.equals(user.id)).toBe(true);
    });

    test('sets FK to null via update on update path', async () => {
      const user = await client.db.UserOptional.create({
        data: { name: 'Null FK', email: uniqueEmail('nfk') },
      });

      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Bio', userId: user.id },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: profile.id },
        create: { bio: 'New' },
        update: { userId: null },
      });

      expect(result).toBeDefined();
      expect(result!.userId).toBeNull();
    });
  });

  // ==========================================================================
  // Nested create on upsert create path
  // ==========================================================================

  describe('nested create on create path', () => {
    test('creates related user via nested create from PK side (ProfileOptional)', async () => {
      const result = await client.db.ProfileOptional.upsert({
        where: { id: 'profile_optional:nested_create' },
        create: {
          bio: 'Nested Bio',
          user: {
            create: { name: 'Nested User', email: uniqueEmail('nc') },
          },
        },
        update: { bio: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Nested Bio');
      expect(result!.userId).toBeDefined();

      // Verify the related user was created
      const user = await client.db.UserOptional.findOne({
        where: { id: result!.userId! },
      });
      expect(user).toBeDefined();
      expect(user!.name).toBe('Nested User');
    });

    test('creates related profile via nested create from non-PK side (UserOptional)', async () => {
      const email = uniqueEmail('ncu');
      const result = await client.db.UserOptional.upsert({
        where: { email },
        create: {
          name: 'User with Profile',
          email,
          profile: {
            create: { bio: 'Created from user side' },
          },
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('User with Profile');

      // Verify profile was created and linked
      const profiles = await client.db.ProfileOptional.findMany({
        where: { userId: result!.id },
      });
      expect(profiles).toHaveLength(1);
      expect(profiles[0]!.bio).toBe('Created from user side');
    });
  });

  // ==========================================================================
  // Nested create on upsert update path
  // ==========================================================================

  describe('nested create on update path', () => {
    test('creates new related user via nested create on update path', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Existing' },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: profile.id },
        create: { bio: 'Not This' },
        update: {
          bio: 'Updated Bio',
          user: {
            create: { name: 'New User on Update', email: uniqueEmail('ncu') },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Updated Bio');
      expect(result!.userId).toBeDefined();
    });
  });

  // ==========================================================================
  // Nested connect
  // ==========================================================================

  describe('nested connect', () => {
    test('connects existing user on upsert update path', async () => {
      const user = await client.db.UserOptional.create({
        data: { name: 'Connect Test', email: uniqueEmail('ct') },
      });

      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Profile to connect' },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: profile.id },
        create: { bio: 'New Bio' },
        update: {
          bio: 'Connected Bio',
          user: { connect: user.id },
        },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Connected Bio');
      expect(result!.userId?.equals(user.id)).toBe(true);
    });

    test('connects existing user on upsert create path', async () => {
      const user = await client.db.UserOptional.create({
        data: { name: 'Connect Create', email: uniqueEmail('cc') },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: 'profile_optional:connect_create' },
        create: {
          bio: 'Created with connect',
          user: { connect: user.id },
        },
        update: { bio: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Created with connect');
      expect(result!.userId?.equals(user.id)).toBe(true);
    });

    test('connects profile from non-PK side (UserOptional) on update path', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Orphan Profile' },
      });

      const user = await client.db.UserOptional.create({
        data: { name: 'User for connect', email: uniqueEmail('ufc') },
      });

      const result = await client.db.UserOptional.upsert({
        where: { email: user.email },
        create: { name: 'Not This', email: user.email },
        update: {
          profile: { connect: profile.id },
        },
      });

      expect(result).toBeDefined();

      // Profile should now have userId pointing to user
      const updatedProfile = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
      });
      expect(updatedProfile?.userId?.equals(user.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Nested disconnect
  // ==========================================================================

  describe('nested disconnect', () => {
    test('disconnects user from profile on update path', async () => {
      const user = await client.db.UserOptional.create({
        data: { name: 'Disconnect', email: uniqueEmail('dc') },
      });

      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Connected', userId: user.id },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: profile.id },
        create: { bio: 'New' },
        update: {
          user: { disconnect: true },
        },
      });

      expect(result).toBeDefined();
      expect(result!.userId).toBeNull();
    });
  });

  // ==========================================================================
  // Include
  // ==========================================================================

  describe('include', () => {
    test('includes related profile in upsert result (update path)', async () => {
      const profile = await client.db.ProfileOptional.create({ data: { bio: 'Bio' } });

      const user = await client.db.UserOptional.create({
        data: { name: 'With Profile', email: uniqueEmail('wp') },
      });

      await client.db.ProfileOptional.updateUnique({
        where: { id: profile.id },
        data: { userId: user.id },
      });

      const result = await client.db.UserOptional.upsert({
        where: { email: user.email },
        create: { name: 'Not This', email: user.email },
        update: { name: 'Updated With Profile' },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated With Profile');
      expect((result as any).profile).toBeDefined();
      expect((result as any).profile.bio).toBe('Bio');
    });

    test('includes null profile on create path', async () => {
      const email = uniqueEmail('inc');
      const result = await client.db.UserOptional.upsert({
        where: { email },
        create: { name: 'New User', email },
        update: { name: 'Updated' },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('New User');
      expect((result as any).profile).toBeNull();
    });

    test('includes related user in profile upsert result', async () => {
      const user = await client.db.UserOptional.create({
        data: { name: 'Include User', email: uniqueEmail('iu') },
      });

      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'Bio', userId: user.id },
      });

      const result = await client.db.ProfileOptional.upsert({
        where: { id: profile.id },
        create: { bio: 'New' },
        update: { bio: 'Updated' },
        include: { user: true },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Updated');
      expect((result as any).user).toBeDefined();
      expect((result as any).user.name).toBe('Include User');
    });
  });
});
