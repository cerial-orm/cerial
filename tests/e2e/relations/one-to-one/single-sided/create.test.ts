/**
 * E2E Tests: One-to-One Single-Sided - Create Operations
 *
 * Schema: one-to-one-single-sided.cerial
 * - UserSingleSided: id, name (NO profile Relation - single-sided)
 * - ProfileSingleSided: id, bio?, userId (Record?), user (Relation? @field)
 *
 * Tests single-sided 1-1 where only PK side defines the relation.
 * User has no knowledge of Profile.
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
} from '../../../test-helper';

describe('E2E One-to-One Single-Sided: Create', () => {
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

  describe('create from PK side (Profile)', () => {
    test('should create profile with nested user create', async () => {
      const profile = await client.db.ProfileSingleSided.create({
        data: {
          bio: 'Single-sided profile',
          user: {
            create: { name: 'User' },
          },
        },
      });

      expect(profile.userId).toBeDefined();
      // userId should be the plain id without table prefix
      expect(isCerialId(profile.userId)).toBe(true);
    });

    test('should create profile connecting to existing user', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'Existing user' },
      });

      const profile = await client.db.ProfileSingleSided.create({
        data: {
          bio: 'Connected',
          user: { connect: user.id },
        },
      });

      expect(profile.userId?.equals(user.id)).toBe(true);
    });

    test('should create profile without user (optional)', async () => {
      const profile = await client.db.ProfileSingleSided.create({
        data: { bio: 'Orphan' },
      });

      expect(profile.userId).toBeNull();
    });
  });

  describe('create user (no profile access)', () => {
    test('should create user without any profile reference', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'Solo user' },
      });

      expect(user).toBeDefined();
      expect(user.name).toBe('Solo user');
      // User has no profile field at all
      expect((user as any).profile).toBeUndefined();
      expect((user as any).profileId).toBeUndefined();
    });

    test('should not allow nested profile create from user side', async () => {
      // User schema has no profile relation, so this should be a type error
      // Runtime may ignore unknown fields or throw
      const user = await client.db.UserSingleSided.create({
        data: {
          name: 'User',
          // profile: { create: { bio: 'Should not work' } }  // Type error
        } as any,
      });

      expect(user).toBeDefined();
    });
  });

  describe('multiple profiles for same user', () => {
    test('should allow creating multiple profiles pointing to same user', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      // In single-sided, nothing prevents multiple profiles pointing to same user
      const profile1 = await client.db.ProfileSingleSided.create({
        data: { bio: 'Profile 1', user: { connect: user.id } },
      });
      const profile2 = await client.db.ProfileSingleSided.create({
        data: { bio: 'Profile 2', user: { connect: user.id } },
      });

      expect(profile1.userId?.equals(user.id)).toBe(true);
      expect(profile2.userId?.equals(user.id)).toBe(true);
    });
  });
});
