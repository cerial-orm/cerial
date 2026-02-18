/**
 * E2E Tests: Self-Referential Single-Sided Array - No Sync
 *
 * Schema: self-ref-single-sided-array.cerial
 * Tests that following is one-way (no auto-sync).
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

describe('E2E Self-Ref Single-Sided Array: No Sync', () => {
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

  describe('asymmetric following', () => {
    test('A following B does NOT mean B follows A', async () => {
      const alice = await client.db.SocialUser.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.SocialUser.create({
        data: { name: 'Bob' },
      });

      // Alice follows Bob
      await client.db.SocialUser.updateMany({
        where: { id: alice.id },
        data: { following: { connect: [bob.id] } },
      });

      const aliceResult = await client.db.SocialUser.findOne({
        where: { id: alice.id },
      });
      const bobResult = await client.db.SocialUser.findOne({
        where: { id: bob.id },
      });

      // Alice follows Bob
      expect(aliceResult?.followingIds?.some((id) => id.equals(bob.id))).toBe(true);
      // Bob does NOT follow Alice
      expect(bobResult?.followingIds?.some((id) => id.equals(alice.id))).toBe(false);
    });
  });

  describe('no followers field', () => {
    test('user has no followers relation', async () => {
      const user = await client.db.SocialUser.create({
        data: { name: 'User' },
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe('User');
      expect((user as any).followers).toBeUndefined();
      expect((user as any).followerIds).toBeUndefined();
    });
  });

  describe('mutual follow (manual)', () => {
    test('mutual follow requires both sides', async () => {
      const alice = await client.db.SocialUser.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.SocialUser.create({
        data: { name: 'Bob' },
      });

      // Alice follows Bob
      await client.db.SocialUser.updateMany({
        where: { id: alice.id },
        data: { following: { connect: [bob.id] } },
      });

      // Bob follows Alice
      await client.db.SocialUser.updateMany({
        where: { id: bob.id },
        data: { following: { connect: [alice.id] } },
      });

      const aliceResult = await client.db.SocialUser.findOne({
        where: { id: alice.id },
      });
      const bobResult = await client.db.SocialUser.findOne({
        where: { id: bob.id },
      });

      // Now mutual
      expect(aliceResult?.followingIds?.some((id) => id.equals(bob.id))).toBe(true);
      expect(bobResult?.followingIds?.some((id) => id.equals(alice.id))).toBe(true);
    });
  });
});
