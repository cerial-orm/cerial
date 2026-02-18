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

describe('E2E Any: Decorators', () => {
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

  // ---------------------------------------------------------------------------
  // @default
  // ---------------------------------------------------------------------------

  test('@default — omitted field gets default value', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx' },
    });

    expect(result.defData).toBe('hello');
  });

  test('@default — explicit value overrides default', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { defData: 999, readonlyData: 'ro', indexedData: 'idx' },
    });

    expect(result.defData).toBe(999);
  });

  test('@default — null overrides default', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { defData: null, readonlyData: 'ro', indexedData: 'idx' },
    });

    expect(result.defData).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // @defaultAlways
  // ---------------------------------------------------------------------------

  test('@defaultAlways — omitted field gets default on create', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx' },
    });

    expect(result.alwaysData).toBe(42);
  });

  test('@defaultAlways — explicit value overrides default on create', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { alwaysData: 'custom', readonlyData: 'ro', indexedData: 'idx' },
    });

    expect(result.alwaysData).toBe('custom');
  });

  test('@defaultAlways — omitted field resets to default on update', async () => {
    const created = await client.db.AnyDecorated.create({
      data: { alwaysData: 'custom', readonlyData: 'ro', indexedData: 'idx' },
    });

    await client.db.AnyDecorated.updateMany({
      where: { id: created.id },
      data: { indexedData: 'idx2' },
    });

    const found = await client.db.AnyDecorated.findOne({ where: { id: created.id } });
    expect(found!.alwaysData).toBe(42);
  });

  test('@defaultAlways — explicit value on update persists', async () => {
    const created = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx' },
    });

    await client.db.AnyDecorated.updateMany({
      where: { id: created.id },
      data: { alwaysData: 'updated' },
    });

    const found = await client.db.AnyDecorated.findOne({ where: { id: created.id } });
    expect(found!.alwaysData).toBe('updated');
  });

  // ---------------------------------------------------------------------------
  // @readonly
  // ---------------------------------------------------------------------------

  test('@readonly — value set on create is stored', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { readonlyData: { locked: true }, indexedData: 'idx' },
    });

    expect(result.readonlyData).toEqual({ locked: true });
  });

  test('@readonly — update without readonly field succeeds', async () => {
    const created = await client.db.AnyDecorated.create({
      data: { readonlyData: 'immutable', indexedData: 'idx' },
    });

    await client.db.AnyDecorated.updateMany({
      where: { id: created.id },
      data: { indexedData: 'idx-updated' },
    });

    const found = await client.db.AnyDecorated.findOne({ where: { id: created.id } });
    expect(found!.readonlyData).toBe('immutable');
    expect(found!.indexedData).toBe('idx-updated');
  });

  // ---------------------------------------------------------------------------
  // @index
  // ---------------------------------------------------------------------------

  test('@index — indexed field stores and retrieves correctly', async () => {
    await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'searchable' },
    });

    const results = await client.db.AnyDecorated.findMany({
      where: { indexedData: { eq: 'searchable' } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.indexedData).toBe('searchable');
  });

  test('@index — indexed field works with numeric values', async () => {
    await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro1', indexedData: 100 },
    });
    await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro2', indexedData: 200 },
    });

    const results = await client.db.AnyDecorated.findMany({
      where: { indexedData: { gt: 150 } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.indexedData).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // @unique
  // ---------------------------------------------------------------------------

  test('@unique — first create succeeds', async () => {
    const result = await client.db.AnyUnique.create({
      data: { uniqueData: 'one-of-a-kind' },
    });

    expect(result.uniqueData).toBe('one-of-a-kind');
  });

  test('@unique — duplicate value throws', async () => {
    await client.db.AnyUnique.create({
      data: { uniqueData: 'taken' },
    });

    await expect(
      (async () => {
        await client.db.AnyUnique.create({
          data: { uniqueData: 'taken' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('@unique — different values succeed', async () => {
    await client.db.AnyUnique.create({ data: { uniqueData: 'first' } });
    const second = await client.db.AnyUnique.create({ data: { uniqueData: 'second' } });

    expect(second.uniqueData).toBe('second');
  });

  // ---------------------------------------------------------------------------
  // @sort on Any[]
  // ---------------------------------------------------------------------------

  test('@sort — array values come back sorted', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx', sortedItems: [3, 1, 2] },
    });

    expect(result.sortedItems).toEqual([1, 2, 3]);
  });

  test('@sort — string array comes back sorted', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx', sortedItems: ['c', 'a', 'b'] },
    });

    expect(result.sortedItems).toEqual(['a', 'b', 'c']);
  });

  test('@sort — push maintains sort order', async () => {
    const created = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx', sortedItems: [1, 3] },
    });

    await client.db.AnyDecorated.updateMany({
      where: { id: created.id },
      data: { sortedItems: { push: 2 } },
    });

    const found = await client.db.AnyDecorated.findOne({ where: { id: created.id } });
    expect(found!.sortedItems).toEqual([1, 2, 3]);
  });

  // ---------------------------------------------------------------------------
  // @distinct on Any[]
  // ---------------------------------------------------------------------------

  test('@distinct — duplicates removed on create', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx', distinctItems: [1, 2, 2, 3, 3, 3] },
    });

    expect(result.distinctItems).toEqual([1, 2, 3]);
  });

  test('@distinct — push with existing value deduplicates', async () => {
    const created = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx', distinctItems: ['a', 'b'] },
    });

    await client.db.AnyDecorated.updateMany({
      where: { id: created.id },
      data: { distinctItems: { push: 'a' } },
    });

    const found = await client.db.AnyDecorated.findOne({ where: { id: created.id } });
    expect(found!.distinctItems).toEqual(['a', 'b']);
  });

  test('@distinct — push with new value adds it', async () => {
    const created = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx', distinctItems: ['a', 'b'] },
    });

    await client.db.AnyDecorated.updateMany({
      where: { id: created.id },
      data: { distinctItems: { push: 'c' } },
    });

    const found = await client.db.AnyDecorated.findOne({ where: { id: created.id } });
    expect(found!.distinctItems).toContain('c');
    expect(found!.distinctItems).toHaveLength(3);
  });

  // ---------------------------------------------------------------------------
  // Combined decorator behavior
  // ---------------------------------------------------------------------------

  test('all defaults applied when creating with minimal data', async () => {
    const result = await client.db.AnyDecorated.create({
      data: { readonlyData: 'ro', indexedData: 'idx' },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.defData).toBe('hello');
    expect(result.alwaysData).toBe(42);
    expect(result.readonlyData).toBe('ro');
    expect(result.indexedData).toBe('idx');
    expect(result.sortedItems).toEqual([]);
    expect(result.distinctItems).toEqual([]);
  });
});
