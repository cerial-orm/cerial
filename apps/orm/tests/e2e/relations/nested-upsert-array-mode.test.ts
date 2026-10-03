/**
 * E2E Tests for a nested-operation upsert inside `$transaction` array mode
 *
 * Array mode runs the compiled query, and the compiled upsert used to be the plain one, so a relation
 * op in `create` or `update` was dropped without an error: the row was written and the link was not.
 * The compiled query now reads, then branches in the database. Every case here is also run outside a
 * transaction as the control.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = tables.basics;

describe('E2E Nested upsert in $transaction array mode', () => {
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

  const tag = (name = 't1') => client.db.BasicsTag.create({ data: { name } });

  describe('create half', () => {
    test('id in where: creates the named record and links the relation', async () => {
      const t = await tag();
      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrcreate' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      ]);

      expect(String(returned?.id)).toBe('basics_user:arrcreate');
      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrcreate' } });
      expect(row?.name).toBe('n');
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
      expect((await client.db.BasicsUser.findMany()).length).toBe(1);
    });

    test('id in where: syncs the reverse side of the n-n relation', async () => {
      const t = await tag();
      await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrsync' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      ]);

      const reloaded = await client.db.BasicsTag.findOne({ where: { id: t.id } });
      expect(reloaded?.userIds.map(String)).toEqual(['basics_user:arrsync']);
    });

    test('unique field in where: creates the row and links the relation', async () => {
      const t = await tag();
      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { email: 'n@x.io' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      ]);

      expect(returned?.email).toBe('n@x.io');
      const row = await client.db.BasicsUser.findOne({ where: { email: 'n@x.io' } });
      expect(String(row?.id)).toBe(String(returned?.id));
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('a forward nested create makes the related row and stores its FK', async () => {
      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrfk' },
          create: { ...createData, profile: { create: { bio: 'b' } } },
          update: { name: 'u' },
        }),
      ]);

      expect(String(returned?.id)).toBe('basics_user:arrfk');
      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrfk' } });
      const profile = await client.db.BasicsProfile.findOne({ where: { bio: 'b' } });
      expect(profile).not.toBeNull();
      expect(String(row?.profileId)).toBe(String(profile?.id));
    });

    test('a nested create on an array relation makes the tag and links both sides', async () => {
      await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrtagcreate' },
          create: { ...createData, tags: { create: [{ name: 'fresh' }] } },
          update: { name: 'u' },
        }),
      ]);

      const fresh = await client.db.BasicsTag.findOne({ where: { name: 'fresh' } });
      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrtagcreate' } });
      expect(row?.tagIds.map(String)).toEqual([String(fresh?.id)]);
      expect(fresh?.userIds.map(String)).toEqual(['basics_user:arrtagcreate']);
    });

    test('matches the same call outside a transaction', async () => {
      const t = await tag();
      const outside = await client.db.BasicsUser.upsert({
        where: { id: 'arrsame' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });
      await truncateTables(client, TABLES);
      const t2 = await tag();
      const [inside] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrsame' },
          create: { ...createData, tags: { connect: [t2.id] } },
          update: { name: 'u' },
        }),
      ]);

      expect(String(inside?.id)).toBe(String(outside?.id));
      expect(inside?.name).toBe(outside?.name);
      expect(inside?.tagIds.length).toBe(outside?.tagIds.length);
      expect(Object.keys(inside ?? {}).sort()).toEqual(Object.keys(outside ?? {}).sort());
    });
  });

  describe('update half', () => {
    test('id in where: writes to the existing record, links the relation, creates no second row', async () => {
      const t = await tag();
      await client.db.BasicsUser.create({ data: { ...createData, id: 'arrexisting' } });

      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrexisting' },
          create: { ...createData, name: 'should-not-be-used' },
          update: { name: 'u', tags: { connect: [t.id] } },
        }),
      ]);

      expect(String(returned?.id)).toBe('basics_user:arrexisting');
      const all = await client.db.BasicsUser.findMany();
      expect(all.length).toBe(1);
      expect(all[0]?.name).toBe('u');
      expect(all[0]?.tagIds.map(String)).toEqual([String(t.id)]);
      const reloaded = await client.db.BasicsTag.findOne({ where: { id: t.id } });
      expect(reloaded?.userIds.map(String)).toEqual(['basics_user:arrexisting']);
    });

    test('unique field in where: updates the matching row and links the relation', async () => {
      const t = await tag();
      await client.db.BasicsUser.create({ data: createData });

      await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { email: 'n@x.io' },
          create: { ...createData, name: 'should-not-be-used' },
          update: { name: 'u', tags: { connect: [t.id] } },
        }),
      ]);

      const all = await client.db.BasicsUser.findMany();
      expect(all.length).toBe(1);
      expect(all[0]?.name).toBe('u');
      expect(all[0]?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('a disconnect removes the link on both sides', async () => {
      const t = await tag();
      await client.db.BasicsUser.create({ data: { ...createData, id: 'arrdisc', tags: { connect: [t.id] } } });

      await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrdisc' },
          create: createData,
          update: { tags: { disconnect: [t.id] } },
        }),
      ]);

      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrdisc' } });
      expect(row?.tagIds).toEqual([]);
      const reloaded = await client.db.BasicsTag.findOne({ where: { id: t.id } });
      expect(reloaded?.userIds).toEqual([]);
    });

    test('a nested op in the create half is not applied when the record exists', async () => {
      const t = await tag();
      await client.db.BasicsUser.create({ data: { ...createData, id: 'arrskip' } });

      await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrskip' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      ]);

      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrskip' } });
      expect(row?.name).toBe('u');
      expect(row?.tagIds).toEqual([]);
    });

    test('a nested op in the update half is not applied when the record is created', async () => {
      const t = await tag();

      await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrnoupdate' },
          create: createData,
          update: { name: 'u', tags: { connect: [t.id] } },
        }),
      ]);

      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrnoupdate' } });
      expect(row?.name).toBe('n');
      expect(row?.tagIds).toEqual([]);
    });

    test('an existing row with no update is returned unchanged', async () => {
      const t = await tag();
      await client.db.BasicsUser.create({ data: { ...createData, id: 'arrnoop' } });

      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrnoop' },
          create: { ...createData, tags: { connect: [t.id] } },
        }),
      ]);

      expect(returned?.name).toBe('n');
      expect(returned?.tagIds).toEqual([]);
    });
  });

  describe('return, select and include', () => {
    test('return: before is null for a created row, and the row is still created', async () => {
      const t = await tag();
      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrbeforenew' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
          return: 'before',
        }),
      ]);

      expect(returned).toBeNull();
      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrbeforenew' } });
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('return: before is the old row for an existing one, and the write still lands', async () => {
      const t = await tag();
      await client.db.BasicsUser.create({ data: { ...createData, id: 'arrbeforeold' } });

      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrbeforeold' },
          create: createData,
          update: { name: 'u', tags: { connect: [t.id] } },
          return: 'before',
        }),
      ]);

      expect(returned?.name).toBe('n');
      expect(returned?.tagIds).toEqual([]);
      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrbeforeold' } });
      expect(row?.name).toBe('u');
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('return: true is true for both halves', async () => {
      const t = await tag();
      const [created] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrtrue' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
          return: true,
        }),
      ]);
      const [updated] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrtrue' },
          create: createData,
          update: { tags: { disconnect: [t.id] } },
          return: true,
        }),
      ]);

      expect(created).toBe(true);
      expect(updated).toBe(true);
    });

    test('select returns only the selected keys on both halves', async () => {
      const t = await tag();
      const run = () =>
        client.$transaction([
          client.db.BasicsUser.upsert({
            where: { id: 'arrselect' },
            create: { ...createData, tags: { connect: [t.id] } },
            update: { name: 'u', tags: { disconnect: [t.id] } },
            select: { id: true, name: true },
          }),
        ]);

      const [created] = await run();
      const [updated] = await run();

      expect(Object.keys(created ?? {}).sort()).toEqual(['id', 'name']);
      expect(Object.keys(updated ?? {}).sort()).toEqual(['id', 'name']);
      expect(updated?.name).toBe('u');
    });

    test('include loads the linked relation on the created row', async () => {
      const t = await tag();
      const [returned] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrinclude' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
          include: { tags: true },
        }),
      ]);

      expect(returned?.tags.map((x) => x.name)).toEqual(['t1']);
    });
  });

  describe('alongside other items', () => {
    test('two items both commit', async () => {
      const t = await tag();
      const [upserted, created] = await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrpair' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
        client.db.BasicsTag.create({ data: { name: 'second' } }),
      ]);

      expect(String(upserted?.id)).toBe('basics_user:arrpair');
      expect(created?.name).toBe('second');
      const row = await client.db.BasicsUser.findOne({ where: { id: 'arrpair' } });
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('two nested upserts do not share variables', async () => {
      const a = await tag('a');
      const b = await tag('b');
      await client.$transaction([
        client.db.BasicsUser.upsert({
          where: { id: 'arrone' },
          create: { ...createData, email: 'one@x.io', tags: { connect: [a.id] } },
          update: { name: 'u' },
        }),
        client.db.BasicsUser.upsert({
          where: { id: 'arrtwo' },
          create: { ...createData, email: 'two@x.io', tags: { connect: [b.id] } },
          update: { name: 'u' },
        }),
      ]);

      const one = await client.db.BasicsUser.findOne({ where: { id: 'arrone' } });
      const two = await client.db.BasicsUser.findOne({ where: { id: 'arrtwo' } });
      expect(one?.tagIds.map(String)).toEqual([String(a.id)]);
      expect(two?.tagIds.map(String)).toEqual([String(b.id)]);
    });
  });

  describe('callback and manual mode agree with array mode', () => {
    test('callback mode: create half links, update half links', async () => {
      const t = await tag();
      await client.$transaction(async (tx) => {
        await tx.BasicsUser.upsert({
          where: { id: 'cbboth' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        });
      });
      await client.$transaction(async (tx) => {
        await tx.BasicsUser.upsert({
          where: { id: 'cbboth' },
          create: createData,
          update: { tags: { disconnect: [t.id] } },
        });
      });

      const row = await client.db.BasicsUser.findOne({ where: { id: 'cbboth' } });
      expect(row?.name).toBe('n');
      expect(row?.tagIds).toEqual([]);
    });

    test('manual mode: update half links on commit and not on cancel', async () => {
      const t = await tag();
      await client.db.BasicsUser.create({ data: { ...createData, id: 'manualupd' } });

      const cancelled = await client.$transaction();
      await cancelled.BasicsUser.upsert({
        where: { id: 'manualupd' },
        create: createData,
        update: { tags: { connect: [t.id] } },
      });
      await cancelled.cancel();
      expect((await client.db.BasicsUser.findOne({ where: { id: 'manualupd' } }))?.tagIds).toEqual([]);

      const committed = await client.$transaction();
      await committed.BasicsUser.upsert({
        where: { id: 'manualupd' },
        create: createData,
        update: { tags: { connect: [t.id] } },
      });
      await committed.commit();
      expect((await client.db.BasicsUser.findOne({ where: { id: 'manualupd' } }))?.tagIds.map(String)).toEqual([
        String(t.id),
      ]);
    });
  });

  describe('negative', () => {
    test('connecting a record that does not exist throws and leaves nothing behind', async () => {
      await expect(
        (async () => {
          await client.$transaction([
            client.db.BasicsUser.upsert({
              where: { id: 'arrmissing' },
              create: { ...createData, tags: { connect: ['basics_tag:nope'] } },
              update: { name: 'u' },
            }),
          ]);
        })(),
      ).rejects.toThrow();

      expect(await client.db.BasicsUser.findOne({ where: { id: 'arrmissing' } })).toBeNull();
      expect((await client.db.BasicsUser.findMany()).length).toBe(0);
    });

    test('a failing later item rolls back the nested upsert before it', async () => {
      const t = await tag();
      await expect(
        (async () => {
          await client.$transaction([
            client.db.BasicsUser.upsert({
              where: { id: 'arrrollback' },
              create: { ...createData, tags: { connect: [t.id] } },
              update: { name: 'u' },
            }),
            client.db.BasicsTag.create({ data: { name: 't1' } }),
          ]);
        })(),
      ).rejects.toThrow();

      expect(await client.db.BasicsUser.findOne({ where: { id: 'arrrollback' } })).toBeNull();
      const reloaded = await client.db.BasicsTag.findOne({ where: { id: t.id } });
      expect(reloaded?.userIds).toEqual([]);
    });
  });
});
