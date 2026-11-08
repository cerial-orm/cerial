import { describe, expect, test } from 'bun:test';
import { CerialPoint } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

// GeoJSON and wrapper forms are accepted at runtime; the generated filter types are narrower
const loose = (value: unknown): never => value as never;
const point = (x: number, y: number) => ({ type: 'Point' as const, coordinates: [x, y] as [number, number] });

describe('E2E Geometry: list operands', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  const seed = async () => {
    const client = getClient();
    for (const [name, location] of [
      ['a', [1, 1]],
      ['b', [2, 2]],
      ['c', [3, 3]],
    ] as const) {
      await client.db.GeometryBasic.create({
        data: {
          name,
          location: [...location],
          area: {
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

    return client;
  };
  const rest = async () =>
    (await getClient().db.GeometryBasic.findMany({ orderBy: { name: 'asc' } })).map((r) => r.name);

  const forms: [string, () => unknown[]][] = [
    ['bare pairs', () => [[2, 2]]],
    ['GeoJSON objects', () => [point(2, 2)]],
    ['Cerial wrappers', () => [new CerialPoint([2, 2])]],
  ];

  describe.each(forms)('%s', (_name, list) => {
    test('deleteMany with notIn deletes only the rows outside the list', async () => {
      const client = await seed();
      const n = await client.db.GeometryBasic.deleteMany({ where: loose({ location: { notIn: list() } }) });
      expect(n).toBe(2);
      expect(await rest()).toEqual(['b']);
    });

    test('deleteMany with in deletes only the listed rows', async () => {
      const client = await seed();
      const n = await client.db.GeometryBasic.deleteMany({ where: loose({ location: { in: list() } }) });
      expect(n).toBe(1);
      expect(await rest()).toEqual(['a', 'c']);
    });

    test('updateMany with notIn touches exactly the rows outside the list', async () => {
      const client = await seed();
      await client.db.GeometryBasic.updateMany({
        where: loose({ location: { notIn: list() } }),
        data: { name: 'hit' },
      });
      expect(await rest()).toEqual(['b', 'hit', 'hit']);
    });

    test('findMany returns the same rows for in and notIn', async () => {
      const client = await seed();
      const inside = await client.db.GeometryBasic.findMany({ where: loose({ location: { in: list() } }) });
      const outside = await client.db.GeometryBasic.findMany({
        where: loose({ location: { notIn: list() } }),
        orderBy: { name: 'asc' },
      });
      expect(inside.map((r) => r.name)).toEqual(['b']);
      expect(outside.map((r) => r.name)).toEqual(['a', 'c']);
    });
  });

  test('a mixed list of forms selects every member', async () => {
    const client = await seed();
    const n = await client.db.GeometryBasic.deleteMany({
      where: loose({ location: { in: [[1, 1], point(2, 2), new CerialPoint([3, 3])] } }),
    });
    expect(n).toBe(3);
  });

  test('eq, neq and the shorthand with one bare point stay a single value', async () => {
    const client = await seed();
    expect(
      (await client.db.GeometryBasic.findMany({ where: { location: { eq: [2, 2] } } })).map((r) => r.name),
    ).toEqual(['b']);
    expect(
      (await client.db.GeometryBasic.findMany({ where: { location: { neq: [2, 2] } }, orderBy: { name: 'asc' } })).map(
        (r) => r.name,
      ),
    ).toEqual(['a', 'c']);
    expect((await client.db.GeometryBasic.findMany({ where: { location: [3, 3] } })).map((r) => r.name)).toEqual(['c']);
  });

  test('an unparseable member is refused naming the field and no row is touched', async () => {
    const client = await seed();
    await expect(
      (async () => {
        await client.db.GeometryBasic.deleteMany({
          where: loose({ location: { notIn: [{ type: 'Nope', coordinates: [] }] } }),
        });
      })(),
    ).rejects.toThrow('location[0]');
    expect(await rest()).toEqual(['a', 'b', 'c']);
  });
});
