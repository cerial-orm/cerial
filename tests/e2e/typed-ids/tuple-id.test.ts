import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../src/utils/cerial-id';
import {
  createTestClient,
  testConfig,
  TYPED_ID_TABLES,
  CerialClient,
  cleanupTables,
  truncateTables,
} from '../test-helper';

describe('E2E Typed IDs: Tuple ID', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TYPED_ID_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TYPED_ID_TABLES);
  });

  test('create with tuple id', async () => {
    const result = await client.db.TupleIdModel.create({
      data: { id: [51.5, -0.1], city: 'London' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(Array.isArray(result.id.id)).toBe(true);
    const idArr = result.id.id;
    expect(idArr[0]).toBe(51.5);
    expect(idArr[1]).toBe(-0.1);
    expect(result.city).toBe('London');
  });

  test('findOne by tuple id using CerialId', async () => {
    const created = await client.db.TupleIdModel.create({
      data: { id: [51.5, -0.1], city: 'London' },
    });

    const found = await client.db.TupleIdModel.findOne({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found!.city).toBe('London');
    const idArr = found!.id.id;
    expect(idArr[0]).toBe(51.5);
    expect(idArr[1]).toBe(-0.1);
  });

  test('findMany returns tuple ids', async () => {
    await client.db.TupleIdModel.create({ data: { id: [1.0, 2.0], city: 'A' } });
    await client.db.TupleIdModel.create({ data: { id: [3.0, 4.0], city: 'B' } });

    const results = await client.db.TupleIdModel.findMany();

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.id).toBeInstanceOf(CerialId);
      expect(Array.isArray(r.id.id)).toBe(true);
    }
  });

  test('deleteMany by tuple id using CerialId', async () => {
    const created = await client.db.TupleIdModel.create({
      data: { id: [10.0, 20.0], city: 'Delete' },
    });

    const count = await client.db.TupleIdModel.deleteMany({
      where: { id: created.id },
    });

    expect(count).toBe(1);

    const found = await client.db.TupleIdModel.findOne({ where: { id: created.id } });
    expect(found).toBeNull();
  });
});
