/**
 * E2E Tests: composite @@unique key values in where — negative and positive cases
 *
 * An empty or partial composite value used to be flattened to whatever parts it carried, and the
 * condition builder dropped the missing ones, so deleteUnique({ where: { cityZip: {} } }) ran an
 * unconditional DELETE. Every case asserts the throw AND the rows that survived untouched.
 *
 * Schema: composite-unique-objects (Warehouse), composite-unique-primitives (Staff)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const SEED = [
  { name: 'A', city: 'NYC', zip: '10001' },
  { name: 'B', city: 'LA', zip: '90001' },
  { name: 'C', city: 'SF', zip: '94101' },
];

// Hostile shapes are what a JavaScript or cast caller can send; the generated types reject them
const hostile = (value: unknown): never => value as never;

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Composite where values — negative and positive cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.indexes);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.indexes);
    for (const { name, city, zip } of SEED)
      await client.db.Warehouse.create({ data: { name, location: { city, zip }, capacity: 1 } });
    await client.db.Staff.create({
      data: { firstName: 'Ada', lastName: 'L', department: 'eng', email: 'ada@x.co' },
    });
    await client.db.Staff.create({
      data: { firstName: 'Bob', lastName: 'M', department: 'eng', email: 'bob@x.co' },
    });
  });

  const intact = async () => {
    expect(await client.db.Warehouse.count()).toBe(3);
    expect(await client.db.Warehouse.count({ capacity: 1 })).toBe(3);
    expect(await client.db.Staff.count()).toBe(2);
  };

  const composite = "Invalid where clause: Invalid composite key 'cityZip' on model Warehouse";
  const requires = '@@unique(cityZip, [location.city, location.zip])';

  const cases = [
    ['an empty composite', hostile({ cityZip: {} }), "missing 'location.city', 'location.zip'"],
    [
      'a partial composite (zip omitted)',
      hostile({ cityZip: { location: { city: 'NYC' } } }),
      "missing 'location.zip'",
    ],
    [
      'a partial composite (zip undefined)',
      hostile({ cityZip: { location: { city: 'NYC', zip: undefined } } }),
      "missing 'location.zip'",
    ],
    ['a composite with the object level missing', hostile({ cityZip: { city: 'NYC', zip: '10001' } }), 'missing'],
    [
      'an operator object for a part',
      hostile({ cityZip: { location: { city: { contains: 'N' }, zip: '10001' } } }),
      "'location.city' must be a plain value",
    ],
    [
      'a key the directive does not name',
      hostile({ cityZip: { location: { city: 'NYC', zip: '10001', street: 'x' } } }),
      "'location.street' is not part of the directive",
    ],
    ['null', hostile({ cityZip: null }), 'got null'],
  ] as const;

  for (const [label, where, detail] of cases) {
    describe(label, () => {
      const expected = `${composite} — it must name every field of ${requires}`;

      test('deleteUnique throws and deletes nothing', async () => {
        await rejects(() => client.db.Warehouse.deleteUnique({ where }), expected);
        await rejects(() => client.db.Warehouse.deleteUnique({ where }), detail);
        await intact();
      });

      test('deleteMany throws and deletes nothing', async () => {
        await rejects(() => client.db.Warehouse.deleteMany({ where }), expected);
        await intact();
      });

      test('updateUnique throws and updates nothing', async () => {
        await rejects(() => client.db.Warehouse.updateUnique({ where, data: { capacity: 99 } }), expected);
        await intact();
      });

      test('updateMany throws and updates nothing', async () => {
        await rejects(() => client.db.Warehouse.updateMany({ where, data: { capacity: 99 } }), expected);
        await intact();
      });

      test('upsert throws, updates nothing and creates nothing', async () => {
        await rejects(
          () =>
            client.db.Warehouse.upsert({
              where,
              create: { name: 'Z', location: { city: 'ZZ', zip: '0' } },
              update: { capacity: 99 },
            }),
          expected,
        );
        await intact();
      });

      test('findUnique throws', async () => {
        await rejects(() => client.db.Warehouse.findUnique({ where }), expected);
      });
    });
  }

  test('the same guard covers a composite of plain model fields', async () => {
    const where = hostile({ staffFullName: { firstName: 'Ada' } });
    const expected =
      "Invalid where clause: Invalid composite key 'staffFullName' on model Staff — it must name every field of @@unique(staffFullName, [firstName, lastName]) as a plain value; missing 'lastName'";

    await rejects(() => client.db.Staff.deleteUnique({ where }), expected);
    await rejects(() => client.db.Staff.updateUnique({ where, data: { age: 1 } }), expected);
    expect(await client.db.Staff.count()).toBe(2);
    expect(await client.db.Staff.count({ age: 1 })).toBe(0);
  });

  test('a rejected composite beside other keys still touches nothing', async () => {
    await rejects(
      () =>
        client.db.Warehouse.deleteUnique({
          where: hostile({ cityZip: {}, name: 'A' }),
        }),
      composite,
    );
    await intact();
  });

  describe('a complete composite keeps working', () => {
    const where = { cityZip: { location: { city: 'NYC', zip: '10001' } } };

    test('deleteUnique deletes exactly the one matching row', async () => {
      expect(await client.db.Warehouse.deleteUnique({ where })).toBe(true);
      expect(await client.db.Warehouse.count()).toBe(2);
      expect((await client.db.Warehouse.findMany({ orderBy: { name: 'asc' } })).map((w) => w.name)).toEqual(['B', 'C']);
    });

    test('updateUnique updates exactly the one matching row', async () => {
      const updated = await client.db.Warehouse.updateUnique({ where, data: { capacity: 99 }, return: 'after' });
      expect(updated?.name).toBe('A');
      expect(updated?.capacity).toBe(99);
      expect(await client.db.Warehouse.count({ capacity: 99 })).toBe(1);
      expect(await client.db.Warehouse.count({ capacity: 1 })).toBe(2);
    });

    test('upsert updates the matching row and creates nothing', async () => {
      const result = await client.db.Warehouse.upsert({
        where,
        create: { name: 'Z', location: { city: 'ZZ', zip: '0' } },
        update: { capacity: 99 },
        return: 'after',
      });
      expect(result?.name).toBe('A');
      expect(result?.capacity).toBe(99);
      expect(await client.db.Warehouse.count()).toBe(3);
      expect(await client.db.Warehouse.count({ capacity: 99 })).toBe(1);
    });

    test('upsert creates when no row matches', async () => {
      await client.db.Warehouse.upsert({
        where: { cityZip: { location: { city: 'ZZ', zip: '0' } } },
        create: { name: 'Z', location: { city: 'ZZ', zip: '0' } },
        update: { capacity: 99 },
      });
      expect(await client.db.Warehouse.count()).toBe(4);
      expect(await client.db.Warehouse.count({ capacity: 99 })).toBe(0);
    });

    test('findUnique returns the matching row', async () => {
      expect((await client.db.Warehouse.findUnique({ where }))?.name).toBe('A');
    });

    test('a composite of plain fields deletes exactly one row', async () => {
      await client.db.Staff.deleteUnique({ where: { staffFullName: { firstName: 'Ada', lastName: 'L' } } });
      expect((await client.db.Staff.findMany()).map((s) => s.firstName)).toEqual(['Bob']);
    });
  });
});
