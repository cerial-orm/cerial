import { describe, expect, test } from 'bun:test';
import {
  CerialGeometryCollection,
  CerialMultiLineString,
  CerialMultiPoint,
  CerialMultiPolygon,
  isCerialId,
} from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Geometry: @multipoint, @multiline, @multipolygon and @geoCollection', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  const points: [number, number][] = [
    [0, 0],
    [1, 1],
  ];
  const lines: [number, number][][] = [
    [
      [0, 0],
      [1, 1],
    ],
    [
      [2, 2],
      [3, 3],
    ],
  ];
  const ring: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ];
  const collection = {
    type: 'GeometryCollection' as const,
    geometries: [{ type: 'Point' as const, coordinates: [1, 2] as [number, number] }],
  };

  const validData = (name: string) => ({
    name,
    points: { type: 'MultiPoint' as const, coordinates: points },
    lines: { type: 'MultiLineString' as const, coordinates: lines },
    polygons: { type: 'MultiPolygon' as const, coordinates: [[ring]] },
    collection,
  });

  test('stores each subtype and maps it back to its class', async () => {
    const client = getClient();
    const result = await client.db.GeometryMulti.create({ data: validData('all-four') });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.points).toBeInstanceOf(CerialMultiPoint);
    expect(result.lines).toBeInstanceOf(CerialMultiLineString);
    expect(result.polygons).toBeInstanceOf(CerialMultiPolygon);
    expect(result.collection).toBeInstanceOf(CerialGeometryCollection);
    expect((result.points as CerialMultiPoint).coordinates).toEqual(points);
    expect((result.lines as CerialMultiLineString).coordinates).toEqual(lines);
    expect((result.polygons as CerialMultiPolygon).coordinates).toEqual([[ring]]);
  });

  test('round-trips through findOne', async () => {
    const client = getClient();
    const created = await client.db.GeometryMulti.create({ data: validData('round-trip') });
    const found = await client.db.GeometryMulti.findOne({ where: { id: created.id } });

    expect(found?.points).toBeInstanceOf(CerialMultiPoint);
    expect(found).not.toBeNull();
    expect((found!.lines as CerialMultiLineString).coordinates).toEqual(lines);
  });

  test('rejects a geometry of another subtype on a narrowed field', async () => {
    const client = getClient();
    const wrong = { ...validData('wrong-subtype'), points: { type: 'LineString' as const, coordinates: points } };

    // @ts-expect-error a LineString is not assignable to a @multipoint field
    await expect((async () => await client.db.GeometryMulti.create({ data: wrong }))()).rejects.toThrow();
    expect(await client.db.GeometryMulti.count()).toBe(0);
  });

  test('rejects a point where a collection is required', async () => {
    const client = getClient();
    const wrong = { ...validData('point-for-collection'), collection: [0, 0] as [number, number] };

    // @ts-expect-error a Point is not assignable to a @geoCollection field
    await expect((async () => await client.db.GeometryMulti.create({ data: wrong }))()).rejects.toThrow();
  });
});
