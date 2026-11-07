/**
 * E2E Tests for a nested-operation upsert whose `where` does not name one row
 *
 * A relation op needs one row to attach to. A `where` that is neither an id nor a @unique field can
 * match none or several, and the op used to be discarded without an error. It is now rejected with a
 * validation error naming the model and the operation, in every transaction mode. Controls: the same
 * `where` without a relation op, and a unique `where` with the op, both still work.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialError, CerialValidationError } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = tables.basics;

describe('E2E Nested upsert on a non-unique where', () => {
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

  /** The upsert fails while compiling, before a promise exists, so the thunk is called inside try. */
  async function caught(run: () => PromiseLike<unknown>): Promise<unknown> {
    try {
      await run();
    } catch (error) {
      return error;
    }

    return undefined;
  }

  function expectRejection(error: unknown): void {
    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialError).code).toBe('C3000');
    expect((error as CerialError).model).toBe('BasicsUser');
    expect((error as CerialError).operation).toBe('upsert');
    expect((error as Error).message).toContain('upsert on BasicsUser');
    expect((error as Error).message).toContain('names exactly one row');
  }

  async function expectNothingWritten(tagId: unknown): Promise<void> {
    expect((await client.db.BasicsUser.findMany()).length).toBe(0);
    const reloaded = await client.db.BasicsTag.findOne({ where: { id: tagId as string } });
    expect(reloaded?.userIds).toEqual([]);
  }

  describe('negative: the relation op is rejected, not dropped', () => {
    test('connect in create', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      const error = await caught(() =>
        client.db.BasicsUser.upsert({
          where: { name: 'nope' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      );

      expectRejection(error);
      await expectNothingWritten(t.id);
    });

    test('a nested create in create', async () => {
      const error = await caught(() =>
        client.db.BasicsUser.upsert({
          where: { name: 'nope' },
          create: { ...createData, profile: { create: { bio: 'b' } } },
          update: { name: 'u' },
        }),
      );

      expectRejection(error);
      expect(await client.db.BasicsProfile.findMany()).toEqual([]);
      expect((await client.db.BasicsUser.findMany()).length).toBe(0);
    });

    test('connect in update only', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      await client.db.BasicsUser.create({ data: createData });
      const error = await caught(() =>
        client.db.BasicsUser.upsert({
          where: { name: 'n' },
          create: { ...createData, email: 'other@x.io' },
          update: { tags: { connect: [t.id] } },
        }),
      );

      expectRejection(error);
      const row = await client.db.BasicsUser.findOne({ where: { email: 'n@x.io' } });
      expect(row?.tagIds).toEqual([]);
    });

    test('a where with only a logical operator', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      const error = await caught(() =>
        client.db.BasicsUser.upsert({
          where: { OR: [{ name: 'a' }, { name: 'b' }] },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      );

      expectRejection(error);
      await expectNothingWritten(t.id);
    });

    test('where with a filter object on a non-unique field', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      const error = await caught(() =>
        client.db.BasicsUser.upsert({
          where: { age: { gt: 3 } },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      );

      expectRejection(error);
    });

    test('$transaction array mode', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      const error = await caught(() =>
        client.$transaction([
          client.db.BasicsUser.upsert({
            where: { name: 'nope' },
            create: { ...createData, tags: { connect: [t.id] } },
            update: { name: 'u' },
          }),
        ]),
      );

      expectRejection(error);
      await expectNothingWritten(t.id);
    });

    test('$transaction callback mode, and nothing from the callback commits', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      const error = await caught(() =>
        client.$transaction(async (tx) => {
          await tx.BasicsUser.create({ data: { ...createData, email: 'before@x.io' } });
          await tx.BasicsUser.upsert({
            where: { name: 'nope' },
            create: { ...createData, tags: { connect: [t.id] } },
            update: { name: 'u' },
          });
        }),
      );

      expectRejection(error);
      await expectNothingWritten(t.id);
    });

    test('$transaction manual mode, and the cancel leaves nothing', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      const txn = await client.$transaction();
      const error = await caught(() =>
        txn.BasicsUser.upsert({
          where: { name: 'nope' },
          create: { ...createData, tags: { connect: [t.id] } },
          update: { name: 'u' },
        }),
      );
      await txn.cancel();

      expectRejection(error);
      await expectNothingWritten(t.id);
    });
  });

  describe('positive controls', () => {
    test('the same non-unique where without a relation op still creates one row', async () => {
      const returned = await client.db.BasicsUser.upsert({
        where: { name: 'nope' },
        create: createData,
        update: { age: 1 },
      });

      expect(returned.length).toBe(1);
      expect((await client.db.BasicsUser.findMany()).length).toBe(1);
    });

    test('the same non-unique where without a relation op updates the first match only', async () => {
      await client.db.BasicsUser.create({ data: { ...createData, email: 'a@x.io' } });
      await client.db.BasicsUser.create({ data: { ...createData, email: 'b@x.io' } });

      const returned = await client.db.BasicsUser.upsert({
        where: { name: 'n' },
        create: createData,
        update: { age: 7 },
      });

      expect(returned.length).toBe(1);
      expect((await client.db.BasicsUser.findMany()).filter((u) => u.age === 7)).toHaveLength(1);
    });

    test('a unique field in where takes the relation op', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      await client.db.BasicsUser.upsert({
        where: { email: 'n@x.io' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });

      const row = await client.db.BasicsUser.findOne({ where: { email: 'n@x.io' } });
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });

    test('an id in where plus a non-unique key takes the relation op', async () => {
      const t = await client.db.BasicsTag.create({ data: { name: 't1' } });
      await client.db.BasicsUser.upsert({
        where: { id: 'withid', name: 'n' },
        create: { ...createData, tags: { connect: [t.id] } },
        update: { name: 'u' },
      });

      const row = await client.db.BasicsUser.findOne({ where: { id: 'withid' } });
      expect(row?.tagIds.map(String)).toEqual([String(t.id)]);
    });
  });
});
