/**
 * E2E Tests: literal member validation on update paths
 *
 * An object or tuple variant of a literal is checked member by member on updateMany, updateUnique
 * and upsert before the query is sent, as on create. Before the check ran ahead of the transform, a
 * fraction in an int member was floored and stored. Schema: literals.cerial (LiteralWithObjectVariant,
 * LiteralWithTuple).
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

describe('E2E Literals: Update Member Validation', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.literals);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.literals);
  });

  const seed = () => client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'a', payload: 1 } } });
  const stored = async (id: Awaited<ReturnType<typeof seed>>['id']) =>
    (await client.db.LiteralWithObjectVariant.findOne({ where: { id } }))!.payload;

  describe('object variant', () => {
    test('updateMany refuses a fraction in an int member and keeps the row', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.LiteralWithObjectVariant.updateMany({
            where: { id: row.id },
            data: { payload: { label: 'b', payload: 1.5 } },
          }),
        'payload',
      );
      expect(await stored(row.id)).toEqual({ label: 'a', payload: 1 });
    });

    test('updateMany refuses a wrong-typed member and an undeclared key', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.LiteralWithObjectVariant.updateMany({
            where: { id: row.id },
            // @ts-expect-error - label is a string
            data: { payload: { label: 5, payload: 1 } },
          }),
        'payload',
      );
      await refuses(
        () =>
          client.db.LiteralWithObjectVariant.updateMany({
            where: { id: row.id },
            // @ts-expect-error - extra is not a key of LiteralPoint
            data: { payload: { label: 'b', payload: 1, extra: 1 } },
          }),
        'payload',
      );
      expect(await stored(row.id)).toEqual({ label: 'a', payload: 1 });
    });

    test('updateMany accepts an integral number in the int member', async () => {
      const row = await seed();
      const [updated] = await client.db.LiteralWithObjectVariant.updateMany({
        where: { id: row.id },
        data: { payload: { label: 'b', payload: 3.0 } },
      });

      expect(updated!.payload).toEqual({ label: 'b', payload: 3 });
    });

    test('updateUnique refuses a fraction and accepts an integral number', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.LiteralWithObjectVariant.updateUnique({
            where: { id: row.id },
            data: { payload: { label: 'b', payload: 2.5 } },
          }),
        'payload',
      );
      expect(await stored(row.id)).toEqual({ label: 'a', payload: 1 });
      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: row.id },
        data: { payload: { label: 'b', payload: 4 } },
      });
      expect(updated!.payload).toEqual({ label: 'b', payload: 4 });
    });

    test('updateUnique refuses a fraction in an array element', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.LiteralWithObjectVariant.updateUnique({
            where: { id: row.id },
            data: { payloads: [{ label: 'b', payload: 1.5 }] },
          }),
        'payloads',
      );
      await refuses(
        () =>
          client.db.LiteralWithObjectVariant.updateUnique({
            where: { id: row.id },
            data: { payloads: { push: { label: 'b', payload: 1.5 } } },
          }),
        'payloads',
      );
      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: row.id },
        data: { payloads: { push: { label: 'b', payload: 2 } } },
      });
      expect(updated!.payloads).toEqual([{ label: 'b', payload: 2 }]);
    });

    test('upsert update half refuses a fraction and accepts an integral number', async () => {
      const row = await seed();
      await refuses(
        () =>
          client.db.LiteralWithObjectVariant.upsert({
            where: { id: row.id },
            create: { payload: 'empty' },
            update: { payload: { label: 'b', payload: 1.5 } },
          }),
        'payload',
      );
      expect(await stored(row.id)).toEqual({ label: 'a', payload: 1 });
      const updated = await client.db.LiteralWithObjectVariant.upsert({
        where: { id: row.id },
        create: { payload: 'empty' },
        update: { payload: { label: 'b', payload: 6.0 } },
      });
      expect(updated!.payload).toEqual({ label: 'b', payload: 6 });
    });
  });

  describe('tuple variant', () => {
    const seedTuple = () => client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });
    const storedTuple = async (id: Awaited<ReturnType<typeof seedTuple>>['id']) =>
      (await client.db.LiteralWithTuple.findOne({ where: { id } }))!.payload;

    test('updateMany, updateUnique and upsert refuse a wrong-typed member and keep the row', async () => {
      const row = await seedTuple();
      await refuses(
        () =>
          client.db.LiteralWithTuple.updateMany({
            where: { id: row.id },
            // @ts-expect-error - a string where a float member is expected
            data: { payload: [1, 'a'] },
          }),
        'payload',
      );
      await refuses(
        () =>
          client.db.LiteralWithTuple.updateUnique({
            where: { id: row.id },
            // @ts-expect-error - a string where a float member is expected
            data: { payload: ['a', 1] },
          }),
        'payload',
      );
      await refuses(
        () =>
          client.db.LiteralWithTuple.upsert({
            where: { id: row.id },
            create: { payload: 'none' },
            // @ts-expect-error - a string where a float member is expected
            update: { payload: [1, 'a'] },
          }),
        'payload',
      );
      expect(await storedTuple(row.id)).toEqual([1, 2]);
    });

    test('accepts integral and fractional numbers in float members on every path', async () => {
      const row = await seedTuple();
      const [many] = await client.db.LiteralWithTuple.updateMany({
        where: { id: row.id },
        data: { payload: [3.0, 4.5] },
      });
      expect(many!.payload).toEqual([3, 4.5]);
      const unique = await client.db.LiteralWithTuple.updateUnique({
        where: { id: row.id },
        data: { payload: [5, 6] },
      });
      expect(unique!.payload).toEqual([5, 6]);
      const upserted = await client.db.LiteralWithTuple.upsert({
        where: { id: row.id },
        create: { payload: 'none' },
        update: { payload: [7.5, 8] },
      });
      expect(upserted!.payload).toEqual([7.5, 8]);
    });
  });
});
