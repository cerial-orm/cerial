/**
 * E2E Tests: Self-Referential Many-to-Many Symmetric - Update
 *
 * Schema: self-ref-many-to-many-symmetric.cerial
 * Tests updating friend relationships.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref Many-to-Many Symmetric: Update', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefManyToManySymmetric);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefManyToManySymmetric);
  });

  describe('update connect', () => {
    test('should add friends via connect', async () => {
      const person = await client.db.Friend.create({
        data: { name: 'Person' },
      });
      const newFriend = await client.db.Friend.create({
        data: { name: 'New Friend' },
      });

      await client.db.Friend.updateMany({
        where: { id: person.id },
        data: { friends: { connect: [newFriend.id] } },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
      });

      expect(result?.friendIds?.some((id) => id.equals(newFriend.id))).toBe(true);
    });

    test('should add multiple friends', async () => {
      const person = await client.db.Friend.create({
        data: { name: 'Person' },
      });
      const f1 = await client.db.Friend.create({ data: { name: 'F1' } });
      const f2 = await client.db.Friend.create({ data: { name: 'F2' } });

      await client.db.Friend.updateMany({
        where: { id: person.id },
        data: { friends: { connect: [f1.id, f2.id] } },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
      });

      expect(result?.friendIds).toHaveLength(2);
    });
  });

  describe('update disconnect', () => {
    test('should remove friend via disconnect', async () => {
      const friend = await client.db.Friend.create({
        data: { name: 'Friend' },
      });
      const person = await client.db.Friend.create({
        data: { name: 'Person', friends: { connect: [friend.id] } },
      });

      expect(person.friendIds.some((id) => id.equals(friend.id))).toBe(true);

      await client.db.Friend.updateMany({
        where: { id: person.id },
        data: { friends: { disconnect: [friend.id] } },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
      });

      expect(result?.friendIds?.some((id) => id.equals(friend.id))).toBe(false);
    });

    test('should remove multiple friends', async () => {
      const f1 = await client.db.Friend.create({ data: { name: 'F1' } });
      const f2 = await client.db.Friend.create({ data: { name: 'F2' } });
      const f3 = await client.db.Friend.create({ data: { name: 'F3' } });

      const person = await client.db.Friend.create({
        data: { name: 'Person', friends: { connect: [f1.id, f2.id, f3.id] } },
      });

      await client.db.Friend.updateMany({
        where: { id: person.id },
        data: { friends: { disconnect: [f1.id, f2.id] } },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
      });

      expect(result?.friendIds).toHaveLength(1);
      expect(result?.friendIds?.some((id) => id.equals(f3.id))).toBe(true);
    });
  });

  describe('update set', () => {
    test('should replace all friends via set', async () => {
      const oldFriend = await client.db.Friend.create({
        data: { name: 'Old' },
      });
      const newFriend = await client.db.Friend.create({
        data: { name: 'New' },
      });
      const person = await client.db.Friend.create({
        data: { name: 'Person', friends: { connect: [oldFriend.id] } },
      });

      await client.db.Friend.updateMany({
        where: { id: person.id },
        data: { friends: { set: [newFriend.id] } },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
      });

      expect(result?.friendIds).toEqual([newFriend.id]);
    });
  });
});
