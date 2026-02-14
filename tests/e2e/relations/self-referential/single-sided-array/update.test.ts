/**
 * E2E Tests: Self-Referential Single-Sided Array - Update
 *
 * Schema: self-ref-single-sided-array.cerial
 * Tests updating following relationships.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref Single-Sided Array: Update', () => {
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

  describe('update connect (follow)', () => {
    test('should follow user via connect', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'User' },
      });
      const celeb = await client.db.SocialUser.create({
        data: { name: 'Celebrity' },
      });

      await client.db.SocialUser.updateMany({
        where: { id: user.id },
        data: { following: { connect: [celeb.id] } },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
      });

      expect(result?.followingIds?.some((id) => id.equals(celeb.id))).toBe(true);
    });

    test('should follow multiple users', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'User' },
      });
      const c1 = await client.db.SocialUser.create({ data: { name: 'C1' } });
      const c2 = await client.db.SocialUser.create({ data: { name: 'C2' } });
      const c3 = await client.db.SocialUser.create({ data: { name: 'C3' } });

      await client.db.SocialUser.updateMany({
        where: { id: user.id },
        data: { following: { connect: [c1.id, c2.id, c3.id] } },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
      });

      expect(result?.followingIds).toHaveLength(3);
    });
  });

  describe('update disconnect (unfollow)', () => {
    test('should unfollow user via disconnect', async () => {
      const celeb = await client.db.SocialUser.create({
        data: { name: 'Celebrity' },
      });
      const user = await client.db.SocialUser.create({
        data: { name: 'User', following: { connect: [celeb.id] } },
      });

      expect(user.followingIds.some((id) => id.equals(celeb.id))).toBe(true);

      await client.db.SocialUser.updateMany({
        where: { id: user.id },
        data: { following: { disconnect: [celeb.id] } },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
      });

      expect(result?.followingIds?.some((id) => id.equals(celeb.id))).toBe(false);
    });

    test('should unfollow multiple users', async () => {
      const c1 = await client.db.SocialUser.create({ data: { name: 'C1' } });
      const c2 = await client.db.SocialUser.create({ data: { name: 'C2' } });
      const c3 = await client.db.SocialUser.create({ data: { name: 'C3' } });

      const user = await client.db.SocialUser.create({
        data: { name: 'User', following: { connect: [c1.id, c2.id, c3.id] } },
      });

      await client.db.SocialUser.updateMany({
        where: { id: user.id },
        data: { following: { disconnect: [c1.id, c2.id] } },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
      });

      expect(result?.followingIds).toHaveLength(1);
      expect(result?.followingIds?.some((id) => id.equals(c3.id))).toBe(true);
    });
  });

  describe('update set (replace following)', () => {
    test('should replace all following via set', async () => {
      const old1 = await client.db.SocialUser.create({ data: { name: 'Old1' } });
      const old2 = await client.db.SocialUser.create({ data: { name: 'Old2' } });
      const new1 = await client.db.SocialUser.create({ data: { name: 'New1' } });

      const user = await client.db.SocialUser.create({
        data: { name: 'User', following: { connect: [old1.id, old2.id] } },
      });

      await client.db.SocialUser.updateMany({
        where: { id: user.id },
        data: { following: { set: [new1.id] } },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
      });

      expect(result?.followingIds).toEqual([new1.id]);
    });

    test('should unfollow everyone via empty set', async () => {
      const celeb = await client.db.SocialUser.create({
        data: { name: 'Celebrity' },
      });
      const user = await client.db.SocialUser.create({
        data: { name: 'User', following: { connect: [celeb.id] } },
      });

      await client.db.SocialUser.updateMany({
        where: { id: user.id },
        data: { following: { set: [] } },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
      });

      expect(result?.followingIds).toEqual([]);
    });
  });
});
