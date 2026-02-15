import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import { CerialPoint, CerialGeometry } from 'cerial';

const GEO_TABLES = tables.geometry;

describe('E2E Geometry: Object Nesting', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, GEO_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, GEO_TABLES);
  });

  test('create with geometry in object', async () => {
    const result = await client.db.GeometryWithObject.create({
      data: { name: 'obj-test', geo: { position: [1, 2] } },
    });

    expect(result.geo.position).toBeInstanceOf(CerialPoint);
    expect(result.geo.position.coordinates).toEqual([1, 2]);
    expect(result.geo.boundary).toBeUndefined();
  });

  test('create with optional geometry in object', async () => {
    const result = await client.db.GeometryWithObject.create({
      data: { name: 'obj-boundary', geo: { position: [1, 2], boundary: [3, 4] } },
    });

    expect(result.geo.position).toBeInstanceOf(CerialPoint);
    expect(CerialGeometry.is(result.geo.boundary!)).toBe(true);
    expect(result.geo.boundary!).toBeInstanceOf(CerialPoint);
  });

  test('update geometry in object', async () => {
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
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, GEO_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, GEO_TABLES);
  });

  test('create with geometry in tuple', async () => {
    const result = await client.db.GeometryWithTuple.create({
      data: { name: 'tup-test', pair: [[1, 2], null] },
    });

    expect(CerialGeometry.is(result.pair[0])).toBe(true);
    expect(result.pair[0]).toBeInstanceOf(CerialPoint);
    expect((result.pair[0] as CerialPoint).coordinates).toEqual([1, 2]);
    expect(result.pair[1]).toBeNull();
  });

  test('create with both tuple elements', async () => {
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
