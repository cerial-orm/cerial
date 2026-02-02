/**
 * E2E Tests: Self-Referential Single-Sided Array - Include
 *
 * Schema: self-ref-single-sided-array.cerial
 * Tests including following relation.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref Single-Sided Array: Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefSingleSidedArray);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include following', () => {
    test('should include following users', async () => {
      const user = await client.db.SocialUser.create({
        data: {
          name: 'User',
          following: {
            create: [{ name: 'Celeb 1' }, { name: 'Celeb 2' }],
          },
        },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
        include: { following: true },
      });

      expect(result?.following).toHaveLength(2);
      expect(result?.following?.map((f) => f.name).sort()).toEqual([
        'Celeb 1',
        'Celeb 2',
      ]);
    });

    test('should return empty array for user following nobody', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'Hermit' },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
        include: { following: true },
      });

      expect(result?.following).toEqual([]);
    });
  });

  describe('no followers include', () => {
    test('cannot include followers (not defined)', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'User' },
      });

      // Only following is available
      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
        // include: { followers: true }  // Would be type error
      });

      expect(result).toBeDefined();
      expect((result as any).followers).toBeUndefined();
    });
  });

  describe('include with ordering', () => {
    test('should order following by name', async () => {
      const user = await client.db.SocialUser.create({
        data: {
          name: 'User',
          following: {
            create: [{ name: 'Zebra' }, { name: 'Alpha' }, { name: 'Middle' }],
          },
        },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
        include: {
          following: {
            orderBy: { name: 'asc' },
          },
        },
      });

      expect(result?.following?.map((f) => f.name)).toEqual([
        'Alpha',
        'Middle',
        'Zebra',
      ]);
    });
  });

  describe('nested includes', () => {
    test('should include following of following', async () => {
      const celeb = await client.db.SocialUser.create({
        data: { name: 'Celebrity' },
      });

      const influencer = await client.db.SocialUser.create({
        data: {
          name: 'Influencer',
          following: { connect: [celeb.id] },
        },
      });

      const user = await client.db.SocialUser.create({
        data: {
          name: 'User',
          following: { connect: [influencer.id] },
        },
      });

      const result = await client.db.SocialUser.findOne({
        where: { id: user.id },
        include: {
          following: {
            include: { following: true },
          },
        },
      });

      expect(result?.following?.[0]?.name).toBe('Influencer');
      expect(result?.following?.[0]?.following?.[0]?.name).toBe('Celebrity');
    });
  });

  describe('include in findMany', () => {
    test('should include following for multiple users', async () => {
      await client.db.SocialUser.create({
        data: {
          name: 'User 1',
          following: { create: [{ name: 'F1' }] },
        },
      });
      await client.db.SocialUser.create({
        data: {
          name: 'User 2',
          following: { create: [{ name: 'F2' }, { name: 'F3' }] },
        },
      });

      const users = await client.db.SocialUser.findMany({
        where: { name: { startsWith: 'User' } },
        include: { following: true },
        orderBy: { name: 'asc' },
      });

      expect(users).toHaveLength(2);
      expect(users[0]?.following).toHaveLength(1);
      expect(users[1]?.following).toHaveLength(2);
    });
  });
});
