import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const ANY_TABLES = tables.any;

describe('E2E Any: Where', () => {
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

  test('filter by exact string value', async () => {
    await client.db.AnyBasic.create({ data: { name: 'a', data: 'match' } });
    await client.db.AnyBasic.create({ data: { name: 'b', data: 'other' } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { eq: 'match' } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('a');
  });

  test('filter by numeric comparison', async () => {
    await client.db.AnyBasic.create({ data: { name: 'low', data: 10 } });
    await client.db.AnyBasic.create({ data: { name: 'high', data: 100 } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { gt: 50 } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('high');
  });

  test('filter by neq', async () => {
    await client.db.AnyBasic.create({ data: { name: 'keep', data: 'yes' } });
    await client.db.AnyBasic.create({ data: { name: 'skip', data: 'no' } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { neq: 'no' } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('keep');
  });

  test('filter with in operator', async () => {
    await client.db.AnyBasic.create({ data: { name: 'one', data: 1 } });
    await client.db.AnyBasic.create({ data: { name: 'two', data: 2 } });
    await client.db.AnyBasic.create({ data: { name: 'three', data: 3 } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { in: [1, 3] } },
    });

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['one', 'three']);
  });
});
