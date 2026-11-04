/**
 * E2E Tests: tuple member validation on update paths
 *
 * updateMany, updateUnique and upsert refuse a wrong member before the query is sent, as create does,
 * and leave the stored row untouched. Before the check ran ahead of the transform, a fraction in an
 * int member was floored and stored. Schema: tuples.cerial (TupleBasic, TupleNested, TupleObjInTuple).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const refuses = async (run: () => PromiseLike<unknown>, message: string): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);
};

describe('E2E Tuples: Update Member Validation', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.tuples);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.tuples);
  });

  const seed = () =>
    client.db.TupleBasic.create({
      data: { name: 'seed', location: [1, 2], entry: ['n', 5, true], history: [[1, 1]] },
    });

  describe('updateMany', () => {
    test('should refuse a fraction in an int member and keep the row', async () => {
      const row = await seed();
      await refuses(
        () => client.db.TupleBasic.updateMany({ where: { id: row.id }, data: { entry: ['n', 1.5, true] } }),
        'entry[1] must be of type int',
      );
      expect((await client.db.TupleBasic.findOne({ where: { id: row.id } }))!.entry).toEqual(['n', 5, true]);
    });

    test('should accept an integral number in int and float members', async () => {
      const row = await seed();
      const [updated] = await client.db.TupleBasic.updateMany({
        where: { id: row.id },
        data: { entry: ['n', 7.0, false], location: [3, 4.5] },
      });

      expect(updated!.entry).toEqual(['n', 7, false]);
      expect(updated!.location).toEqual([3, 4.5]);
    });

    test('should refuse a wrong-typed member', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.TupleBasic.updateMany({
            where: { id: row.id },
            // @ts-expect-error - a string where a float member is expected
            data: { location: [1, 'a'] },
          }),
        'location[1] must be of type float',
      );
    });

    test('should refuse a wrong-typed member in { set } and accept a valid one', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.TupleBasic.updateMany({
            where: { id: row.id },
            // @ts-expect-error - a string where a float member is expected
            data: { history: { set: [[1, 'a']] } },
          }),
        'history[0][1] must be of type float',
      );
      const [updated] = await client.db.TupleBasic.updateMany({
        where: { id: row.id },
        data: { history: { set: [[2.0, 3.5]] } },
      });
      expect(updated!.history).toEqual([[2, 3.5]]);
    });

    test('should refuse a wrong-typed push and accept a valid one', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.TupleBasic.updateMany({
            where: { id: row.id },
            // @ts-expect-error - a string where a float member is expected
            data: { history: { push: [1, 'a'] } },
          }),
        'history.push[0][1] must be of type float',
      );
      const [updated] = await client.db.TupleBasic.updateMany({
        where: { id: row.id },
        data: { history: { push: [2, 2.5] } },
      });
      expect(updated!.history).toEqual([
        [1, 1],
        [2, 2.5],
      ]);
    });

    test('should refuse a fraction in a per-element update of an int member and accept an integral one', async () => {
      const row = await seed();
      await refuses(
        () => client.db.TupleBasic.updateMany({ where: { id: row.id }, data: { entry: { 1: 2.5 } } }),
        'entry.1 must be of type int',
      );
      const [updated] = await client.db.TupleBasic.updateMany({
        where: { id: row.id },
        data: { entry: { 1: 8 } },
      });
      expect(updated!.entry).toEqual(['n', 8, true]);
    });

    test('should refuse a fraction in an int member nested in a tuple element', async () => {
      const row = await client.db.TupleNested.create({ data: { payload: ['p', [1, 2]] } });
      await refuses(
        () => client.db.TupleNested.updateMany({ where: { id: row.id }, data: { payload: ['p', [1.5, 2]] } }),
        'payload[1][0] must be of type int',
      );
      expect((await client.db.TupleNested.findOne({ where: { id: row.id } }))!.payload).toEqual(['p', [1, 2]]);
    });

    test('should refuse an undeclared key in a strict object element', async () => {
      const row = await client.db.TupleObjInTuple.create({ data: { place: ['a', { street: 's', city: 'c' }] } });
      await refuses(
        () =>
          client.db.TupleObjInTuple.updateMany({
            where: { id: row.id },
            // @ts-expect-error - extra is not a key of TupleAddress
            data: { place: ['a', { street: 's', city: 'c', extra: 1 }] },
          }),
        "Unknown field 'place[1].extra'",
      );
      expect((await client.db.TupleObjInTuple.findOne({ where: { id: row.id } }))!.place).toEqual([
        'a',
        { street: 's', city: 'c' },
      ]);
    });
  });

  describe('updateUnique', () => {
    test('should refuse a fraction in an int member and keep the row', async () => {
      const row = await seed();
      await refuses(
        () => client.db.TupleBasic.updateUnique({ where: { id: row.id }, data: { entry: ['n', 1.5, true] } }),
        'entry[1] must be of type int',
      );
      expect((await client.db.TupleBasic.findOne({ where: { id: row.id } }))!.entry).toEqual(['n', 5, true]);
    });

    test('should accept an integral number', async () => {
      const row = await seed();
      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: row.id },
        data: { entry: ['n', 6.0, true] },
      });

      expect(updated!.entry).toEqual(['n', 6, true]);
    });

    test('should refuse a wrong member in { set }, in push and a fraction in a per-element update', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.TupleBasic.updateUnique({
            where: { id: row.id },
            // @ts-expect-error - a string where a float member is expected
            data: { history: { set: [['a', 1]] } },
          }),
        'history[0][0] must be of type float',
      );
      await refuses(
        () =>
          client.db.TupleBasic.updateUnique({
            where: { id: row.id },
            // @ts-expect-error - a string where a float member is expected
            data: { history: { push: ['a', 1] } },
          }),
        'history.push[0][0] must be of type float',
      );
      await refuses(
        () => client.db.TupleBasic.updateUnique({ where: { id: row.id }, data: { entry: { 1: 2.5 } } }),
        'entry.1 must be of type int',
      );
      expect((await client.db.TupleBasic.findOne({ where: { id: row.id } }))!.entry).toEqual(['n', 5, true]);
    });

    test('should accept valid { set }, push and per-element updates', async () => {
      const row = await seed();
      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: row.id },
        data: { entry: { 1: 3 }, history: { push: [5, 6.5] } },
      });

      expect(updated!.entry).toEqual(['n', 3, true]);
      expect(updated!.history).toEqual([
        [1, 1],
        [5, 6.5],
      ]);
    });
  });

  describe('upsert update half', () => {
    test('should refuse a fraction in the update of an existing row and keep it', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.TupleBasic.upsert({
            where: { id: row.id },
            create: { name: 'c', location: [0, 0] },
            update: { entry: ['n', 1.5, true] },
          }),
        'entry[1] must be of type int',
      );
      expect((await client.db.TupleBasic.findOne({ where: { id: row.id } }))!.entry).toEqual(['n', 5, true]);
    });

    test('should refuse a bad update even when the row does not exist yet', async () => {
      await refuses(
        () =>
          client.db.TupleBasic.upsert({
            where: { name: 'nobody' },
            create: { name: 'nobody', location: [0, 0] },
            update: { entry: ['n', 1.5, true] },
          }),
        'entry[1] must be of type int',
      );
      expect(await client.db.TupleBasic.count()).toBe(0);
    });

    test('should refuse a wrong member in { set }, in push and a fraction in a per-element update', async () => {
      const row = await seed();
      const create = { name: 'c', location: [0, 0] as [number, number] };
      await refuses(
        () =>
          client.db.TupleBasic.upsert({
            where: { id: row.id },
            create,
            // @ts-expect-error - a string where a float member is expected
            update: { history: { set: [['a', 1]] } },
          }),
        'history[0][0] must be of type float',
      );
      await refuses(
        () =>
          client.db.TupleBasic.upsert({
            where: { id: row.id },
            create,
            // @ts-expect-error - a string where a float member is expected
            update: { history: { push: ['a', 1] } },
          }),
        'history.push[0][0] must be of type float',
      );
      await refuses(
        () => client.db.TupleBasic.upsert({ where: { id: row.id }, create, update: { entry: { 1: 2.5 } } }),
        'entry.1 must be of type int',
      );
    });

    test('should accept an integral number in the update half', async () => {
      const row = await seed();
      const updated = await client.db.TupleBasic.upsert({
        where: { id: row.id },
        create: { name: 'c', location: [0, 0] },
        update: { entry: ['n', 4.0, false], history: { push: [7, 8] } },
      });

      expect(updated!.entry).toEqual(['n', 4, false]);
      expect(updated!.history).toEqual([
        [1, 1],
        [7, 8],
      ]);
    });
  });
});
