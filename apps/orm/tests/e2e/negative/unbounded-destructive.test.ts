/**
 * E2E Tests: a where that vanishes must never become an unbounded DELETE or UPDATE
 *
 * A supplied where that compiled to zero conditions used to emit a statement with no WHERE:
 * deleteMany with a valid composite key, with `AND: []`, or with every value undefined wiped the table.
 * Every negative case here asserts the throw AND the exact surviving rows with their values, because a
 * throw alone is what let the composite hole pass review. Each entry point also keeps a positive case,
 * so the guard cannot be satisfied by refusing every filtered statement.
 *
 * Schema: composite-unique-objects (Warehouse), composite-unique-primitives (Staff),
 * one-to-many (Author, PostRequired), object-decorators (ObjDecUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const ALL_TABLES = [...tables.indexes, ...tables.oneToManyRequired, ...tables.objectDecorators];

// Hostile shapes are what a JavaScript or cast caller can send; the generated types reject them
const hostile = (value: unknown): never => value as never;

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

const noConditions = (operation: string, model: string) =>
  `${operation} on ${model}: the where filter resolved to no conditions, so the statement would affect every row. Omit where entirely to affect every row.`;

describe('Unbounded destructive statements — negative and positive cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ALL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ALL_TABLES);
    for (const [name, city, zip] of [
      ['A', 'NYC', '10001'],
      ['B', 'LA', '90001'],
      ['C', 'SF', '94101'],
    ] as const)
      await client.db.Warehouse.create({ data: { name, location: { city, zip }, capacity: 1 } });
    for (const first of ['Ada', 'Bob', 'Cy'])
      await client.db.Staff.create({
        data: { firstName: first, lastName: 'L', department: 'eng', email: `${first.toLowerCase()}@x.co`, age: 30 },
      });
    const ada = await client.db.Author.create({ data: { name: 'Ada', email: 'ada@x.co' } });
    const bob = await client.db.Author.create({ data: { name: 'Bob', email: 'bob@x.co' } });
    await client.db.PostRequired.create({ data: { title: 'A1', authorId: ada.id } });
    await client.db.PostRequired.create({ data: { title: 'A2', authorId: ada.id } });
    await client.db.PostRequired.create({ data: { title: 'B1', authorId: bob.id } });
  });

  const warehouses = async () =>
    (await client.db.Warehouse.findMany({ orderBy: { name: 'asc' } })).map((w) => [w.name, w.capacity]);
  const staff = async () =>
    (await client.db.Staff.findMany({ orderBy: { firstName: 'asc' } })).map((s) => [s.firstName, s.age]);
  const posts = async () => (await client.db.PostRequired.findMany({ orderBy: { title: 'asc' } })).map((p) => p.title);
  const authors = async () => (await client.db.Author.findMany({ orderBy: { name: 'asc' } })).map((a) => a.name);

  const allWarehouses = [
    ['A', 1],
    ['B', 1],
    ['C', 1],
  ];
  const allStaff = [
    ['Ada', 30],
    ['Bob', 30],
    ['Cy', 30],
  ];

  describe('deleteMany', () => {
    test('a valid composite key deletes only the row it names', async () => {
      const deleted = await client.db.Warehouse.deleteMany({
        where: hostile({ cityZip: { location: { city: 'NYC', zip: '10001' } } }),
      });

      expect(deleted).toBe(1);
      expect(await warehouses()).toEqual([
        ['B', 1],
        ['C', 1],
      ]);
    });

    test('a flat composite key deletes only the row it names', async () => {
      const deleted = await client.db.Staff.deleteMany({
        where: hostile({ staffFullName: { firstName: 'Bob', lastName: 'L' } }),
      });

      expect(deleted).toBe(1);
      expect(await staff()).toEqual([
        ['Ada', 30],
        ['Cy', 30],
      ]);
    });

    test('a composite key combined with AND still filters inside the logical operator', async () => {
      const deleted = await client.db.Warehouse.deleteMany({
        where: { AND: [hostile({ cityZip: { location: { city: 'LA', zip: '90001' } } }), { capacity: 1 }] },
      });

      expect(deleted).toBe(1);
      expect(await warehouses()).toEqual([
        ['A', 1],
        ['C', 1],
      ]);
    });

    test('two composite keys in one where both apply', async () => {
      const deleted = await client.db.Warehouse.deleteMany({
        where: hostile({
          cityZip: { location: { city: 'NYC', zip: '10001' } },
          nameCity: { name: 'B', location: { city: 'NYC' } },
        }),
      });

      expect(deleted).toBe(0);
      expect(await warehouses()).toEqual(allWarehouses);
    });

    test('AND: [] throws and every row survives', async () => {
      await rejects(
        () => client.db.Warehouse.deleteMany({ where: { AND: [] } }),
        noConditions('deleteMany', 'Warehouse'),
      );
      expect(await warehouses()).toEqual(allWarehouses);
    });

    test('a where whose values are all undefined throws and every row survives', async () => {
      await rejects(
        () => client.db.Staff.deleteMany({ where: { firstName: undefined, department: undefined } }),
        noConditions('deleteMany', 'Staff'),
      );
      expect(await staff()).toEqual(allStaff);
    });

    test('an operator that compiles to nothing inside AND throws and every row survives', async () => {
      await rejects(
        () => client.db.Staff.deleteMany({ where: { AND: [{ firstName: undefined }] } }),
        noConditions('deleteMany', 'Staff'),
      );
      expect(await staff()).toEqual(allStaff);
    });

    test('OR: [] matches nothing: no throw, nothing deleted', async () => {
      expect(await client.db.Warehouse.deleteMany({ where: { OR: [] } })).toBe(0);
      expect(await warehouses()).toEqual(allWarehouses);
    });

    test('NOT: {} matches nothing: no throw, nothing deleted', async () => {
      expect(await client.db.Warehouse.deleteMany({ where: { NOT: {} } })).toBe(0);
      expect(await warehouses()).toEqual(allWarehouses);
    });

    test('OR: [] beside another condition still matches nothing', async () => {
      expect(await client.db.Staff.deleteMany({ where: { department: 'eng', OR: [] } })).toBe(0);
      expect(await staff()).toEqual(allStaff);
    });

    test('an absent where, and an empty object, still delete every row', async () => {
      expect(await client.db.Warehouse.deleteMany(hostile({}))).toBe(3);
      expect(await client.db.Staff.deleteMany({ where: {} })).toBe(3);
      expect(await warehouses()).toEqual([]);
      expect(await staff()).toEqual([]);
    });

    test('an ordinary filter deletes exactly the rows it names', async () => {
      expect(await client.db.Staff.deleteMany({ where: { firstName: { neq: 'Bob' } } })).toBe(2);
      expect(await staff()).toEqual([['Bob', 30]]);
    });
  });

  describe('deleteMany with cascade', () => {
    test('AND: [] throws and the parents and their children all survive', async () => {
      await rejects(() => client.db.Author.deleteMany({ where: { AND: [] } }), noConditions('deleteMany', 'Author'));
      expect(await authors()).toEqual(['Ada', 'Bob']);
      expect(await posts()).toEqual(['A1', 'A2', 'B1']);
    });

    test('all-undefined values throw and nothing cascades', async () => {
      await rejects(
        () => client.db.Author.deleteMany({ where: { name: undefined } }),
        noConditions('deleteMany', 'Author'),
      );
      expect(await authors()).toEqual(['Ada', 'Bob']);
      expect(await posts()).toEqual(['A1', 'A2', 'B1']);
    });

    test('a filter deletes the matching parent and cascades to its children only', async () => {
      expect(await client.db.Author.deleteMany({ where: { name: 'Ada' } })).toBe(1);
      expect(await authors()).toEqual(['Bob']);
      expect(await posts()).toEqual(['B1']);
    });

    test('a relation filter on the parent matches the rows it names and cascades', async () => {
      expect(await client.db.Author.deleteMany({ where: { posts: { some: { title: 'B1' } } } })).toBe(1);
      expect(await authors()).toEqual(['Ada']);
      expect(await posts()).toEqual(['A1', 'A2']);
    });
  });

  describe('relation filters in destructive statements', () => {
    test('deleteMany with a forward relation filter deletes the rows it names', async () => {
      expect(await client.db.PostRequired.deleteMany({ where: { author: { name: 'Ada' } } })).toBe(2);
      expect(await posts()).toEqual(['B1']);
      expect(await authors()).toEqual(['Ada', 'Bob']);
    });

    test('updateMany with a forward relation filter updates the rows it names', async () => {
      const updated = await client.db.PostRequired.updateMany({
        where: { author: { name: 'Ada' } },
        data: { body: 'edited' },
      });

      expect(updated.map((p) => p.title).sort()).toEqual(['A1', 'A2']);
      const all = await client.db.PostRequired.findMany({ orderBy: { title: 'asc' } });
      expect(all.map((p) => [p.title, p.body])).toEqual([
        ['A1', 'edited'],
        ['A2', 'edited'],
        ['B1', undefined],
      ]);
    });

    test('a relation filter that names no row deletes nothing', async () => {
      expect(await client.db.PostRequired.deleteMany({ where: { author: { name: 'Nobody' } } })).toBe(0);
      expect(await posts()).toEqual(['A1', 'A2', 'B1']);
    });
  });

  describe('deleteUnique', () => {
    test('an operator object on a unique field throws and every row survives', async () => {
      await rejects(
        () => client.db.Staff.deleteUnique({ where: hostile({ email: { contains: 'x.co' } }) }),
        "deleteUnique on Staff: unique key 'email' must be a plain value, not a filter object (contains)",
      );
      expect(await staff()).toEqual(allStaff);
    });

    test('an undefined part of an object @unique throws and every row survives', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'U1',
          contact: { email: 'u1@x.co', tags: [] },
          location: { address: 'a', zip: '1', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'U2',
          contact: { email: 'u2@x.co', tags: [] },
          location: { address: 'b', zip: '2', country: 'US' },
        },
      });

      await rejects(
        () => client.db.ObjDecUser.deleteUnique({ where: hostile({ location: { zip: undefined } }) }),
        "deleteUnique on ObjDecUser: unique key 'location.zip' has no value",
      );
      const left = await client.db.ObjDecUser.findMany({ orderBy: { name: 'asc' } });
      expect(left.map((u) => [u.name, u.location.zip])).toEqual([
        ['U1', '1'],
        ['U2', '2'],
      ]);
    });

    test('a plain unique value deletes exactly that row', async () => {
      await client.db.Staff.deleteUnique({ where: { email: 'bob@x.co' } });
      expect(await staff()).toEqual([
        ['Ada', 30],
        ['Cy', 30],
      ]);
    });

    test('a cascading deleteUnique with an operator object throws and nothing cascades', async () => {
      await rejects(
        () => client.db.Author.deleteUnique({ where: hostile({ email: { contains: 'x.co' } }) }),
        "deleteUnique on Author: unique key 'email' must be a plain value",
      );
      expect(await authors()).toEqual(['Ada', 'Bob']);
      expect(await posts()).toEqual(['A1', 'A2', 'B1']);
    });

    test('a composite key still deletes exactly one row', async () => {
      await client.db.Warehouse.deleteUnique({ where: { cityZip: { location: { city: 'SF', zip: '94101' } } } });
      expect(await warehouses()).toEqual([
        ['A', 1],
        ['B', 1],
      ]);
    });
  });

  describe('updateMany', () => {
    test('a valid composite key updates only the row it names', async () => {
      const updated = await client.db.Warehouse.updateMany({
        where: hostile({ cityZip: { location: { city: 'NYC', zip: '10001' } } }),
        data: { capacity: 99 },
      });

      expect(updated.map((w) => w.name)).toEqual(['A']);
      expect(await warehouses()).toEqual([
        ['A', 99],
        ['B', 1],
        ['C', 1],
      ]);
    });

    test('AND: [] throws and no row is touched', async () => {
      await rejects(
        () => client.db.Warehouse.updateMany({ where: { AND: [] }, data: { capacity: 99 } }),
        noConditions('updateMany', 'Warehouse'),
      );
      expect(await warehouses()).toEqual(allWarehouses);
    });

    test('all-undefined values throw and no row is touched', async () => {
      await rejects(
        () => client.db.Staff.updateMany({ where: { department: undefined }, data: { age: 99 } }),
        noConditions('updateMany', 'Staff'),
      );
      expect(await staff()).toEqual(allStaff);
    });

    test('OR: [] and NOT: {} match nothing and touch no row', async () => {
      expect(await client.db.Warehouse.updateMany({ where: { OR: [] }, data: { capacity: 99 } })).toEqual([]);
      expect(await client.db.Warehouse.updateMany({ where: { NOT: {} }, data: { capacity: 99 } })).toEqual([]);
      expect(await warehouses()).toEqual(allWarehouses);
    });

    test('an empty where object still updates every row', async () => {
      expect(await client.db.Staff.updateMany({ where: {}, data: { age: 31 } })).toHaveLength(3);
      expect(await staff()).toEqual([
        ['Ada', 31],
        ['Bob', 31],
        ['Cy', 31],
      ]);
    });

    test('an ordinary filter updates exactly the rows it names', async () => {
      const updated = await client.db.Staff.updateMany({ where: { firstName: 'Cy' }, data: { age: 40 } });

      expect(updated).toHaveLength(1);
      expect(await staff()).toEqual([
        ['Ada', 30],
        ['Bob', 30],
        ['Cy', 40],
      ]);
    });
  });

  describe('updateUnique', () => {
    test('an operator object on a unique field throws and no row is touched', async () => {
      await rejects(
        () => client.db.Staff.updateUnique({ where: hostile({ email: { contains: 'x.co' } }), data: { age: 99 } }),
        "updateUnique on Staff: unique key 'email' must be a plain value",
      );
      expect(await staff()).toEqual(allStaff);
    });

    test('a plain unique value updates exactly that row', async () => {
      await client.db.Staff.updateUnique({ where: { email: 'ada@x.co' }, data: { age: 41 } });
      expect(await staff()).toEqual([
        ['Ada', 41],
        ['Bob', 30],
        ['Cy', 30],
      ]);
    });

    test('a composite key updates exactly one row', async () => {
      await client.db.Warehouse.updateUnique({
        where: { cityZip: { location: { city: 'LA', zip: '90001' } } },
        data: { capacity: 7 },
      });
      expect(await warehouses()).toEqual([
        ['A', 1],
        ['B', 7],
        ['C', 1],
      ]);
    });
  });

  describe('upsert', () => {
    test('an all-undefined where throws and no row is touched or created', async () => {
      await rejects(
        () =>
          client.db.Staff.upsert({
            where: { department: undefined },
            create: { firstName: 'Z', lastName: 'Z', department: 'ops', email: 'z@x.co' },
            update: { age: 99 },
          }),
        noConditions('upsert', 'Staff'),
      );
      expect(await staff()).toEqual(allStaff);
    });

    test('AND: [] throws and no row is touched or created', async () => {
      await rejects(
        () =>
          client.db.Staff.upsert({
            where: { AND: [] },
            create: { firstName: 'Z', lastName: 'Z', department: 'ops', email: 'z@x.co' },
            update: { age: 99 },
          }),
        noConditions('upsert', 'Staff'),
      );
      expect(await staff()).toEqual(allStaff);
    });

    test('a correct filter updates exactly the matching row', async () => {
      await client.db.Staff.upsert({
        where: { email: 'bob@x.co' },
        create: { firstName: 'Z', lastName: 'Z', department: 'ops', email: 'z@x.co' },
        update: { age: 55 },
      });
      expect(await staff()).toEqual([
        ['Ada', 30],
        ['Bob', 55],
        ['Cy', 30],
      ]);
    });

    test('a non-unique filter updates exactly the rows it names', async () => {
      await client.db.Staff.upsert({
        where: { firstName: 'Cy' },
        create: { firstName: 'Z', lastName: 'Z', department: 'ops', email: 'z@x.co' },
        update: { age: 56 },
      });
      expect(await staff()).toEqual([
        ['Ada', 30],
        ['Bob', 30],
        ['Cy', 56],
      ]);
    });
  });

  describe('reads agree with writes on vacuous filters', () => {
    test('findMany with OR: [] returns no row, and with NOT: {} returns no row', async () => {
      expect(await client.db.Warehouse.findMany({ where: { OR: [] } })).toEqual([]);
      expect(await client.db.Warehouse.findMany({ where: { NOT: {} } })).toEqual([]);
    });

    test('findMany with an empty where, and with AND: [], still returns every row', async () => {
      expect(await client.db.Warehouse.findMany({})).toHaveLength(3);
      expect(await client.db.Warehouse.findMany({ where: { AND: [] } })).toHaveLength(3);
    });

    test('findMany with a valid composite key returns only the row it names', async () => {
      const found = await client.db.Warehouse.findMany({
        where: hostile({ cityZip: { location: { city: 'NYC', zip: '10001' } } }),
      });
      expect(found.map((w) => w.name)).toEqual(['A']);
    });

    test('count with a valid composite key counts only the row it names', async () => {
      expect(await client.db.Warehouse.count(hostile({ cityZip: { location: { city: 'LA', zip: '90001' } } }))).toBe(1);
    });
  });
});
