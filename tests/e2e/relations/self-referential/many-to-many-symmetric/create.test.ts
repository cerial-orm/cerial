/**
 * E2E Tests: Self-Referential Many-to-Many Symmetric - Create
 *
 * Schema: self-ref-many-to-many-symmetric.cerial
 * - Friend: id, name, friendIds (Record[]), friends (Relation[] @field)
 *
 * Tests symmetric n-n self-reference where user manages both sides.
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

describe('E2E Self-Ref Many-to-Many Symmetric: Create', () => {
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

  describe('create without friends', () => {
    test('should create person with no friends', async () => {
      const person = await client.db.Friend.create({
        data: { name: 'Lonely' },
      });

      expect(person.friendIds).toEqual([]);
    });
  });

  describe('create with friends connect', () => {
    test('should create person with friends via connect', async () => {
      const friend1 = await client.db.Friend.create({
        data: { name: 'Friend 1' },
      });
      const friend2 = await client.db.Friend.create({
        data: { name: 'Friend 2' },
      });

      const person = await client.db.Friend.create({
        data: {
          name: 'Person',
          friends: { connect: [friend1.id, friend2.id] },
        },
      });

      expect(person.friendIds).toHaveLength(2);
      expect(person.friendIds.sort()).toEqual([friend1.id, friend2.id].sort());
    });
  });

  describe('create with friends create', () => {
    test('should create person with nested friends create', async () => {
      const person = await client.db.Friend.create({
        data: {
          name: 'Person',
          friends: {
            create: [{ name: 'New Friend 1' }, { name: 'New Friend 2' }],
          },
        },
      });

      expect(person.friendIds).toHaveLength(2);

      // Verify friends exist
      const friends = await client.db.Friend.findMany({
        where: { id: { in: person.friendIds } },
      });
      expect(friends.map((f) => f.name).sort()).toEqual(['New Friend 1', 'New Friend 2']);
    });
  });

  describe('create with connect and create', () => {
    test('should mix connect and create for friends', async () => {
      const existing = await client.db.Friend.create({
        data: { name: 'Existing' },
      });

      const person = await client.db.Friend.create({
        data: {
          name: 'Person',
          friends: {
            connect: [existing.id],
            create: [{ name: 'Brand New' }],
          },
        },
      });

      expect(person.friendIds).toHaveLength(2);
      expect(person.friendIds.some((id) => id.equals(existing.id))).toBe(true);
    });
  });
});
