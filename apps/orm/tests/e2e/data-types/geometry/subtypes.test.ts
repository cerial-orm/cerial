import { describe, expect, test } from 'bun:test';
import {
  CerialGeometry,
  CerialGeometryCollection,
  CerialLineString,
  CerialMultiLineString,
  CerialMultiPoint,
  CerialMultiPolygon,
  CerialPoint,
  CerialPolygon,
  isCerialId,
} from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Geometry: All 7 Subtypes', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  const defaultRing: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ];

  const defaultLineCoords: [number, number][] = [
    [0, 0],
    [1, 1],
  ];

  function baseFields(name: string) {
    return {
      name,
      location: [0, 0] as [number, number],
      area: { type: 'Polygon' as const, coordinates: [defaultRing] },
      route: { type: 'LineString' as const, coordinates: defaultLineCoords },
      multi: [0, 0] as [number, number],
    };
  }

  test('Point: create with [lon, lat] shorthand', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        ...baseFields('subtype-point'),
        shape: [42.5, 13.7] as [number, number],
      },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.shape).toBeInstanceOf(CerialPoint);
    const point = result.shape as CerialPoint;
    expect(point.type).toBe('Point');
    expect(point.coordinates).toEqual([42.5, 13.7]);
  });

  test('LineString: create with GeoJSON LineString', async () => {
    const client = getClient();
    const coords: [number, number][] = [
      [0, 0],
      [5, 5],
      [10, 0],
    ];
    const result = await client.db.GeometryBasic.create({
      data: {
        ...baseFields('subtype-linestring'),
        shape: { type: 'LineString' as const, coordinates: coords },
      },
    });

    expect(result.shape).toBeInstanceOf(CerialLineString);
    const line = result.shape as CerialLineString;
    expect(line.type).toBe('LineString');
    expect(line.coordinates).toEqual(coords);
  });

  test('Polygon: create with GeoJSON Polygon', async () => {
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
        ...baseFields('subtype-polygon'),
        shape: { type: 'Polygon' as const, coordinates: [ring] },
      },
    });

    expect(result.shape).toBeInstanceOf(CerialPolygon);
    const polygon = result.shape as CerialPolygon;
    expect(polygon.type).toBe('Polygon');
    expect(polygon.coordinates).toEqual([ring]);
  });

  test('MultiPoint: create with GeoJSON MultiPoint', async () => {
    const client = getClient();
    const coords: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    const result = await client.db.GeometryBasic.create({
      data: {
        ...baseFields('subtype-multipoint'),
        shape: { type: 'MultiPoint' as const, coordinates: coords },
      },
    });

    expect(result.shape).toBeInstanceOf(CerialMultiPoint);
    const mp = result.shape as CerialMultiPoint;
    expect(mp.type).toBe('MultiPoint');
    expect(mp.coordinates).toEqual(coords);
  });

  test('MultiLineString: create with GeoJSON MultiLineString', async () => {
    const client = getClient();
    const coords: [number, number][][] = [
      [
        [0, 0],
        [1, 1],
      ],
      [
        [2, 2],
        [3, 3],
        [4, 4],
      ],
    ];
    const result = await client.db.GeometryBasic.create({
      data: {
        ...baseFields('subtype-multilinestring'),
        shape: { type: 'MultiLineString' as const, coordinates: coords },
      },
    });

    expect(result.shape).toBeInstanceOf(CerialMultiLineString);
    const ml = result.shape as CerialMultiLineString;
    expect(ml.type).toBe('MultiLineString');
    expect(ml.coordinates).toEqual(coords);
  });

  test('MultiPolygon: create with GeoJSON MultiPolygon', async () => {
    const client = getClient();
    const coords: [number, number][][][] = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
      [
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 2],
        ],
      ],
    ];
    const result = await client.db.GeometryBasic.create({
      data: {
        ...baseFields('subtype-multipolygon'),
        shape: { type: 'MultiPolygon' as const, coordinates: coords },
      },
    });

    expect(result.shape).toBeInstanceOf(CerialMultiPolygon);
    const mpoly = result.shape as CerialMultiPolygon;
    expect(mpoly.type).toBe('MultiPolygon');
    expect(mpoly.coordinates).toEqual(coords);
  });

  test('GeometryCollection: create with GeoJSON collection', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        ...baseFields('subtype-collection'),
        shape: {
          type: 'GeometryCollection' as const,
          geometries: [
            { type: 'Point' as const, coordinates: [1, 2] as [number, number] },
            {
              type: 'LineString' as const,
              coordinates: [
                [0, 0],
                [1, 1],
              ] as [number, number][],
            },
          ],
        },
      },
    });

    expect(result.shape).toBeInstanceOf(CerialGeometryCollection);
    const gc = result.shape as CerialGeometryCollection;
    expect(gc.type).toBe('GeometryCollection');
    expect(gc.geometries).toHaveLength(2);
    expect(gc.geometries[0]).toBeInstanceOf(CerialPoint);
    expect(gc.geometries[1]).toBeInstanceOf(CerialLineString);
  });

  test('all 7 subtypes survive create + findMany roundtrip', async () => {
    const client = getClient();
    const lineCoords: [number, number][] = [
      [0, 0],
      [1, 1],
    ];
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const mpCoords: [number, number][] = [
      [0, 0],
      [1, 1],
    ];
    const mlCoords: [number, number][][] = [
      [
        [0, 0],
        [1, 1],
      ],
      [
        [2, 2],
        [3, 3],
      ],
    ];
    const mpolyCoords: [number, number][][][] = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    ];

    await client.db.GeometryBasic.create({
      data: { ...baseFields('rt-point'), shape: [10, 20] as [number, number] },
    });
    await client.db.GeometryBasic.create({
      data: {
        ...baseFields('rt-line'),
        shape: { type: 'LineString' as const, coordinates: lineCoords },
      },
    });
    await client.db.GeometryBasic.create({
      data: {
        ...baseFields('rt-polygon'),
        shape: { type: 'Polygon' as const, coordinates: [ring] },
      },
    });
    await client.db.GeometryBasic.create({
      data: {
        ...baseFields('rt-multipoint'),
        shape: { type: 'MultiPoint' as const, coordinates: mpCoords },
      },
    });
    await client.db.GeometryBasic.create({
      data: {
        ...baseFields('rt-multiline'),
        shape: { type: 'MultiLineString' as const, coordinates: mlCoords },
      },
    });
    await client.db.GeometryBasic.create({
      data: {
        ...baseFields('rt-multipolygon'),
        shape: { type: 'MultiPolygon' as const, coordinates: mpolyCoords },
      },
    });
    await client.db.GeometryBasic.create({
      data: {
        ...baseFields('rt-collection'),
        shape: {
          type: 'GeometryCollection' as const,
          geometries: [{ type: 'Point' as const, coordinates: [5, 5] as [number, number] }],
        },
      },
    });

    const all = await client.db.GeometryBasic.findMany({
      where: { name: { startsWith: 'rt-' } },
    });

    expect(all).toHaveLength(7);
    for (const record of all) {
      expect(CerialGeometry.is(record.shape)).toBe(true);
    }

    const byName = new Map(all.map((r) => [r.name, r]));
    expect(byName.get('rt-point')!.shape).toBeInstanceOf(CerialPoint);
    expect(byName.get('rt-line')!.shape).toBeInstanceOf(CerialLineString);
    expect(byName.get('rt-polygon')!.shape).toBeInstanceOf(CerialPolygon);
    expect(byName.get('rt-multipoint')!.shape).toBeInstanceOf(CerialMultiPoint);
    expect(byName.get('rt-multiline')!.shape).toBeInstanceOf(CerialMultiLineString);
    expect(byName.get('rt-multipolygon')!.shape).toBeInstanceOf(CerialMultiPolygon);
    expect(byName.get('rt-collection')!.shape).toBeInstanceOf(CerialGeometryCollection);
  });

  test('toJSON produces correct GeoJSON structure for each subtype', async () => {
    const client = getClient();
    const result = await client.db.GeometryBasic.create({
      data: {
        ...baseFields('json-verify'),
        shape: {
          type: 'GeometryCollection' as const,
          geometries: [
            { type: 'Point' as const, coordinates: [1, 2] as [number, number] },
            {
              type: 'Polygon' as const,
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ] as [number, number][],
              ],
            },
          ],
        },
      },
    });

    const gc = result.shape as CerialGeometryCollection;
    const json = gc.toJSON();
    expect(json.type).toBe('GeometryCollection');
    expect(json.geometries).toHaveLength(2);
    expect(json.geometries[0]!.type).toBe('Point');
    expect(json.geometries[1]!.type).toBe('Polygon');

    const pointJson = gc.geometries[0]!.toJSON();
    expect(pointJson).toEqual({ type: 'Point', coordinates: [1, 2] });
  });
});
