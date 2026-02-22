import { describe, expect, test } from 'bun:test';
import { CerialGeometry, CerialPoint } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Geometry: Object Nesting', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  test('create with geometry in object', async () => {
    const client = getClient();
    const result = await client.db.GeometryWithObject.create({
      data: { name: 'obj-test', geo: { position: [1, 2] } },
    });

    expect(result.geo.position).toBeInstanceOf(CerialPoint);
    expect(result.geo.position.coordinates).toEqual([1, 2]);
    expect(result.geo.boundary).toBeUndefined();
  });

  test('create with optional geometry in object', async () => {
    const client = getClient();
    const result = await client.db.GeometryWithObject.create({
      data: { name: 'obj-boundary', geo: { position: [1, 2], boundary: [3, 4] } },
    });

    expect(result.geo.position).toBeInstanceOf(CerialPoint);
    expect(CerialGeometry.is(result.geo.boundary!)).toBe(true);
    expect(result.geo.boundary!).toBeInstanceOf(CerialPoint);
  });

  test('update geometry in object', async () => {
    const client = getClient();
    const result = await client.db.GeometryWithObject.create({
      data: { name: 'upd', geo: { position: [1, 2] } },
    });

    const updated = await client.db.GeometryWithObject.updateUnique({
      where: { id: result.id },
      data: { geo: { position: [10, 20] } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.geo.position).toBeInstanceOf(CerialPoint);
    expect(updated!.geo.position.coordinates).toEqual([10, 20]);
  });

  test('findMany with geometry in object roundtrip', async () => {
    const client = getClient();
    await client.db.GeometryWithObject.create({
      data: { name: 'find-obj', geo: { position: [77, 88] } },
    });

    const found = await client.db.GeometryWithObject.findMany({
      where: { name: 'find-obj' },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.geo.position).toBeInstanceOf(CerialPoint);
    expect(found[0]!.geo.position.coordinates).toEqual([77, 88]);
  });
});

describe('E2E Geometry: Tuple Nesting', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  test('create with geometry in tuple', async () => {
    const client = getClient();
    const result = await client.db.GeometryWithTuple.create({
      data: { name: 'tup-test', pair: [[1, 2], null] },
    });

    expect(CerialGeometry.is(result.pair[0])).toBe(true);
    expect(result.pair[0]).toBeInstanceOf(CerialPoint);
    expect((result.pair[0] as CerialPoint).coordinates).toEqual([1, 2]);
    expect(result.pair[1]).toBeNull();
  });

  test('create with both tuple elements', async () => {
    const client = getClient();
    const result = await client.db.GeometryWithTuple.create({
      data: {
        name: 'tup-both',
        pair: [
          [10, 20],
          [30, 40],
        ],
      },
    });

    expect(result.pair[0]).toBeInstanceOf(CerialPoint);
    expect(result.pair[1]).toBeInstanceOf(CerialPoint);
    expect((result.pair[1] as CerialPoint).coordinates).toEqual([30, 40]);
  });

  test('update geometry in tuple (full replace)', async () => {
    const client = getClient();
    const result = await client.db.GeometryWithTuple.create({
      data: { name: 'upd-tup', pair: [[1, 2], null] },
    });

    const updated = await client.db.GeometryWithTuple.updateUnique({
      where: { id: result.id },
      data: {
        pair: [
          [99, 100],
          [200, 300],
        ],
      },
    });

    expect(updated).not.toBeNull();
    expect((updated!.pair[0] as CerialPoint).coordinates).toEqual([99, 100]);
    expect((updated!.pair[1] as CerialPoint).coordinates).toEqual([200, 300]);
  });

  test('findMany with geometry in tuple roundtrip', async () => {
    const client = getClient();
    await client.db.GeometryWithTuple.create({
      data: { name: 'find-tup', pair: [[55, 66], null] },
    });

    const found = await client.db.GeometryWithTuple.findMany({
      where: { name: 'find-tup' },
    });

    expect(found).toHaveLength(1);
    expect(CerialGeometry.is(found[0]!.pair[0])).toBe(true);
    expect((found[0]!.pair[0] as CerialPoint).coordinates).toEqual([55, 66]);
    expect(found[0]!.pair[1]).toBeNull();
  });
});
