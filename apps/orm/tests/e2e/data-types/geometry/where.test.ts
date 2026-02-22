import { describe, expect, test } from 'bun:test';
import { CerialPoint } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Geometry: Where', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  const baseData = (name: string, location: [number, number]) => ({
    name,
    location,
    area: {
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
    shape: [0, 0] as [number, number],
    route: {
      type: 'LineString' as const,
      coordinates: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
    },
    multi: [0, 0] as [number, number],
  });

  test('filter by direct equality with [lon, lat]', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({ data: baseData('a', [1, 2]) });
    await client.db.GeometryBasic.create({ data: baseData('b', [3, 4]) });

    const found = await client.db.GeometryBasic.findMany({
      where: { location: [1, 2] },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('a');
  });

  test('filter by direct equality with CerialPoint', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({ data: baseData('match', [10, 20]) });
    await client.db.GeometryBasic.create({ data: baseData('other', [30, 40]) });

    const found = await client.db.GeometryBasic.findMany({
      where: { location: new CerialPoint([10, 20]) },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('match');
  });

  test('filter by eq operator', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({ data: baseData('eq-match', [5, 6]) });

    const found = await client.db.GeometryBasic.findMany({
      where: { location: { eq: [5, 6] } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('eq-match');
  });

  test('filter by neq operator', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({ data: baseData('a', [1, 1]) });
    await client.db.GeometryBasic.create({ data: baseData('b', [2, 2]) });

    const found = await client.db.GeometryBasic.findMany({
      where: { location: { neq: [1, 1] } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('b');
  });

  test('filter optional geometry field by isNone', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({ data: { ...baseData('has-geo', [0, 0]), optionalGeo: [42, 43] } });
    await client.db.GeometryBasic.create({ data: baseData('no-geo', [0, 0]) });

    const found = await client.db.GeometryBasic.findMany({
      where: { optionalGeo: { isNone: true } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('no-geo');
  });

  test('filter array field with has operator', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({
      data: {
        ...baseData('has-item', [0, 0]),
        geoArray: [
          [10, 20],
          [30, 40],
        ],
      },
    });
    await client.db.GeometryBasic.create({
      data: { ...baseData('no-item', [0, 0]), geoArray: [[50, 60]] },
    });

    const found = await client.db.GeometryBasic.findMany({
      where: { geoArray: { has: [10, 20] } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('has-item');
  });

  test('filter array field with isEmpty', async () => {
    const client = getClient();
    await client.db.GeometryBasic.create({
      data: { ...baseData('empty', [0, 0]), geoArray: [] },
    });
    await client.db.GeometryBasic.create({
      data: { ...baseData('not-empty', [0, 0]), geoArray: [[1, 2]] },
    });

    const found = await client.db.GeometryBasic.findMany({
      where: { geoArray: { isEmpty: true } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('empty');
  });
});
