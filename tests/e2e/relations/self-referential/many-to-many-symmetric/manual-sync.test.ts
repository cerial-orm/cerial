/**
 * E2E Tests: Self-Referential Many-to-Many Symmetric - Manual Sync
 *
 * Schema: self-ref-many-to-many-symmetric.cerial
 * Tests that friendship requires manual synchronization on both sides.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref Many-to-Many Symmetric: Manual Sync', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefManyToManySymmetric);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('one-way friendship', () => {
    test('connecting A to B does NOT connect B to A', async () => {
      const alice = await client.db.Friend.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.Friend.create({
        data: { name: 'Bob' },
      });

      // Alice adds Bob as friend
      await client.db.Friend.updateMany({
        where: { id: alice.id },
        data: { friends: { connect: [bob.id] } },
      });

      // Check Alice - has Bob
      const aliceResult = await client.db.Friend.findOne({
        where: { id: alice.id },
      });
      expect(aliceResult?.friendIds).toContain(bob.id);

      // Check Bob - does NOT have Alice (no auto-sync)
      const bobResult = await client.db.Friend.findOne({
        where: { id: bob.id },
      });
      expect(bobResult?.friendIds).not.toContain(alice.id);
    });
  });

  describe('bidirectional friendship (manual)', () => {
    test('should manually sync both sides for true friendship', async () => {
      const alice = await client.db.Friend.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.Friend.create({
        data: { name: 'Bob' },
      });

      // Alice adds Bob
      await client.db.Friend.updateMany({
        where: { id: alice.id },
        data: { friends: { connect: [bob.id] } },
      });

      // Bob adds Alice (manual sync)
      await client.db.Friend.updateMany({
        where: { id: bob.id },
        data: { friends: { connect: [alice.id] } },
      });

      // Now both have each other
      const aliceResult = await client.db.Friend.findOne({
        where: { id: alice.id },
      });
      const bobResult = await client.db.Friend.findOne({
        where: { id: bob.id },
      });

      expect(aliceResult?.friendIds).toContain(bob.id);
      expect(bobResult?.friendIds).toContain(alice.id);
    });

    test('should manually unfriend both sides', async () => {
      // Create mutual friends
      const alice = await client.db.Friend.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.Friend.create({
        data: { name: 'Bob', friends: { connect: [alice.id] } },
      });
      await client.db.Friend.updateMany({
        where: { id: alice.id },
        data: { friends: { connect: [bob.id] } },
      });

      // Alice unfriends Bob
      await client.db.Friend.updateMany({
        where: { id: alice.id },
        data: { friends: { disconnect: [bob.id] } },
      });

      // Also unfriend from Bob's side
      await client.db.Friend.updateMany({
        where: { id: bob.id },
        data: { friends: { disconnect: [alice.id] } },
      });

      const aliceResult = await client.db.Friend.findOne({
        where: { id: alice.id },
      });
      const bobResult = await client.db.Friend.findOne({
        where: { id: bob.id },
      });

      expect(aliceResult?.friendIds).not.toContain(bob.id);
      expect(bobResult?.friendIds).not.toContain(alice.id);
    });
  });

  describe('friend of friend', () => {
    test('should traverse friends manually', async () => {
      const alice = await client.db.Friend.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.Friend.create({
        data: { name: 'Bob', friends: { connect: [alice.id] } },
      });
      const charlie = await client.db.Friend.create({
        data: { name: 'Charlie', friends: { connect: [bob.id] } },
      });

      // Make symmetric
      await client.db.Friend.updateMany({
        where: { id: alice.id },
        data: { friends: { connect: [bob.id] } },
      });
      await client.db.Friend.updateMany({
        where: { id: bob.id },
        data: { friends: { connect: [charlie.id] } },
      });

      // Find friends of friends for Alice
      const aliceWithFriends = await client.db.Friend.findOne({
        where: { id: alice.id },
        include: { friends: true },
      });

      // Alice's friend (Bob)
      expect(aliceWithFriends?.friends?.[0]?.name).toBe('Bob');

      // Bob's friends would need another query
      const bobWithFriends = await client.db.Friend.findOne({
        where: { id: bob.id },
        include: { friends: true },
      });
      expect(bobWithFriends?.friends?.map((f) => f.name).sort()).toEqual([
        'Alice',
        'Charlie',
      ]);
    });
  });
});
