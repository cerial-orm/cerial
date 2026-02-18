import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const ANY_TABLES = tables.any;

describe('E2E Any: Create', () => {
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

  test('create with string value', async () => {
    const result = await client.db.AnyBasic.create({
      data: { name: 'str-test', data: 'hello world' },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('str-test');
    expect(result.data).toBe('hello world');
    expect(result.items).toEqual([]);
  });

  test('create with number value', async () => {
    const result = await client.db.AnyBasic.create({
      data: { name: 'num-test', data: 42 },
    });

    expect(result.data).toBe(42);
  });

  test('create with boolean value', async () => {
    const result = await client.db.AnyBasic.create({
      data: { name: 'bool-test', data: true },
    });

    expect(result.data).toBe(true);
  });

  test('create with null value', async () => {
    const result = await client.db.AnyBasic.create({
      data: { name: 'null-test', data: null },
    });

    expect(result.data).toBeNull();
  });

  test('create with object value', async () => {
    const result = await client.db.AnyBasic.create({
      data: { name: 'obj-test', data: { key: 'value', nested: { deep: true } } },
    });

    expect(result.data).toEqual({ key: 'value', nested: { deep: true } });
  });

  test('create with array value', async () => {
    const result = await client.db.AnyBasic.create({
      data: { name: 'arr-test', data: [1, 'two', true] },
    });

    expect(result.data).toEqual([1, 'two', true]);
  });

  test('create with items array containing mixed types', async () => {
    const result = await client.db.AnyBasic.create({
      data: { name: 'items-test', data: 'base', items: [1, 'two', false, { k: 'v' }] },
    });

    expect(result.items).toEqual([1, 'two', false, { k: 'v' }]);
  });

  test('create AnyWithObject with Any field in object', async () => {
    const result = await client.db.AnyWithObject.create({
      data: { name: 'obj-any', meta: { data: [1, 2, 3], label: 'test' } },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.meta.data).toEqual([1, 2, 3]);
    expect(result.meta.label).toBe('test');
  });
});
