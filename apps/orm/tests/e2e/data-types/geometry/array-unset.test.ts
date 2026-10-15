import { describe, expect, test } from 'bun:test';
import type { CerialId } from 'cerial';
import { setupDataTypeTests } from '../test-factory';
import { tables } from '../../test-helper';

describe('E2E Geometry: array push and unset', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  const baseData = (name: string, geoArray: [number, number][]) => ({
    name,
    location: [0, 0] as [number, number],
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
    geoArray,
  });

  const coords = (result: { geoArray: { coordinates: unknown }[] } | null): unknown[] =>
    (result?.geoArray ?? []).map((g) => g.coordinates);

  const seed = async (name: string): Promise<CerialId<string>> => {
    const created = await getClient().db.GeometryBasic.create({
      data: baseData(name, [
        [10, 20],
        [30, 40],
        [50, 60],
      ]),
    });

    return created.id;
  };

  test('updateMany: unset removes the matching element', async () => {
    const client = getClient();
    const id = await seed('many');

    await client.db.GeometryBasic.updateMany({ where: { id }, data: { geoArray: { unset: [[10, 20]] } } });

    const found = await client.db.GeometryBasic.findOne({ where: { id } });
    expect(coords(found)).toEqual([
      [30, 40],
      [50, 60],
    ]);
  });

  test('updateMany: unset of several elements', async () => {
    const client = getClient();
    const id = await seed('many-multi');

    await client.db.GeometryBasic.updateMany({
      where: { id },
      data: {
        geoArray: {
          unset: [
            [10, 20],
            [50, 60],
          ],
        },
      },
    });

    const found = await client.db.GeometryBasic.findOne({ where: { id } });
    expect(coords(found)).toEqual([[30, 40]]);
  });

  test('updateMany: unset of an absent element leaves the array alone', async () => {
    const client = getClient();
    const id = await seed('many-absent');

    await client.db.GeometryBasic.updateMany({ where: { id }, data: { geoArray: { unset: [[99, 99]] } } });

    const found = await client.db.GeometryBasic.findOne({ where: { id } });
    expect(coords(found)).toHaveLength(3);
  });

  test('updateMany: push and unset together', async () => {
    const client = getClient();
    const id = await seed('many-both');

    await client.db.GeometryBasic.updateMany({
      where: { id },
      data: { geoArray: { push: [[70, 80]], unset: [[10, 20]] } },
    });

    const found = await client.db.GeometryBasic.findOne({ where: { id } });
    expect(coords(found)).toEqual([
      [30, 40],
      [50, 60],
      [70, 80],
    ]);
  });

  test('updateUnique: unset removes the matching element', async () => {
    const client = getClient();
    const id = await seed('unique');

    const result = await client.db.GeometryBasic.updateUnique({
      where: { id },
      data: { geoArray: { unset: [[30, 40]] } },
    });

    expect(coords(result)).toEqual([
      [10, 20],
      [50, 60],
    ]);
  });

  test('upsert: update half unsets the matching element', async () => {
    const client = getClient();
    const id = await seed('upsert');

    const result = await client.db.GeometryBasic.upsert({
      where: { id },
      create: baseData('upsert-created', []),
      update: { geoArray: { unset: [[50, 60]] } },
    });

    expect(coords(result)).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });

  test('$transaction array mode: unset removes the matching element', async () => {
    const client = getClient();
    const id = await seed('txn-array');

    await client.$transaction([
      client.db.GeometryBasic.updateMany({ where: { id }, data: { geoArray: { unset: [[10, 20]] } } }),
    ]);

    const found = await client.db.GeometryBasic.findOne({ where: { id } });
    expect(coords(found)).toEqual([
      [30, 40],
      [50, 60],
    ]);
  });

  test('$transaction callback mode: unset removes the matching element', async () => {
    const client = getClient();
    const id = await seed('txn-callback');

    await client.$transaction(async (tx) => {
      await tx.GeometryBasic.updateMany({ where: { id }, data: { geoArray: { unset: [[10, 20]] } } });
    });

    const found = await client.db.GeometryBasic.findOne({ where: { id } });
    expect(coords(found)).toEqual([
      [30, 40],
      [50, 60],
    ]);
  });

  test('$transaction manual mode: unset removes the matching element on commit', async () => {
    const client = getClient();
    const id = await seed('txn-manual');

    const txn = await client.$transaction();
    await txn.GeometryBasic.updateMany({ where: { id }, data: { geoArray: { unset: [[10, 20]] } } });
    await txn.commit();

    const found = await client.db.GeometryBasic.findOne({ where: { id } });
    expect(coords(found)).toEqual([
      [30, 40],
      [50, 60],
    ]);
  });
});
