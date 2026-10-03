/**
 * E2E Tests for the record id on the create half of a nested-operation upsert
 *
 * An upsert whose `where` names an id must create that record, even when the `create` payload carries
 * a nested relation op. Before the fix the nested create landed on a server-generated id, so the row
 * the caller asked for never existed and a read back by that id returned null.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = tables.basics;

describe('E2E Nested upsert create id', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
  });

  const createData = { name: 'n', email: 'n@x.io', isActive: true };

  const tag = () => client.db.Tag.create({ data: { name: 't1' } });

  describe('create half, id in where', () => {
    test('creates the record the where names and links the relation', async () => {
      const t = await tag();
      const returned = await client.db.User.upsert({
        where: { id: 'nestedcreate' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });

      expect(String(returned?.id)).toBe('user:nestedcreate');
      const row = await client.db.User.findOne({ where: { id: 'nestedcreate' } });
      expect(row).not.toBeNull();
      expect(row?.name).toBe('n');
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('syncs the reverse side of the n-n relation', async () => {
      const t = await tag();
      await client.db.User.upsert({
        where: { id: 'nestedsync' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });

      const reloaded = await client.db.Tag.findOne({ where: { id: t.id } });
      expect(reloaded?.userIds.map(String)).toEqual(['user:nestedsync']);
    });

    test('creates exactly one row, not one at the named id and one elsewhere', async () => {
      const t = await tag();
      await client.db.User.upsert({
        where: { id: 'nestedone' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });

      const all = await client.db.User.findMany();
      expect(all.map((u) => String(u.id))).toEqual(['user:nestedone']);
    });

    test('a forward nested create lands on the named id with its FK set', async () => {
      const returned = await client.db.User.upsert({
        where: { id: 'nestedfk' },
        create: { ...createData, profile: { create: { bio: 'b' } } },
        update: { name: 'u' },
      });

      expect(String(returned?.id)).toBe('user:nestedfk');
      const row = await client.db.User.findOne({ where: { id: 'nestedfk' } });
      expect(row?.profileId).not.toBeNull();
      const profile = await client.db.Profile.findOne({ where: { bio: 'b' } });
      expect(String(row?.profileId)).toBe(String(profile?.id));
    });

    test('matches what a plain create with the same nested op stores', async () => {
      const t = await tag();
      const plain = await client.db.User.create({
        data: { ...createData, id: 'plaincreate', tags: { connect: [t.id] } },
      });
      await truncateTables(client, TABLES);
      const t2 = await client.db.Tag.create({ data: { name: 't1' } });
      const nested = await client.db.User.upsert({
        where: { id: 'plaincreate' },
        create: { ...createData, tags: { connect: [t2.id] } },
        update: { name: 'u' },
      });

      expect(String(nested?.id)).toBe(String(plain.id));
      expect(nested?.name).toBe(plain.name);
      expect(nested?.tagIds.length).toBe(plain.tagIds.length);
    });

    test('honours return: before — null on create, and the row still lands on the named id', async () => {
      const t = await tag();
      const returned = await client.db.User.upsert({
        where: { id: 'nestedbefore' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
        return: 'before',
      });

      expect(returned).toBeNull();
      const row = await client.db.User.findOne({ where: { id: 'nestedbefore' } });
      expect(String(row?.id)).toBe('user:nestedbefore');
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('honours select — only the selected keys, with the named id', async () => {
      const t = await tag();
      const returned = await client.db.User.upsert({
        where: { id: 'nestedselect' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
        select: { id: true, name: true },
      });

      expect(Object.keys(returned ?? {}).sort()).toEqual(['id', 'name']);
      expect(String(returned?.id)).toBe('user:nestedselect');
    });
  });

  describe('create half, unique field in where', () => {
    test('creates the row and links the relation, with a generated id as the plain upsert does', async () => {
      const t = await tag();
      const returned = await client.db.User.upsert({
        where: { email: 'n@x.io' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });

      expect(returned?.email).toBe('n@x.io');
      const row = await client.db.User.findOne({ where: { email: 'n@x.io' } });
      expect(String(row?.id)).toBe(String(returned?.id));
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });
  });

  describe('update half, id in where', () => {
    test('writes to the existing record and creates no second row', async () => {
      const t = await tag();
      await client.db.User.create({ data: { ...createData, id: 'existing' } });

      const returned = await client.db.User.upsert({
        where: { id: 'existing' },
        create: { ...createData, name: 'should-not-be-used' },
        update: { name: 'u', tags: { connect: [t.id] } },
      });

      expect(String(returned?.id)).toBe('user:existing');
      const all = await client.db.User.findMany();
      expect(all.length).toBe(1);
      expect(all[0]?.name).toBe('u');
      expect(all[0]?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('a nested op in the create half is not applied when the record already exists', async () => {
      const t = await tag();
      await client.db.User.create({ data: { ...createData, id: 'existingskip' } });

      await client.db.User.upsert({
        where: { id: 'existingskip' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });

      const row = await client.db.User.findOne({ where: { id: 'existingskip' } });
      expect(row?.name).toBe('u');
      expect(row?.tagIds.map(String)).toEqual([]);
    });
  });

  describe('negative: connect to a record that does not exist', () => {
    test('throws and leaves no row at the named id', async () => {
      await expect(
        (async () => {
          await client.db.User.upsert({
            where: { id: 'nestedmissing' },
            create: { ...createData, tags: { connect: ['tag:nope'] } },
            update: { name: 'u' },
          });
        })(),
      ).rejects.toThrow();

      const row = await client.db.User.findOne({ where: { id: 'nestedmissing' } });
      expect(row).toBeNull();
      const all = await client.db.User.findMany();
      expect(all.length).toBe(0);
    });
  });

  describe('inside $transaction', () => {
    test('array mode: the row lands on the named id', async () => {
      const t = await tag();
      // Array mode runs the compiled query, which is built without the nested ops — the relation link
      // is a separate open defect, so only the record identity is asserted here
      const [returned] = await client.$transaction([
        client.db.User.upsert({
          where: { id: 'txnarray' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      ]);

      expect(String((returned as { id: unknown }).id)).toBe('user:txnarray');
      const row = await client.db.User.findOne({ where: { id: 'txnarray' } });
      expect(row?.name).toBe('n');
    });

    test('callback mode: the row lands on the named id with the relation linked', async () => {
      const t = await tag();
      await client.$transaction(async (tx) => {
        await tx.User.upsert({
          where: { id: 'txncallback' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        });
      });

      const row = await client.db.User.findOne({ where: { id: 'txncallback' } });
      expect(String(row?.id)).toBe('user:txncallback');
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('manual mode: the row lands on the named id with the relation linked', async () => {
      const t = await tag();
      const txn = await client.$transaction();
      await txn.User.upsert({
        where: { id: 'txnmanual' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });
      await txn.commit();

      const row = await client.db.User.findOne({ where: { id: 'txnmanual' } });
      expect(String(row?.id)).toBe('user:txnmanual');
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('manual mode negative: a cancel leaves no row at the named id', async () => {
      const t = await tag();
      const txn = await client.$transaction();
      await txn.User.upsert({
        where: { id: 'txncancel' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });
      await txn.cancel();

      const row = await client.db.User.findOne({ where: { id: 'txncancel' } });
      expect(row).toBeNull();
    });
  });
});
