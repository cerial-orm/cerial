import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Tuples: literal and enum elements', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.tuples);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.tuples);
  });

  test('accepts each variant in array and object form', async () => {
    const result = await client.db.TupleLiteralElement.create({
      data: { name: 'forms', status: ['active', 1], role: { 0: 'ADMIN', 1: 2 }, history: [] },
    });

    expect(result.status).toEqual(['active', 1]);
    expect(result.role).toEqual(['ADMIN', 2]);
  });

  test('stores an array of literal-element tuples', async () => {
    const result = await client.db.TupleLiteralElement.create({
      data: {
        name: 'history',
        status: ['pending', 0],
        role: ['USER', 0],
        history: [
          ['active', 1],
          ['inactive', 2],
        ],
      },
    });

    expect(result.history).toEqual([
      ['active', 1],
      ['inactive', 2],
    ]);
  });

  test('rejects a string that is not a declared literal variant', async () => {
    await expect(
      (async () => {
        await client.db.TupleLiteralElement.create({
          // @ts-expect-error 'unknown' is not one of the Status variants
          data: { name: 'bad-literal', status: ['unknown', 1], role: ['ADMIN', 1], history: [] },
        });
      })(),
    ).rejects.toThrow();
    expect(await client.db.TupleLiteralElement.count()).toBe(0);
  });

  test('rejects a value that is not a declared enum member', async () => {
    await expect(
      (async () => {
        await client.db.TupleLiteralElement.create({
          // @ts-expect-error 'GUEST' is not a Role
          data: { name: 'bad-enum', status: ['active', 1], role: ['GUEST', 1], history: [] },
        });
      })(),
    ).rejects.toThrow();
  });

  test('filters on a literal element by index', async () => {
    await client.db.TupleLiteralElement.create({
      data: { name: 'one', status: ['active', 1], role: ['ADMIN', 1], history: [] },
    });
    await client.db.TupleLiteralElement.create({
      data: { name: 'two', status: ['inactive', 2], role: ['USER', 1], history: [] },
    });

    const found = await client.db.TupleLiteralElement.findMany({ where: { status: { 0: { eq: 'inactive' } } } });

    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('two');
  });
});
