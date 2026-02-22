import { describe, expect, test } from 'bun:test';
import { CerialGeometry, CerialLineString, CerialPoint, CerialPolygon, isCerialId } from 'cerial';
import { GeometryPoint } from 'surrealdb';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Geometry: Create', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  test('create with [lon, lat] tuple shorthand for @point', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'tuple-point',
        location: [1.5, 2.5],
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
        shape: [10, 20],
        route: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [5, 5],
          ],
        },
        multi: [3, 4],
      },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('tuple-point');
    expect(result.location).toBeInstanceOf(CerialPoint);
    expect(result.location.coordinates).toEqual([1.5, 2.5]);
  });

  test('create with GeoJSON Point object', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'geojson-point',
        location: { type: 'Point', coordinates: [10, 20] },
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
        shape: { type: 'Point', coordinates: [30, 40] },
        route: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        multi: { type: 'Point', coordinates: [5, 6] },
      },
    });

    expect(result.location).toBeInstanceOf(CerialPoint);
    expect(result.location.coordinates).toEqual([10, 20]);
  });

  test('create with CerialPoint instance', async () => {
    const client = getClient();
    const point = new CerialPoint([7, 8]);
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'cerial-point',
        location: point,
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

    expect(result.location).toBeInstanceOf(CerialPoint);
    expect(result.location.coordinates).toEqual([7, 8]);
  });

  test('create with SDK GeometryPoint', async () => {
    const client = getClient();
    const native = new GeometryPoint([9, 10]);
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'sdk-point',
        location: native,
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

    expect(result.location).toBeInstanceOf(CerialPoint);
    expect(result.location.coordinates).toEqual([9, 10]);
  });

  test('create with @polygon field', async () => {
    const client = getClient();
    const ring: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'polygon',
        location: [0, 0],
        area: { type: 'Polygon', coordinates: [ring] },
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

    expect(result.area).toBeInstanceOf(CerialPolygon);
    expect(result.area.coordinates).toEqual([ring]);
  });

  test('create with @line field', async () => {
    const client = getClient();
    const coords: [number, number][] = [
      [0, 0],
      [5, 5],
      [10, 0],
    ];
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'line',
        location: [0, 0],
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
        route: { type: 'LineString', coordinates: coords },
        multi: [0, 0],
      },
    });

    expect(result.route).toBeInstanceOf(CerialLineString);
    expect(result.route.coordinates).toEqual(coords);
  });

  test('create with bare Geometry field (no decorator)', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'bare-shape',
        location: [0, 0],
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
        shape: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
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

    expect(CerialGeometry.is(result.shape)).toBe(true);
    expect(result.shape).toBeInstanceOf(CerialLineString);
  });

  test('create with multi-type field (@point @polygon) using point', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'multi-point',
        location: [0, 0],
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
        multi: [5, 6],
      },
    });

    expect(result.multi).toBeInstanceOf(CerialPoint);
    expect((result.multi as CerialPoint).coordinates).toEqual([5, 6]);
  });

  test('create with multi-type field (@point @polygon) using polygon', async () => {
    const client = getClient();
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'multi-polygon',
        location: [0, 0],
        area: { type: 'Polygon', coordinates: [ring] },
        shape: [0, 0],
        route: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        multi: { type: 'Polygon', coordinates: [ring] },
      },
    });

    expect(result.multi).toBeInstanceOf(CerialPolygon);
  });

  test('create with optional field present', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'opt-present',
        location: [0, 0],
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
        optionalGeo: [42, 43],
      },
    });

    expect(result.optionalGeo).toBeInstanceOf(CerialPoint);
    expect(result.optionalGeo!.coordinates).toEqual([42, 43]);
  });

  test('create with optional field absent', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'opt-absent',
        location: [0, 0],
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

    expect(result.optionalGeo).toBeUndefined();
  });

  test('create with array field', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'array',
        location: [0, 0],
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
        geoArray: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      },
    });

    expect(result.geoArray).toHaveLength(3);
    expect(result.geoArray[0]).toBeInstanceOf(CerialPoint);
    expect(result.geoArray[0]!.coordinates).toEqual([1, 2]);
    expect(result.geoArray[1]!.coordinates).toEqual([3, 4]);
    expect(result.geoArray[2]!.coordinates).toEqual([5, 6]);
  });

  test('create with empty array field', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        name: 'empty-array',
        location: [0, 0],
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

    expect(result.geoArray).toEqual([]);
  });

  test('create and findMany roundtrip', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({
      data: {
        name: 'roundtrip',
        location: [100, 200],
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
        shape: [50, 60],
        route: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        multi: [10, 20],
      },
    });

    const found = await client.db.GeometryBasic.findMany({
      where: { name: 'roundtrip' },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.location).toBeInstanceOf(CerialPoint);
    expect(found[0]!.location.coordinates).toEqual([100, 200]);
    expect(found[0]!.shape).toBeInstanceOf(CerialPoint);
    expect(CerialGeometry.is(found[0]!.area)).toBe(true);
  });
});
