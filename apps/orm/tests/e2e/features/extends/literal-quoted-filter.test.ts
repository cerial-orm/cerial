import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  LITERAL_TABLES,
  testConfig,
  truncateTables,
} from './helpers';

describe('E2E Extends: literal pick and omit naming string variants', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, LITERAL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, LITERAL_TABLES);
  });

  test('pick keeps exactly the named variants', async () => {
    for (const picked of ['low', 'high'] as const) {
      const result = await client.db.ExtLiteralQuoted.create({ data: { picked, omitted: 'low' } });
      expect(result.picked).toBe(picked);
    }
  });

  test('pick drops the variant it did not name', async () => {
    await expect(
      (async () => {
        await client.db.ExtLiteralQuoted.create({
          // @ts-expect-error 'medium' was not picked
          data: { picked: 'medium', omitted: 'low' },
        });
      })(),
    ).rejects.toThrow();
    expect(await client.db.ExtLiteralQuoted.count()).toBe(0);
  });

  test('omit keeps every variant except the named one', async () => {
    for (const omitted of ['low', 'high'] as const) {
      const result = await client.db.ExtLiteralQuoted.create({ data: { picked: 'low', omitted } });
      expect(result.omitted).toBe(omitted);
    }
  });

  test('omit drops the named variant', async () => {
    await expect(
      (async () => {
        await client.db.ExtLiteralQuoted.create({
          // @ts-expect-error 'medium' was omitted
          data: { picked: 'low', omitted: 'medium' },
        });
      })(),
    ).rejects.toThrow();
  });
});
