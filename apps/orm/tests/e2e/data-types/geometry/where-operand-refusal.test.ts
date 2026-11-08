import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialPoint } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

// Operands that never passed through TypeScript, as a request body would carry them
const loose = (value: unknown): never => value as never;
const point = (x: number, y: number) => ({ type: 'Point', coordinates: [x, y] });

const TABLES = [...tables.geometry, 'ro_owner', 'ro_kit'];

const BAD: [string, unknown][] = [
  [
    'a pair of pairs',
    [
      [1, 1],
      [2, 2],
    ],
  ],
  ['an unknown object', { foo: 1 }],
  ['an empty array', []],
  ['three numbers', [1, 2, 3]],
  ['a list holding GeoJSON', [point(1, 1)]],
  ['a string', 'nope'],
  [
    'a polygon on a point field',
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  ],
];
const BAD_LISTS: [string, unknown][] = [
  [
    'a list of pairs of pairs',
    [
      [
        [1, 1],
        [2, 2],
      ],
    ],
  ],
  ['a list of unknown objects', [{ foo: 1 }]],
  ['a valid member beside an unknown object', [[1, 1], { foo: 1 }]],
  ['three numbers', [[1, 2, 3]]],
];

describe('E2E Geometry: where operands are held to the rules create applies', () => {
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

  const polygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ] as [number, number][],
    ],
  };
  const seed = async (): Promise<void> => {
    for (const [name, at] of [
      ['a', [1, 1]],
      ['b', [2, 2]],
      ['c', [3, 3]],
    ] as const) {
      await client.db.GeometryBasic.create({
        data: {
          name,
          location: [...at],
          area: polygon,
          shape: [0, 0],
          route: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          multi: [0, 0],
        },
      });
    }
  };
  const rest = async (): Promise<string[]> =>
    (await client.db.GeometryBasic.findMany({ orderBy: { name: 'asc' } })).map((r) => r.name);

  describe.each(BAD)('neq and eq with %s', (_label, operand) => {
    test.each(['neq', 'eq'])('deleteMany %s is refused naming the field and deletes nothing', async (op) => {
      await seed();
      await expect(
        (async () => {
          await client.db.GeometryBasic.deleteMany({ where: loose({ location: { [op]: operand } }) });
        })(),
      ).rejects.toThrow(/location/);
      expect(await rest()).toEqual(['a', 'b', 'c']);
    });

    test('updateMany neq is refused and updates nothing', async () => {
      await seed();
      await expect(
        (async () => {
          await client.db.GeometryBasic.updateMany({
            where: loose({ location: { neq: operand } }),
            data: { name: 'hit' },
          });
        })(),
      ).rejects.toThrow(/location/);
      expect(await rest()).toEqual(['a', 'b', 'c']);
    });
  });

  describe.each(BAD_LISTS)('notIn and in with %s', (_label, operand) => {
    test.each(['notIn', 'in'])('deleteMany %s is refused and deletes nothing', async (op) => {
      await seed();
      await expect(
        (async () => {
          await client.db.GeometryBasic.deleteMany({ where: loose({ location: { [op]: operand } }) });
        })(),
      ).rejects.toThrow(/location/);
      expect(await rest()).toEqual(['a', 'b', 'c']);
    });

    test('updateMany notIn is refused and updates nothing', async () => {
      await seed();
      await expect(
        (async () => {
          await client.db.GeometryBasic.updateMany({
            where: loose({ location: { notIn: operand } }),
            data: { name: 'hit' },
          });
        })(),
      ).rejects.toThrow(/location/);
      expect(await rest()).toEqual(['a', 'b', 'c']);
    });
  });

  test('a geometry of another subtype is refused for a single-subtype field', async () => {
    await seed();
    await expect(
      (async () => {
        await client.db.GeometryBasic.deleteMany({ where: loose({ location: { neq: polygon } }) });
      })(),
    ).rejects.toThrow(/location/);
    expect(await rest()).toEqual(['a', 'b', 'c']);
  });

  test('valid eq, neq, in and notIn still match exactly the right rows, in every accepted form', async () => {
    await seed();
    for (const form of [[2, 2], point(2, 2), new CerialPoint([2, 2])]) {
      const names = async (where: unknown) =>
        (await client.db.GeometryBasic.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((r) => r.name);

      expect(await names({ location: { eq: form } })).toEqual(['b']);
      expect(await names({ location: { neq: form } })).toEqual(['a', 'c']);
      expect(await names({ location: { in: [form] } })).toEqual(['b']);
      expect(await names({ location: { notIn: [form] } })).toEqual(['a', 'c']);
    }
  });

  describe('through a relation sub-filter', () => {
    const seedOwners = async (): Promise<void> => {
      for (const i of [0, 1, 2]) {
        const o = await client.db.RoOwner.create({ data: { id: `o${i}`, label: `o${i}`, geo: [i, i] } });
        await client.db.RoKit.create({ data: { id: `k${i}`, name: `k${i}`, ownerId: o.id } });
      }
    };
    const kits = async (): Promise<string[]> =>
      (await client.db.RoKit.findMany({ orderBy: { name: 'asc' } })).map((k) => k.name);

    test.each([
      ...BAD.map(([l, v]): [string, string, unknown] => [l, 'neq', v]),
      ...BAD_LISTS.map(([l, v]): [string, string, unknown] => [l, 'notIn', v]),
    ])('deleteMany with owner.geo %s under %s is refused and deletes nothing', async (_label, op, operand) => {
      await seedOwners();
      await expect(
        (async () => {
          await client.db.RoKit.deleteMany({ where: loose({ owner: { geo: { [op]: operand } } }) });
        })(),
      ).rejects.toThrow(/geo/);
      expect(await kits()).toEqual(['k0', 'k1', 'k2']);
    });

    test('a valid operand deletes exactly the matching rows', async () => {
      await seedOwners();
      const n = await client.db.RoKit.deleteMany({ where: loose({ owner: { geo: { neq: [1, 1] } } }) });
      expect(n).toBe(2);
      expect(await kits()).toEqual(['k1']);
    });
  });
});
