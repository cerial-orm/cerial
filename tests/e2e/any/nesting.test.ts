import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';

const ANY_TABLES = tables.any;

describe('E2E Any: Nesting', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ANY_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ANY_TABLES);
  });

  test('object with Any stores string', async () => {
    const result = await client.db.AnyWithObject.create({
      data: { name: 'str', meta: { data: 'hello', label: 'a' } },
    });

    expect(result.meta.data).toBe('hello');
  });

  test('object with Any stores number', async () => {
    const result = await client.db.AnyWithObject.create({
      data: { name: 'num', meta: { data: 99.5, label: 'b' } },
    });

    expect(result.meta.data).toBe(99.5);
  });

  test('object with Any stores nested object', async () => {
    const nested = { x: 1, y: [2, 3] };
    const result = await client.db.AnyWithObject.create({
      data: { name: 'nested', meta: { data: nested, label: 'c' } },
    });

    expect(result.meta.data).toEqual(nested);
  });

  test('object with Any stores array', async () => {
    const result = await client.db.AnyWithObject.create({
      data: { name: 'arr', meta: { data: [1, 'two', true], label: 'd' } },
    });

    expect(result.meta.data).toEqual([1, 'two', true]);
  });

  test('findMany on AnyWithObject returns correct data', async () => {
    await client.db.AnyWithObject.create({
      data: { name: 'search', meta: { data: { nested: true }, label: 'find-me' } },
    });

    const results = await client.db.AnyWithObject.findMany({
      where: { name: 'search' },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.meta.label).toBe('find-me');
    expect(results[0]!.meta.data).toEqual({ nested: true });
  });

  test('update Any field in AnyBasic', async () => {
    const created = await client.db.AnyBasic.create({
      data: { name: 'update-test', data: 'original' },
    });

    await client.db.AnyBasic.updateMany({
      where: { id: created.id },
      data: { data: { replaced: true } },
    });

    const found = await client.db.AnyBasic.findOne({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found!.data).toEqual({ replaced: true });
  });

  test('select specific fields with Any', async () => {
    await client.db.AnyBasic.create({
      data: { name: 'select-test', data: 'val' },
    });

    const results = await client.db.AnyBasic.findMany({
      where: { name: 'select-test' },
      select: { name: true, data: true },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('select-test');
    expect(results[0]!.data).toBe('val');
  });
});
