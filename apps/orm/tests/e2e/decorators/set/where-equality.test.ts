/**
 * E2E Set: an array operand compares equal to the set create stores
 *
 * The database never equates a stored set with a plain array, so an array operand is cast to a set
 * (deduplicated, sorted) before it is compared. Without that, equality matched nothing and a negated
 * filter matched every row.
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

const loose = (value: unknown): never => value as never;

describe('E2E Set: where equality', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.set);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.set);
    await client.db.SetBasic.create({ data: { name: 'a', tags: ['x', 'y'], numbers: [1, 2], uuids: [] } });
    await client.db.SetBasic.create({ data: { name: 'b', tags: ['x'], numbers: [3], uuids: [] } });
    await client.db.SetBasic.create({ data: { name: 'c', tags: [], numbers: [1, 2, 3], uuids: [] } });
  });

  const names = async (where: unknown) =>
    (await client.db.SetBasic.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((r) => r.name);

  describe('destructive writes', () => {
    test('deleteMany NOT removes only the rows that differ', async () => {
      const n = await client.db.SetBasic.deleteMany({ where: { NOT: { numbers: [1, 2] } } });
      expect(n).toBe(2);
      expect(await names({})).toEqual(['a']);
    });

    test('deleteMany neq removes only the rows that differ', async () => {
      const n = await client.db.SetBasic.deleteMany({ where: loose({ numbers: { neq: [3] } }) });
      expect(n).toBe(2);
      expect(await names({})).toEqual(['b']);
    });

    test('deleteMany notIn removes only the rows that differ', async () => {
      const n = await client.db.SetBasic.deleteMany({ where: loose({ numbers: { notIn: [[1, 2], [3]] } }) });
      expect(n).toBe(1);
      expect(await names({})).toEqual(['a', 'b']);
    });

    test('updateMany changes only the rows that differ', async () => {
      await client.db.SetBasic.updateMany({ where: { NOT: { numbers: [1, 2] } }, data: { name: 'hit' } });
      expect(await names({})).toEqual(['a', 'hit', 'hit']);
    });

    test('a transaction applies the same comparison', async () => {
      await client.$transaction([client.db.SetBasic.deleteMany({ where: { NOT: { numbers: [1, 2] } } })]);
      expect(await names({})).toEqual(['a']);
    });
  });

  describe('reads', () => {
    test('shorthand matches the stored set', async () => {
      expect(await names({ numbers: [1, 2] })).toEqual(['a']);
      expect(await names({ tags: ['x', 'y'] })).toEqual(['a']);
    });

    test('order and duplicates in the operand do not matter, as in create', async () => {
      expect(await names({ numbers: [2, 1, 2, 1] })).toEqual(['a']);
      expect(await names({ tags: ['y', 'x', 'x'] })).toEqual(['a']);
      expect(await names({ numbers: { eq: [3, 2, 1] } })).toEqual(['c']);
    });

    test('eq, neq and not agree', async () => {
      expect(await names({ numbers: { eq: [3] } })).toEqual(['b']);
      expect(await names({ numbers: { neq: [3] } })).toEqual(['a', 'c']);
      expect(await names({ numbers: { not: [3] } })).toEqual(['a', 'c']);
    });

    test('in and notIn compare each array as a set', async () => {
      expect(await names({ numbers: { in: [[2, 1], [3]] } })).toEqual(['a', 'b']);
      expect(await names({ numbers: { notIn: [[2, 1], [3]] } })).toEqual(['c']);
    });

    test('the value findUnique returned matches its own row', async () => {
      const a = await client.db.SetBasic.findOne({ where: { name: 'a' } });
      expect(await names({ numbers: a!.numbers })).toEqual(['a']);
      expect(await names({ NOT: { numbers: a!.numbers } })).toEqual(['b', 'c']);
    });

    test('an empty set matches the empty row only', async () => {
      expect(await names({ tags: [] })).toEqual(['c']);
      expect(await names({ tags: { neq: [] } })).toEqual(['a', 'b']);
    });

    test('has, hasAll and hasAny are unchanged', async () => {
      expect(await names({ numbers: { has: 1 } })).toEqual(['a', 'c']);
      expect(await names({ numbers: { hasAll: [1, 2] } })).toEqual(['a', 'c']);
      expect(await names({ numbers: { hasAny: [3] } })).toEqual(['b', 'c']);
    });

    test('a @set sub-field of an object is a plain array and compares as one', async () => {
      await client.db.SetNested.create({
        data: { name: 'n1', bag: { tags: ['p', 'q'], nums: [1] }, strictBag: { tags: ['z'], nums: [] } },
      });
      await client.db.SetNested.create({ data: { name: 'n2', strictBag: { tags: ['y'], nums: [] } } });
      const found = await client.db.SetNested.findMany({ where: loose({ strictBag: { tags: ['z'] } }) });
      expect(found.map((r) => r.name)).toEqual(['n1']);
      const n = await client.db.SetNested.deleteMany({ where: loose({ NOT: { strictBag: { tags: ['z'] } } }) });
      expect(n).toBe(1);
    });
  });
});
