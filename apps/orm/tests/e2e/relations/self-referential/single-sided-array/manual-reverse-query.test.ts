/**
 * E2E Tests: Self-Referential Single-Sided Array - Manual Reverse Query
 *
 * Schema: self-ref-single-sided-array.cerial
 * Tests manual "followers" lookup via WHERE followingIds CONTAINS me.
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

describe('E2E Self-Ref Single-Sided Array: Manual Reverse Query', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefSingleSidedArray);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefSingleSidedArray);
  });

  describe('find followers manually', () => {
    test('should find all users following me via has query', async () => {
      const celeb = await client.db.SocialUser.create({
        data: { name: 'Celebrity' },
      });

      await client.db.SocialUser.create({
        data: { name: 'Fan 1', following: { connect: [celeb.id] } },
      });
      await client.db.SocialUser.create({
        data: { name: 'Fan 2', following: { connect: [celeb.id] } },
      });
      await client.db.SocialUser.create({
        data: { name: 'Random User' }, // Doesn't follow celeb
      });

      // Manual reverse query: "who follows me?"
      const followers = await client.db.SocialUser.findMany({
        where: { followingIds: { has: celeb.id } },
      });

      expect(followers).toHaveLength(2);
      expect(followers.map((f) => f.name).sort()).toEqual(['Fan 1', 'Fan 2']);
    });

    test('should return empty for user with no followers', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'New User' },
      });

      const followers = await client.db.SocialUser.findMany({
        where: { followingIds: { has: user.id } },
      });

      expect(followers).toEqual([]);
    });
  });

  describe('follower count', () => {
    test('should count followers manually', async () => {
      const celeb = await client.db.SocialUser.create({
        data: { name: 'Celebrity' },
      });

      await client.db.SocialUser.create({
        data: { name: 'F1', following: { connect: [celeb.id] } },
      });
      await client.db.SocialUser.create({
        data: { name: 'F2', following: { connect: [celeb.id] } },
      });
      await client.db.SocialUser.create({
        data: { name: 'F3', following: { connect: [celeb.id] } },
      });

      const followers = await client.db.SocialUser.findMany({
        where: { followingIds: { has: celeb.id } },
      });

      expect(followers.length).toBe(3);
    });
  });

  describe('following vs followers comparison', () => {
    test('should show difference between following and followers', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'User' },
      });
      const celeb1 = await client.db.SocialUser.create({
        data: { name: 'Celeb 1' },
      });
      const celeb2 = await client.db.SocialUser.create({
        data: { name: 'Celeb 2' },
      });
      const _fan = await client.db.SocialUser.create({
        data: { name: 'Fan', following: { connect: [user.id] } },
      });

      // User follows 2 celebs
      await client.db.SocialUser.updateMany({
        where: { id: user.id },
        data: { following: { connect: [celeb1.id, celeb2.id] } },
      });

      // User's following count
      const userResult = await client.db.SocialUser.findOne({
        where: { id: user.id },
      });
      const followingCount = userResult?.followingIds.length ?? 0;

      // User's followers count
      const followers = await client.db.SocialUser.findMany({
        where: { followingIds: { has: user.id } },
      });
      const followerCount = followers.length;

      expect(followingCount).toBe(2); // follows 2 celebs
      expect(followerCount).toBe(1); // only fan follows user
    });
  });
});
