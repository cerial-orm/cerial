/**
 * E2E Tests: an empty where branch is true, so NOT around an OR that holds one matches nothing
 *
 * An empty branch (`{}`, `AND: []`, an empty object field, undefined values) means every row. An OR with one is
 * therefore every row, and NOT of it is none. The OR used to drop the empty branch, which turned
 * `NOT: { OR: [{}, { name: 't1' }] }` into `NOT (name = 't1')` and deleted rows the written filter keeps.
 * Every destructive entry point asserts the exact surviving rows; reads and the ordinary filters pin the rest.
 *
 * Schema: flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// Hostile shapes are what a JavaScript or cast caller can send; the generated types reject them
const hostile = (value: unknown): never => value as never;

const shapes: Record<string, unknown> = {
  'empty object': {},
  'empty AND': { AND: [] },
  'OR of an empty object': { OR: [{}] },
  'NOT of an empty OR': { NOT: { OR: [] } },
  'empty object field': { strictAddress: {} },
  'empty flexible field': { address: {} },
  'undefined value': { name: undefined },
};

// NOT (shape OR t1): the OR is every row, so nothing matches
const notOr = (shape: unknown) => hostile({ NOT: { OR: [shape, { name: 't1' }] } });
// NOT (t1 AND (t2 OR shape)): the inner OR is every row, so this is NOT t1
const notAndOr = (shape: unknown) => hostile({ NOT: { AND: [{ name: 't1' }, { OR: [{ name: 't2' }, shape] }] } });

describe('Empty where branches — destructive and read paths', () => {
  let client: CerialClient;

  const names = async () => (await client.db.FlexUser.findMany({ orderBy: { name: 'asc' } })).map((r) => r.name);

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.flexible);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.flexible);
    for (const name of ['t1', 't2', 't3']) {
      await client.db.FlexUser.create({
        data: {
          name,
          address: { street: '1 Main', city: 'NYC' },
          profile: { bio: 'hi', metadata: { label: 'x' } },
          strictAddress: { street: '2 Main', city: 'LA' },
        },
      });
    }
  });

  describe.each(Object.entries(shapes))('%s', (_label, shape) => {
    test('deleteMany with NOT (shape OR t1) deletes nothing', async () => {
      await client.db.FlexUser.deleteMany({ where: notOr(shape) });

      expect(await names()).toEqual(['t1', 't2', 't3']);
    });

    test('deleteMany with NOT (t1 AND (t2 OR shape)) deletes exactly t2 and t3', async () => {
      await client.db.FlexUser.deleteMany({ where: notAndOr(shape) });

      expect(await names()).toEqual(['t1']);
    });

    test('updateMany with NOT (shape OR t1) updates nothing', async () => {
      await client.db.FlexUser.updateMany({ where: notOr(shape), data: { name: 'changed' } });

      expect(await names()).toEqual(['t1', 't2', 't3']);
    });

    test('updateMany with NOT (t1 AND (t2 OR shape)) updates exactly t2 and t3', async () => {
      await client.db.FlexUser.updateMany({ where: notAndOr(shape), data: { name: 'changed' } });

      expect(await names()).toEqual(['changed', 'changed', 't1']);
    });

    test('findMany and count with NOT (shape OR t1) match nothing', async () => {
      expect(await client.db.FlexUser.findMany({ where: notOr(shape) })).toEqual([]);
      expect(await client.db.FlexUser.count(notOr(shape))).toBe(0);
    });

    test('findMany and count with NOT (t1 AND (t2 OR shape)) match t2 and t3', async () => {
      const rows = await client.db.FlexUser.findMany({ where: notAndOr(shape), orderBy: { name: 'asc' } });

      expect(rows.map((r) => r.name)).toEqual(['t2', 't3']);
      expect(await client.db.FlexUser.count(notAndOr(shape))).toBe(2);
    });

    test('a bare OR with the shape matches every row', async () => {
      expect(await client.db.FlexUser.count(hostile({ OR: [shape, { name: 't1' }] }))).toBe(3);
    });
  });

  // An operator object with only undefined values is an empty operator object: a read gives it a meaning, a write refuses it
  describe('undefined operator value', () => {
    const shape = { name: { eq: undefined } };

    test('deleteMany and updateMany refuse it in either branch position and change nothing', async () => {
      for (const where of [notOr(shape), notAndOr(shape)]) {
        await expect(
          (async () => {
            await client.db.FlexUser.deleteMany({ where });
          })(),
        ).rejects.toThrow(/ambiguous on a write/);
        await expect(
          (async () => {
            await client.db.FlexUser.updateMany({ where, data: { name: 'changed' } });
          })(),
        ).rejects.toThrow(/ambiguous on a write/);
      }

      expect(await names()).toEqual(['t1', 't2', 't3']);
    });

    test('findMany and count keep their meaning', async () => {
      expect(await client.db.FlexUser.findMany({ where: notOr(shape) })).toEqual([]);
      expect(await client.db.FlexUser.count(notOr(shape))).toBe(0);
      expect(await client.db.FlexUser.count(notAndOr(shape))).toBe(2);
      expect(await client.db.FlexUser.count(hostile({ OR: [shape, { name: 't1' }] }))).toBe(3);
    });
  });

  describe('ordinary filters return the same rows as before', () => {
    test('OR of two names', async () => {
      const rows = await client.db.FlexUser.findMany({
        where: { OR: [{ name: 't1' }, { name: 't2' }] },
        orderBy: { name: 'asc' },
      });

      expect(rows.map((r) => r.name)).toEqual(['t1', 't2']);
    });

    test('NOT of an OR of names', async () => {
      const rows = await client.db.FlexUser.findMany({ where: { NOT: { OR: [{ name: 't1' }, { name: 't2' }] } } });

      expect(rows.map((r) => r.name)).toEqual(['t3']);
    });

    test('AND of a name and an OR of names', async () => {
      const rows = await client.db.FlexUser.findMany({
        where: { AND: [{ name: 't1' }, { OR: [{ name: 't1' }, { name: 't2' }] }] },
      });

      expect(rows.map((r) => r.name)).toEqual(['t1']);
    });

    test('deleteMany with NOT of an OR of names deletes only the unlisted row', async () => {
      await client.db.FlexUser.deleteMany({ where: { NOT: { OR: [{ name: 't1' }, { name: 't2' }] } } });

      expect(await names()).toEqual(['t1', 't2']);
    });

    test('updateMany with OR of names updates only those rows', async () => {
      await client.db.FlexUser.updateMany({
        where: { OR: [{ name: 't1' }, { name: 't2' }] },
        data: { name: 'changed' },
      });

      expect(await names()).toEqual(['changed', 'changed', 't3']);
    });
  });
});
