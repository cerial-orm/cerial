import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Literals: literal array inside an object', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.literals);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.literals);
  });

  test('stores an array of declared variants', async () => {
    const result = await client.db.LiteralObjectArray.create({
      data: { tagged: { states: ['active', 'pending'], label: 'x' } },
    });

    expect(result.tagged.states).toEqual(['active', 'pending']);
  });

  test('stores an empty array', async () => {
    const result = await client.db.LiteralObjectArray.create({ data: { tagged: { states: [], label: 'x' } } });

    expect(result.tagged.states).toEqual([]);
  });

  test('rejects an element that is not a declared variant', async () => {
    await expect(
      (async () => {
        await client.db.LiteralObjectArray.create({
          // @ts-expect-error 'archived' is not a Status variant
          data: { tagged: { states: ['active', 'archived'], label: 'x' } },
        });
      })(),
    ).rejects.toThrow();
    expect(await client.db.LiteralObjectArray.count()).toBe(0);
  });
});
