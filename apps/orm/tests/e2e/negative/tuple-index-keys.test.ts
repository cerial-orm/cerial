/**
 * E2E Tests: a tuple filter key that only starts with digits is refused — negative cases
 *
 * `parseInt` read '1 anything' as element 1, so a write filtered on it silently and a key with a newline reached
 * the refusal message. A write with such a key must throw as an unknown field and leave every row intact.
 *
 * Schema: tuples (TupleBasic)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Tuple index keys — negative cases', () => {
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
    await client.db.TupleBasic.create({ data: { name: 'a', location: [1, 2], history: [] } });
  });

  const hostile = (key: string) => ({ location: { [key]: 2 } }) as never;

  test.each(['1 anything', '0\n[INFO] forged', '01', '1e0'])('deleteMany refuses %j and keeps the row', async (key) => {
    await expect(
      (async () => {
        await client.db.TupleBasic.deleteMany({ where: hostile(key) });
      })(),
    ).rejects.toThrow('Unknown field');

    expect(await client.db.TupleBasic.count()).toBe(1);
  });

  test('findMany refuses the key instead of filtering on the element', async () => {
    await expect(
      (async () => {
        await client.db.TupleBasic.findMany({ where: hostile('1 anything') });
      })(),
    ).rejects.toThrow('Unknown field');
  });

  test('the plain index key still filters on the element', async () => {
    const rows = await client.db.TupleBasic.findMany({ where: { location: { 1: 2 } } });

    expect(rows.map((r) => r.name)).toEqual(['a']);
  });
});
