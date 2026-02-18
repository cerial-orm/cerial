import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Typed IDs: Int ID', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.typedIds);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.typedIds);
  });

  test('create with int id', async () => {
    const result = await client.db.IntIdModel.create({
      data: { id: 42, name: 'test' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(result.id.id).toBe(42);
    expect(typeof result.id.id).toBe('number');
    expect(result.name).toBe('test');
  });

  test('create with zero id', async () => {
    const result = await client.db.IntIdModel.create({
      data: { id: 0, name: 'zero' },
    });

    expect(result.id.id).toBe(0);
    expect(typeof result.id.id).toBe('number');
  });

  test('create with negative id', async () => {
    const result = await client.db.IntIdModel.create({
      data: { id: -5, name: 'negative' },
    });

    expect(result.id.id).toBe(-5);
  });

  test('findOne by int id', async () => {
    await client.db.IntIdModel.create({
      data: { id: 42, name: 'findme' },
    });

    const found = await client.db.IntIdModel.findOne({
      where: { id: 42 },
    });

    expect(found).not.toBeNull();
    expect(found!.id.id).toBe(42);
    expect(found!.name).toBe('findme');
  });

  test('findMany returns typed ids', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
    await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

    const results = await client.db.IntIdModel.findMany();

    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.id).toBeInstanceOf(CerialId);
      expect(typeof r.id.id).toBe('number');
    }
  });

  test('updateMany by int id preserves id', async () => {
    await client.db.IntIdModel.create({
      data: { id: 42, name: 'before' },
    });

    const updated = await client.db.IntIdModel.updateMany({
      where: { id: 42 },
      data: { name: 'after' },
    });

    expect(Array.isArray(updated)).toBe(true);
    expect(updated).toHaveLength(1);
    const first = updated[0]!;
    expect(first.id.id).toBe(42);
    expect(first.name).toBe('after');
  });

  test('deleteMany by int id', async () => {
    await client.db.IntIdModel.create({
      data: { id: 42, name: 'deleteme' },
    });

    const count = await client.db.IntIdModel.deleteMany({
      where: { id: 42 },
    });

    expect(count).toBe(1);

    const found = await client.db.IntIdModel.findOne({ where: { id: 42 } });
    expect(found).toBeNull();
  });

  test('create with large int id', async () => {
    const result = await client.db.IntIdModel.create({
      data: { id: 999999, name: 'large' },
    });

    expect(result.id.id).toBe(999999);
  });
});
