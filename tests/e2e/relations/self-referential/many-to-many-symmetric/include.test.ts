/**
 * E2E Tests: Self-Referential Many-to-Many Symmetric - Include
 *
 * Schema: self-ref-many-to-many-symmetric.cerial
 * Tests including friends relation.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref Many-to-Many Symmetric: Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefManyToManySymmetric);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include friends', () => {
    test('should include friends when querying person', async () => {
      const person = await client.db.Friend.create({
        data: {
          name: 'Person',
          friends: {
            create: [{ name: 'Friend 1' }, { name: 'Friend 2' }],
          },
        },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
        include: { friends: true },
      });

      expect(result?.friends).toHaveLength(2);
      expect(result?.friends?.map((f) => f.name).sort()).toEqual([
        'Friend 1',
        'Friend 2',
      ]);
    });

    test('should return empty array for person with no friends', async () => {
      const person = await client.db.Friend.create({
        data: { name: 'Lonely' },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
        include: { friends: true },
      });

      expect(result?.friends).toEqual([]);
    });
  });

  describe('include with ordering', () => {
    test('should order friends by name', async () => {
      const person = await client.db.Friend.create({
        data: {
          name: 'Person',
          friends: {
            create: [{ name: 'Zebra' }, { name: 'Alpha' }, { name: 'Middle' }],
          },
        },
      });

      const result = await client.db.Friend.findOne({
        where: { id: person.id },
        include: {
          friends: {
            orderBy: { name: 'asc' },
          },
        },
      });

      expect(result?.friends?.map((f) => f.name)).toEqual([
        'Alpha',
        'Middle',
        'Zebra',
      ]);
    });
  });

  describe('nested includes', () => {
    test('should include friends of friends', async () => {
      const alice = await client.db.Friend.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.Friend.create({
        data: {
          name: 'Bob',
          friends: { connect: [alice.id] },
        },
      });

      // Alice adds Bob back
      await client.db.Friend.updateMany({
        where: { id: alice.id },
        data: { friends: { connect: [bob.id] } },
      });

      // Add Charlie as Bob's friend
      await client.db.Friend.create({
        data: {
          name: 'Charlie',
          friends: { connect: [bob.id] },
        },
      });

      // Update Bob to add Charlie
      const charlie = await client.db.Friend.findOne({
        where: { name: 'Charlie' },
      });
      await client.db.Friend.updateMany({
        where: { id: bob.id },
        data: { friends: { connect: [charlie!.id] } },
      });

      // Query Alice with nested friends
      const result = await client.db.Friend.findOne({
        where: { id: alice.id },
        include: {
          friends: {
            include: { friends: true },
          },
        },
      });

      expect(result?.friends?.[0]?.name).toBe('Bob');
      expect(result?.friends?.[0]?.friends?.map((f) => f.name).sort()).toEqual([
        'Alice',
        'Charlie',
      ]);
    });
  });

  describe('include in findMany', () => {
    test('should include friends for multiple people', async () => {
      await client.db.Friend.create({
        data: {
          name: 'P1',
          friends: { create: [{ name: 'F1' }] },
        },
      });
      await client.db.Friend.create({
        data: {
          name: 'P2',
          friends: { create: [{ name: 'F2' }, { name: 'F3' }] },
        },
      });

      const people = await client.db.Friend.findMany({
        where: { name: { startsWith: 'P' } },
        include: { friends: true },
        orderBy: { name: 'asc' },
      });

      expect(people).toHaveLength(2);
      expect(people[0]?.friends).toHaveLength(1);
      expect(people[1]?.friends).toHaveLength(2);
    });
  });
});
