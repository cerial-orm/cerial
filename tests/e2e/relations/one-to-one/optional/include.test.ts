/**
 * E2E Tests: One-to-One Optional - Include Operations
 *
 * Schema: one-to-one-optional.cerial
 * Tests including nullable relations in queries.
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

describe('E2E One-to-One Optional: Include', () => {
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

  describe('include nullable user', () => {
    test('should include user when profile has one', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'Test' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Has user',
          user: { connect: user.id },
        },
      });

      const result = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result?.user).toBeDefined();
      expect(result?.user?.name).toBe('Test');
    });

    test('should return null user when profile has none', async () => {
      const profile = await client.db.ProfileOptional.create({
        data: { bio: 'No user' },
      });

      const result = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result).toBeDefined();
      expect(result?.user).toBeNull();
    });
  });

  describe('include nullable profile', () => {
    test('should include profile when user has one', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'Has Profile' },
      });

      await client.db.ProfileOptional.create({
        data: {
          bio: 'User profile',
          user: { connect: user.id },
        },
      });

      const result = await client.db.UserOptional.findOne({
        where: { id: user.id },
        include: { profile: true },
      });

      expect(result?.profile).toBeDefined();
      expect(result?.profile?.bio).toBe('User profile');
    });

    test('should return null profile when user has none', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'No Profile' },
      });

      const result = await client.db.UserOptional.findOne({
        where: { id: user.id },
        include: { profile: true },
      });

      expect(result).toBeDefined();
      expect(result?.profile).toBeNull();
    });
  });

  describe('include in findMany with mixed results', () => {
    test('should handle mix of profiles with and without users', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'User' },
      });

      await client.db.ProfileOptional.create({
        data: { bio: 'With user', user: { connect: user.id } },
      });
      await client.db.ProfileOptional.create({
        data: { bio: 'Without user' },
      });

      const profiles = await client.db.ProfileOptional.findMany({
        include: { user: true },
        orderBy: { bio: 'asc' },
      });

      expect(profiles).toHaveLength(2);
      expect(profiles[0]?.user).toBeDefined();
      expect(profiles[1]?.user).toBeNull();
    });

    test('should handle mix of users with and without profiles', async () => {
      const user1 = await client.db.UserOptional.create({
        data: { email: uniqueEmail('u1'), name: 'Has Profile' },
      });
      await client.db.UserOptional.create({
        data: { email: uniqueEmail('u2'), name: 'No Profile' },
      });

      await client.db.ProfileOptional.create({
        data: { bio: 'Profile', user: { connect: user1.id } },
      });

      const users = await client.db.UserOptional.findMany({
        include: { profile: true },
        orderBy: { name: 'asc' },
      });

      expect(users).toHaveLength(2);
      expect(users[0]?.profile).toBeDefined();
      expect(users[1]?.profile).toBeNull();
    });
  });

  describe('include with select', () => {
    test('should include user with select fields', async () => {
      const user = await client.db.UserOptional.create({
        data: { email: uniqueEmail(), name: 'Selected' },
      });

      const profile = await client.db.ProfileOptional.create({
        data: {
          bio: 'Test',
          user: { connect: user.id },
        },
      });

      const result = await client.db.ProfileOptional.findOne({
        where: { id: profile.id },
        include: {
          user: {
            select: { name: true },
          },
        },
      });

      expect(result?.user).toBeDefined();
      expect(result?.user?.name).toBe('Selected');
    });
  });
});
