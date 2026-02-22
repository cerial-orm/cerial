/**
 * E2E Tests: Self-Referential Single-Sided Array - Create
 *
 * Schema: self-ref-single-sided-array.cerial
 * - SocialUser: id, name, followingIds (Record[]), following (Relation[] @field)
 *
 * Tests Twitter-style follow pattern (A follows B ≠ B follows A).
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

describe('E2E Self-Ref Single-Sided Array: Create', () => {
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

  describe('create without following', () => {
    test('should create user with no following', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'New User' },
      });

      expect(user.followingIds).toEqual([]);
    });
  });

  describe('create with following connect', () => {
    test('should create user following others via connect', async () => {
      const celeb1 = await client.db.SocialUser.create({
        data: { name: 'Celebrity 1' },
      });
      const celeb2 = await client.db.SocialUser.create({
        data: { name: 'Celebrity 2' },
      });

      const user = await client.db.SocialUser.create({
        data: {
          name: 'Fan',
          following: { connect: [celeb1.id, celeb2.id] },
        },
      });

      expect(user.followingIds).toHaveLength(2);
      expect(user.followingIds.sort()).toEqual([celeb1.id, celeb2.id].sort());
    });
  });

  describe('create with following create', () => {
    test('should create user with nested following create', async () => {
      const user = await client.db.SocialUser.create({
        data: {
          name: 'User',
          following: {
            create: [{ name: 'New Celeb 1' }, { name: 'New Celeb 2' }],
          },
        },
      });

      expect(user.followingIds).toHaveLength(2);

      // Verify created users exist
      const following = await client.db.SocialUser.findMany({
        where: { id: { in: user.followingIds } },
      });
      expect(following.map((f) => f.name).sort()).toEqual(['New Celeb 1', 'New Celeb 2']);
    });
  });

  describe('twitter-style relationships', () => {
    test('should create asymmetric follow relationships', async () => {
      const celeb = await client.db.SocialUser.create({
        data: { name: 'Celebrity' },
      });

      const fan1 = await client.db.SocialUser.create({
        data: { name: 'Fan 1', following: { connect: [celeb.id] } },
      });
      const fan2 = await client.db.SocialUser.create({
        data: { name: 'Fan 2', following: { connect: [celeb.id] } },
      });

      // Fans follow celeb
      expect(fan1.followingIds.some((id) => id.equals(celeb.id))).toBe(true);
      expect(fan2.followingIds.some((id) => id.equals(celeb.id))).toBe(true);

      // Celeb doesn't follow anyone
      const celebResult = await client.db.SocialUser.findOne({
        where: { id: celeb.id },
      });
      expect(celebResult?.followingIds).toEqual([]);
    });
  });
});
