/**
 * E2E Tuples and objects: a whole value compared to the field is checked like create checks it
 *
 * A number, string, boolean or malformed array given to an object or tuple field is refused naming the
 * field, so a negated filter on it cannot select every row. A valid tuple in array form is converted
 * as create converts it, and matches the row create wrote.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';

// Request bodies carry shapes the generated where types do not admit
const loose = (value: unknown): never => value as never;

// A refusal can throw while the query is built, so the call runs inside an async function
const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

const TABLES = ['tuple_basic', 'tuple_in_obj', 'uuid_with_tuple'];
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const U3 = '00000000-0000-4000-8000-000000000003';

const BAD_TUPLES: unknown[] = [5, 'x', true, [], [1], [{ foo: 1 }, 'garbage', 5], [1, 2, 3]];
const BAD_OBJECTS: unknown[] = [5, 'x', true, [1], []];

describe('E2E: a whole value compared to an object or tuple field', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await client.db.TupleBasic.create({ data: { name: 'a', location: [1, 2] } });
    await client.db.TupleBasic.create({ data: { name: 'b', location: [3, 4] } });
    await client.db.TupleBasic.create({ data: { name: 'c', location: [5, 6] } });
    for (const label of ['a', 'b', 'c']) {
      await client.db.TupleInObj.create({ data: { details: { label, coord: [1, 2] } } });
    }
  });

  const tupleNames = async (where: unknown = {}) =>
    (await client.db.TupleBasic.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((r) => r.name);

  describe('destructive writes are refused and touch no row', () => {
    test.each(BAD_TUPLES.map((v) => [JSON.stringify(v), v] as const))('deleteMany NOT tuple %s', async (_l, value) => {
      await refuses(() => client.db.TupleBasic.deleteMany({ where: loose({ NOT: { location: value } }) }), /location/);
      await refuses(() => client.db.TupleBasic.deleteMany({ where: loose({ location: value }) }), /location/);
      expect(await tupleNames()).toEqual(['a', 'b', 'c']);
    });

    test.each(BAD_TUPLES.map((v) => [JSON.stringify(v), v] as const))('updateMany NOT tuple %s', async (_l, value) => {
      await refuses(
        () => client.db.TupleBasic.updateMany({ where: loose({ NOT: { location: value } }), data: { name: 'hit' } }),
        /location/,
      );
      expect(await tupleNames()).toEqual(['a', 'b', 'c']);
    });

    test.each(BAD_OBJECTS.map((v) => [JSON.stringify(v), v] as const))(
      'deleteMany NOT object %s',
      async (_l, value) => {
        await refuses(() => client.db.TupleInObj.deleteMany({ where: loose({ NOT: { details: value } }) }), /details/);
        expect(await client.db.TupleInObj.count()).toBe(3);
      },
    );

    test('a bad tuple nested in an object is refused too', async () => {
      await refuses(
        () => client.db.TupleInObj.deleteMany({ where: loose({ NOT: { details: { coord: 5 } } }) }),
        /coord/,
      );
      expect(await client.db.TupleInObj.count()).toBe(3);
    });

    test('a bad tuple reached through a transaction is refused', async () => {
      await refuses(
        () => client.$transaction([client.db.TupleBasic.deleteMany({ where: loose({ NOT: { location: 5 } }) })]),
        /location/,
      );
      expect(await tupleNames()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('a valid tuple', () => {
    test('shorthand selects the row create wrote', async () => {
      expect(await tupleNames({ location: [3, 4] })).toEqual(['b']);
    });

    test('NOT deletes the other rows only', async () => {
      const n = await client.db.TupleBasic.deleteMany({ where: { NOT: { location: [3, 4] } } });
      expect(n).toBe(2);
      expect(await tupleNames()).toEqual(['b']);
    });

    test('a uuid tuple in array form is converted and selects the exact row', async () => {
      await client.db.UuidWithTuple.create({ data: { name: 'x', pair: [U1, U2] } });
      await client.db.UuidWithTuple.create({ data: { name: 'y', pair: [U2, U3] } });
      await client.db.UuidWithTuple.create({ data: { name: 'z', pair: [U1, U3] } });

      expect((await client.db.UuidWithTuple.findMany({ where: loose({ pair: [U1, U2] }) })).map((r) => r.name)).toEqual(
        ['x'],
      );

      const n = await client.db.UuidWithTuple.deleteMany({ where: loose({ NOT: { pair: [U1, U2] } }) });
      expect(n).toBe(2);
      expect((await client.db.UuidWithTuple.findMany()).map((r) => r.name)).toEqual(['x']);
    });
  });
});
