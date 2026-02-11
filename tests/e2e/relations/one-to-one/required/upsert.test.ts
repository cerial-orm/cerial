/**
 * E2E Tests: One-to-One Required - Upsert
 *
 * Schema: one-to-one-required.cerial
 * - UserRequired: id, email (@unique), name, profile (Relation @model)
 * - ProfileRequired: id, bio?, avatarUrl?, userId (Record), user (Relation @field(userId) @model)
 *
 * FK on Profile side (required). Tests upsert with required relation constraints:
 * nested create/connect, FK field operations, include, and reassignment.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig, uniqueEmail } from '../../test-helper';
import { isCerialId } from 'cerial';

describe('E2E One-to-One Required: Upsert', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  // ==========================================================================
  // FK (Record) field in upsert — required relation
  // ==========================================================================

  describe('upsert with required FK field', () => {
    test('creates profile with required userId on create path', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail('fk'), name: 'FK User' },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: 'profile_required:fk_create' },
        create: { bio: 'Created Bio', userId: user.id },
        update: { bio: 'Updated Bio' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Created Bio');
      expect(result!.userId.equals(user.id)).toBe(true);
    });

    test('updates profile bio while preserving required FK', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail('pfk'), name: 'Preserve FK' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: { bio: 'Original', userId: user.id },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: profile.id },
        create: { bio: 'New', userId: user.id },
        update: { bio: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Updated');
      expect(result!.userId.equals(user.id)).toBe(true);
    });

    test('reassigns profile to different user via FK in update', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: { bio: 'Bio', userId: user1.id },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: profile.id },
        create: { bio: 'New', userId: user1.id },
        update: { userId: user2.id },
      });

      expect(result).toBeDefined();
      expect(result!.userId.equals(user2.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Nested create from PK side (ProfileRequired)
  // ==========================================================================

  describe('nested create from PK side (ProfileRequired)', () => {
    test('creates profile with nested user create on upsert create path', async () => {
      const email = uniqueEmail('nc');
      const result = await client.db.ProfileRequired.upsert({
        where: { id: 'profile_required:nested_create' },
        create: {
          bio: 'Nested Bio',
          user: {
            create: { email, name: 'Nested User' },
          },
        },
        update: { bio: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Nested Bio');
      expect(isCerialId(result!.userId)).toBe(true);

      // Verify user was created
      const user = await client.db.UserRequired.findOne({
        where: { id: result!.userId },
      });
      expect(user).toBeDefined();
      expect(user!.name).toBe('Nested User');
    });

    test('creates new user via nested create on upsert update path', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: { bio: 'Original', user: { connect: user1.id } },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: profile.id },
        create: { bio: 'New', user: { create: { email: uniqueEmail('tmp'), name: 'Tmp' } } },
        update: {
          bio: 'Updated',
          user: { create: { email: uniqueEmail('new'), name: 'New User' } },
        },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Updated');
      // userId should now point to the newly created user
      expect(result!.userId.equals(user1.id)).toBe(false);

      const newUser = await client.db.UserRequired.findOne({
        where: { id: result!.userId },
      });
      expect(newUser!.name).toBe('New User');
    });
  });

  // ==========================================================================
  // Nested connect from PK side (ProfileRequired)
  // ==========================================================================

  describe('nested connect from PK side (ProfileRequired)', () => {
    test('connects existing user on upsert create path', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail('cc'), name: 'Connect Create' },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: 'profile_required:connect_create' },
        create: {
          bio: 'Connected on create',
          user: { connect: user.id },
        },
        update: { bio: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Connected on create');
      expect(result!.userId.equals(user.id)).toBe(true);
    });

    test('reconnects to different user on upsert update path', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: { bio: 'Bio', user: { connect: user1.id } },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: profile.id },
        create: { bio: 'New', user: { connect: user1.id } },
        update: {
          user: { connect: user2.id },
        },
      });

      expect(result).toBeDefined();
      expect(result!.userId.equals(user2.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Nested create from non-PK side (UserRequired)
  // ==========================================================================

  describe('nested create from non-PK side (UserRequired)', () => {
    test('creates user with nested profile create on upsert create path', async () => {
      const email = uniqueEmail('ncu');
      const result = await client.db.UserRequired.upsert({
        where: { email },
        create: {
          email,
          name: 'User with Profile',
          profile: {
            create: { bio: 'Created from user side' },
          },
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('User with Profile');

      // Verify profile was created
      const profiles = await client.db.ProfileRequired.findMany({
        where: { userId: result!.id },
      });
      expect(profiles).toHaveLength(1);
      expect(profiles[0]!.bio).toBe('Created from user side');
    });
  });

  // ==========================================================================
  // Nested connect from non-PK side (UserRequired)
  // ==========================================================================

  describe('nested connect from non-PK side (UserRequired)', () => {
    test('connects existing profile on upsert update path', async () => {
      const tempUser = await client.db.UserRequired.create({
        data: { email: uniqueEmail('tmp'), name: 'Temp' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: { bio: 'Existing profile', user: { connect: tempUser.id } },
      });

      const email = uniqueEmail('npc');
      const user = await client.db.UserRequired.create({
        data: { email, name: 'User to connect' },
      });

      const result = await client.db.UserRequired.upsert({
        where: { email },
        create: { email, name: 'Not This' },
        update: {
          profile: { connect: profile.id },
        },
      });

      expect(result).toBeDefined();

      // Profile should now point to the upserted user
      const updatedProfile = await client.db.ProfileRequired.findOne({
        where: { id: profile.id },
      });
      expect(updatedProfile?.userId.equals(user.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Include
  // ==========================================================================

  describe('include', () => {
    test('includes profile in user upsert result (update path)', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail('inc'), name: 'User' },
      });

      await client.db.ProfileRequired.create({
        data: { bio: 'Profile Bio', user: { connect: user.id } },
      });

      const result = await client.db.UserRequired.upsert({
        where: { email: user.email },
        create: { email: user.email, name: 'Not This' },
        update: { name: 'Updated' },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated');
      expect((result as any).profile).toBeDefined();
      expect((result as any).profile.bio).toBe('Profile Bio');
    });

    test('includes user in profile upsert result', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail('iu'), name: 'Include User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: { bio: 'Bio', user: { connect: user.id } },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: profile.id },
        create: { bio: 'New', userId: user.id },
        update: { bio: 'Updated' },
        include: { user: true },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Updated');
      expect((result as any).user).toBeDefined();
      expect((result as any).user.name).toBe('Include User');
    });
  });

  // ==========================================================================
  // Create-only with required relation
  // ==========================================================================

  describe('create-only with required FK', () => {
    test('creates profile with required FK, returns existing unchanged', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail('co'), name: 'User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: { bio: 'Original', userId: user.id },
      });

      const result = await client.db.ProfileRequired.upsert({
        where: { id: profile.id },
        create: { bio: 'Should Not See', userId: user.id },
      });

      expect(result).toBeDefined();
      expect(result!.bio).toBe('Original');
    });
  });
});
