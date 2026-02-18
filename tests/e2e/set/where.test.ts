import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

const SET_TABLES = tables.set;

describe('E2E Set: Where', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, SET_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, SET_TABLES);

    await client.db.SetBasic.create({ data: { name: 'a', tags: ['ts', 'js', 'go'], numbers: [1, 2, 3], uuids: [] } });
    await client.db.SetBasic.create({ data: { name: 'b', tags: ['python', 'go'], numbers: [10, 20], uuids: [] } });
    await client.db.SetBasic.create({ data: { name: 'c', tags: ['ts'], numbers: [1], uuids: [] } });
  });

  test('filter with has', async () => {
    const results = await client.db.SetBasic.findMany({
      where: { tags: { has: 'go' } },
      orderBy: { name: 'asc' },
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.name).toBe('a');
    expect(results[1]!.name).toBe('b');
  });

  test('filter with hasAll', async () => {
    const results = await client.db.SetBasic.findMany({
      where: { tags: { hasAll: ['ts', 'go'] } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('a');
  });

  test('filter with hasAny', async () => {
    const results = await client.db.SetBasic.findMany({
      where: { tags: { hasAny: ['python', 'ts'] } },
      orderBy: { name: 'asc' },
    });

    expect(results).toHaveLength(3);
  });

  test('filter on number set with has', async () => {
    const results = await client.db.SetBasic.findMany({
      where: { numbers: { has: 1 } },
      orderBy: { name: 'asc' },
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.name).toBe('a');
    expect(results[1]!.name).toBe('c');
  });
});
