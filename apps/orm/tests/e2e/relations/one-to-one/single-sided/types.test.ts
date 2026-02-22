/**
 * E2E Tests: One-to-One Single-Sided - Type Safety
 *
 * Schema: one-to-one-single-sided.cerial
 * Tests that return types are T | null for single-sided relations.
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

describe('E2E One-to-One Single-Sided: Types', () => {
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

  describe('return type is T | null', () => {
    test('should return user or null in include', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'User' },
      });

      const profileWithUser = await client.db.ProfileSingleSided.create({
        data: { bio: 'Has user', user: { connect: user.id } },
      });

      const profileWithoutUser = await client.db.ProfileSingleSided.create({
        data: { bio: 'No user' },
      });

      // With user - should be defined
      const result1 = await client.db.ProfileSingleSided.findOne({
        where: { id: profileWithUser.id },
        include: { user: true },
      });
      expect(result1?.user).not.toBeNull();
      expect(result1?.user?.name).toBe('User');

      // Without user - should be null
      const result2 = await client.db.ProfileSingleSided.findOne({
        where: { id: profileWithoutUser.id },
        include: { user: true },
      });
      expect(result2?.user).toBeNull();
    });
  });

  describe('userId can be null', () => {
    test('should allow null userId', async () => {
      const profile = await client.db.ProfileSingleSided.create({
        data: {
          bio: 'Null userId',
          userId: null,
        },
      });

      expect(profile.userId).toBeNull();
    });

    test('should default userId to null when not provided', async () => {
      const profile = await client.db.ProfileSingleSided.create({
        data: { bio: 'No userId specified' },
      });

      expect(profile.userId).toBeNull();
    });
  });

  describe('type narrowing', () => {
    test('should be able to narrow user type after null check', async () => {
      const user = await client.db.UserSingleSided.create({
        data: { name: 'Narrowed User' },
      });

      const profile = await client.db.ProfileSingleSided.create({
        data: { bio: 'Test', user: { connect: user.id } },
      });

      const result = await client.db.ProfileSingleSided.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      // Type narrowing
      if (result?.user) {
        // Here TypeScript knows user is not null
        expect(result.user.name).toBe('Narrowed User');
        expect(result.user.id.equals(user.id)).toBe(true);
      }
    });
  });

  describe('optional chaining', () => {
    test('should support optional chaining for nullable relations', async () => {
      const profile = await client.db.ProfileSingleSided.create({
        data: { bio: 'No user' },
      });

      const result = await client.db.ProfileSingleSided.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      // Optional chaining should work
      const userName = result?.user?.name;
      expect(userName).toBeUndefined();
    });
  });
});
