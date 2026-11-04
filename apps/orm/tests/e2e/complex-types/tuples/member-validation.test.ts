/**
 * E2E Tests: tuple member validation
 *
 * The validator refuses what SurrealDB 4.0 refuses in a tuple member, before the query is sent, and
 * accepts what it accepts. Schema: tuples.cerial (TupleBasic, TupleObjInTuple).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Tuples: Member Validation', () => {
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

  describe('primitive members', () => {
    test('should store an integral number in an int member and a float member', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'ok', location: [1, 2.5], entry: ['n', 2.0, true] },
      });

      expect(result.location).toEqual([1, 2.5]);
      expect(result.entry).toEqual(['n', 2, true]);
    });

    test('should refuse a fractional number in an int member', async () => {
      await expect(
        (async () => {
          await client.db.TupleBasic.create({ data: { name: 'x', location: [1, 2], entry: ['n', 1.5, true] } });
        })(),
      ).rejects.toThrow('entry[1] must be of type int');
      expect(await client.db.TupleBasic.count()).toBe(0);
    });

    test('should refuse a string in a float member', async () => {
      await expect(
        (async () => {
          // @ts-expect-error - a string where a float member is expected
          await client.db.TupleBasic.create({ data: { name: 'x', location: [1, 'a'] } });
        })(),
      ).rejects.toThrow('location[1] must be of type float');
      expect(await client.db.TupleBasic.count()).toBe(0);
    });
  });

  describe('strict object element', () => {
    test('should store a declared object element', async () => {
      const result = await client.db.TupleObjInTuple.create({
        data: { place: ['a', { street: 's', city: 'c' }] },
      });

      expect(result.place).toEqual(['a', { street: 's', city: 'c' }]);
    });

    test('should refuse an undeclared key in array form before the database does', async () => {
      await expect(
        (async () => {
          // @ts-expect-error - extra is not a key of TupleAddress
          await client.db.TupleObjInTuple.create({ data: { place: ['a', { street: 's', city: 'c', extra: 1 }] } });
        })(),
      ).rejects.toThrow("Unknown field 'place[1].extra'");
      expect(await client.db.TupleObjInTuple.count()).toBe(0);
    });

    test('should refuse an undeclared key in object form', async () => {
      await expect(
        (async () => {
          await client.db.TupleObjInTuple.create({
            // @ts-expect-error - extra is not a key of TupleAddress
            data: { place: { tag: 'a', '1': { street: 's', city: 'c', extra: 1 } } },
          });
        })(),
      ).rejects.toThrow("Unknown field 'place.1.extra'");
    });

    test('should refuse a wrong member type inside the object element', async () => {
      await expect(
        (async () => {
          // @ts-expect-error - street is a string
          await client.db.TupleObjInTuple.create({ data: { place: ['a', { street: 5, city: 'c' }] } });
        })(),
      ).rejects.toThrow('place[1].street must be of type string');
    });
  });
});
