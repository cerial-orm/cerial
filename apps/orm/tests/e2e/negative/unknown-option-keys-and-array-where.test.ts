/**
 * E2E Tests: an options key the method does not take, and updateWhere / unset on an object array
 *
 * `deleteMany({ wehre })` used to delete every row and `findMany({ wehre })` returned every row; now each
 * method names the key and does nothing. `updateWhere` and `unset: { where }` on an object array used to
 * report success while changing nothing; now they are refused and the array is unchanged. Every valid key
 * still works.
 *
 * Schema: complex-types/objects (ObjectTestUser with a GeoPoint[] field)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// What a JavaScript or JSON caller can send; the generated types reject it
const hostile = (value: unknown): never => value as never;

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

const address = { street: 's', city: 'c', state: 'st' };

describe('Unknown option keys and updateWhere on an object array — negative and positive cases', () => {
  let client: CerialClient;

  const names = async () => (await client.db.ObjectTestUser.findMany({ orderBy: { name: 'asc' } })).map((u) => u.name);

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.objects);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.objects);
    await client.db.ObjectTestUser.create({
      data: {
        name: 'Ada',
        address,
        locations: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
        ],
      },
    });
    await client.db.ObjectTestUser.create({ data: { name: 'Bob', address, locations: [] } });
  });

  describe('a misspelled key', () => {
    test('deleteMany refuses it and deletes nothing', async () => {
      await rejects(
        () => client.db.ObjectTestUser.deleteMany(hostile({ wehre: { name: 'Ada' } })),
        "deleteMany does not take the option 'wehre'",
      );
      expect(await names()).toEqual(['Ada', 'Bob']);
    });

    test('a valid where beside a stray key still refuses and deletes nothing', async () => {
      await rejects(
        () => client.db.ObjectTestUser.deleteMany(hostile({ where: { name: 'Ada' }, limit: 1 })),
        "deleteMany does not take the option 'limit'",
      );
      expect(await names()).toEqual(['Ada', 'Bob']);
    });

    test('findMany, findOne and findUnique refuse it', async () => {
      await rejects(
        () => client.db.ObjectTestUser.findMany(hostile({ wehre: { name: 'Ada' } })),
        "findMany does not take the option 'wehre'",
      );
      await rejects(
        () => client.db.ObjectTestUser.findOne(hostile({ wehre: { name: 'Ada' } })),
        "findOne does not take the option 'wehre'",
      );
      await rejects(
        () => client.db.ObjectTestUser.findUnique(hostile({ where: { id: 'x' }, slect: { name: true } })),
        "findUnique does not take the option 'slect'",
      );
    });

    test('updateMany, updateUnique and upsert refuse it and change nothing', async () => {
      await rejects(
        () => client.db.ObjectTestUser.updateMany(hostile({ data: { name: 'Z' }, whre: { name: 'Ada' } })),
        "updateMany does not take the option 'whre'",
      );
      await rejects(
        () => client.db.ObjectTestUser.updateUnique(hostile({ where: { id: 'x' }, data: { name: 'Z' }, retrun: true })),
        "updateUnique does not take the option 'retrun'",
      );
      await rejects(
        () =>
          client.db.ObjectTestUser.upsert(
            hostile({ where: { name: 'Ada' }, create: { name: 'N', address, locations: [] }, updat: { name: 'Z' } }),
          ),
        "upsert does not take the option 'updat'",
      );
      expect(await names()).toEqual(['Ada', 'Bob']);
    });

    test('create and deleteUnique refuse it', async () => {
      await rejects(
        () => client.db.ObjectTestUser.create(hostile({ data: { name: 'N', address, locations: [] }, slect: {} })),
        "create does not take the option 'slect'",
      );
      await rejects(
        () => client.db.ObjectTestUser.deleteUnique(hostile({ where: { id: 'x' }, retrun: true })),
        "deleteUnique does not take the option 'retrun'",
      );
      expect(await names()).toEqual(['Ada', 'Bob']);
    });

    test('inside a transaction it refuses and the transaction rolls back', async () => {
      await rejects(
        () =>
          client.$transaction([
            client.db.ObjectTestUser.create({ data: { name: 'Cy', address, locations: [] } }),
            client.db.ObjectTestUser.deleteMany(hostile({ wehre: { name: 'Ada' } })),
          ]),
        "deleteMany does not take the option 'wehre'",
      );
      expect(await names()).toEqual(['Ada', 'Bob']);
    });
  });

  describe('every valid key still works', () => {
    test('read methods', async () => {
      const found = await client.db.ObjectTestUser.findMany({
        where: { name: { in: ['Ada', 'Bob'] } },
        select: { name: true },
        orderBy: { name: 'desc' },
        limit: 1,
        offset: 1,
      });
      expect(found.map((u) => u.name)).toEqual(['Ada']);
      expect((await client.db.ObjectTestUser.findOne({ where: { name: 'Bob' }, orderBy: { name: 'asc' } }))?.name).toBe(
        'Bob',
      );
    });

    test('write methods, including txn and return', async () => {
      const txn = await client.$transaction(async (tx) => {
        await tx.ObjectTestUser.updateMany({ where: { name: 'Bob' }, data: { name: 'Bo' }, select: { name: true } });

        return true;
      });
      expect(txn).toBe(true);
      expect(await names()).toEqual(['Ada', 'Bo']);
      expect(await client.db.ObjectTestUser.deleteMany({ where: { name: 'Bo' } })).toBe(1);
      expect(await names()).toEqual(['Ada']);
    });
  });

  describe('updateWhere and unset on an object array', () => {
    const locations = async () => (await client.db.ObjectTestUser.findOne({ where: { name: 'Ada' } }))?.locations;

    test('updateWhere is refused on updateMany and the array is unchanged', async () => {
      await rejects(
        () =>
          client.db.ObjectTestUser.updateMany({
            where: { name: 'Ada' },
            data: { locations: { updateWhere: { where: { lat: 1 }, data: { lat: 9 } } } },
          }),
        'locations.updateWhere is not supported',
      );
      expect(await locations()).toEqual([
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ]);
    });

    test('unset with a where is refused on updateMany, updateUnique and upsert', async () => {
      const data = { locations: { unset: { where: { lat: 1 } } } };
      const ada = await client.db.ObjectTestUser.findOne({ where: { name: 'Ada' } });
      await rejects(
        () => client.db.ObjectTestUser.updateMany({ where: { name: 'Ada' }, data }),
        'locations.unset is not supported',
      );
      await rejects(
        () => client.db.ObjectTestUser.updateUnique({ where: { id: ada!.id }, data }),
        'locations.unset is not supported',
      );
      await rejects(
        () =>
          client.db.ObjectTestUser.upsert({
            where: { id: ada!.id },
            create: { name: 'N', address, locations: [] },
            update: data,
          }),
        'locations.unset is not supported',
      );
      expect(await locations()).toEqual([
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ]);
    });

    test('inside a transaction it is refused', async () => {
      await rejects(
        () =>
          client.$transaction([
            client.db.ObjectTestUser.updateMany({
              where: { name: 'Ada' },
              data: { locations: { updateWhere: { where: { lat: 1 }, data: { lat: 9 } } } },
            }),
          ]),
        'locations.updateWhere is not supported',
      );
      expect(await locations()).toEqual([
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ]);
    });

    test('set and push still change the array', async () => {
      await client.db.ObjectTestUser.updateMany({
        where: { name: 'Ada' },
        data: { locations: { push: { lat: 5, lng: 6 } } },
      });
      expect(await locations()).toHaveLength(3);
      await client.db.ObjectTestUser.updateMany({
        where: { name: 'Ada' },
        data: { locations: { set: [{ lat: 7, lng: 8 }] } },
      });
      expect(await locations()).toEqual([{ lat: 7, lng: 8 }]);
    });
  });
});
