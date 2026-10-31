/**
 * E2E Tests: where shapes that reduce to always true, non-object logical items, and `upsert` with `notIn: []`
 *
 * A double negation of an empty or constant-false condition matches every row. Every destructive path, and a
 * `$live` subscription, must refuse it like `AND: []`, and the rows are compared afterwards. Reads stay
 * unaffected. A non-object item inside AND, OR or NOT refuses on a read as well as a write. An upsert whose only
 * other key is a filter that narrows nothing counts as `$raw` alone.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError, sql } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];

const refuses = async (run: () => PromiseLike<unknown>): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(CerialValidationError);
};

describe('E2E where structure', () => {
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
    for (const data of [
      { email: 'a@x.test', name: 'Ann', isActive: false, age: 20 },
      { email: 'b@x.test', name: 'Bob', isActive: true, age: 40 },
    ])
      await client.db.User.create({ data });
  });

  const rows = async (): Promise<Array<[string, string]>> =>
    (await client.db.User.findMany({ orderBy: { email: 'asc' } })).map((u) => [u.email, u.name]);
  const before: Array<[string, string]> = [
    ['a@x.test', 'Ann'],
    ['b@x.test', 'Bob'],
  ];

  const alwaysTrue: Array<[string, object]> = [
    ['NOT NOT {}', { NOT: { NOT: {} } }],
    ['NOT OR []', { NOT: { OR: [] } }],
    ['NOT AND [OR [], OR []]', { NOT: { AND: [{ OR: [] }, { OR: [] }] } }],
  ];

  describe.each(alwaysTrue)('%s', (_label, where) => {
    test('deleteMany refuses and keeps every row', async () => {
      await refuses(() => client.db.User.deleteMany({ where: where as never }));

      expect(await rows()).toEqual(before);
    });

    test('updateMany refuses and keeps every row', async () => {
      await refuses(() => client.db.User.updateMany({ where: where as never, data: { name: 'X' } }));

      expect(await rows()).toEqual(before);
    });

    test('upsert refuses and keeps every row', async () => {
      await refuses(() =>
        client.db.User.upsert({
          where: where as never,
          create: { email: 'n@x.test', name: 'New', isActive: true },
          update: { name: 'Rewritten' },
        }),
      );

      expect(await rows()).toEqual(before);
    });

    test('$live refuses', async () => {
      await refuses(() => client.db.User.$live({ where: where as never }));
    });

    test('a read is unaffected and returns every row', async () => {
      expect(await client.db.User.count(where as never)).toBe(2);
    });
  });

  test('deleteMany with a real filter under a double negation still deletes only the match', async () => {
    await client.db.User.deleteMany({ where: { NOT: { NOT: { name: 'Ann' } } } });

    expect(await rows()).toEqual([['b@x.test', 'Bob']]);
  });

  describe('non-object logical items refuse', () => {
    const items: Array<[string, unknown]> = [
      ['null', null],
      ['a number', 1],
      ['a string', 'DELETE user'],
    ];

    describe.each(['AND', 'OR'])('%s', (key) => {
      test.each(items)('findMany refuses %s', async (_label, item) => {
        await refuses(() => client.db.User.findMany({ where: { [key]: [item] } as never }));
      });

      test.each(items)('deleteMany refuses %s and keeps the rows', async (_label, item) => {
        await refuses(() => client.db.User.deleteMany({ where: { [key]: [item] } as never }));

        expect(await rows()).toEqual(before);
      });
    });

    test.each(items)('NOT refuses %s', async (_label, item) => {
      await refuses(() => client.db.User.findMany({ where: { NOT: item } as never }));
      await refuses(() => client.db.User.deleteMany({ where: { NOT: item } as never }));

      expect(await rows()).toEqual(before);
    });
  });

  describe('deeply nested where', () => {
    test('refuses with a validation error on a read and a delete', async () => {
      let where: object = { name: 'Ann' };
      for (let i = 0; i < 12000; i++) where = { AND: [where] };

      await refuses(() => client.db.User.findMany({ where: where as never }));
      await refuses(() => client.db.User.deleteMany({ where: where as never }));

      expect(await rows()).toEqual(before);
    });

    test('a legitimate deep query still runs', async () => {
      let where: object = { name: 'Ann' };
      for (let i = 0; i < 9; i++) where = { NOT: { NOT: where } };

      expect((await client.db.User.findMany({ where: where as never })).map((u) => u.name)).toEqual(['Ann']);
    });
  });

  describe('upsert with $raw beside a filter that narrows nothing', () => {
    const upsertBy = (where: object) =>
      client.db.User.upsert({
        where: where as never,
        create: { email: 'new@x.test', name: 'New', isActive: true },
        update: { name: 'Rewritten' },
      });

    test.each([
      ['notIn []', { $raw: sql`true`, name: { notIn: [] } }],
      ['notIn [] twice over AND', { AND: [{ $raw: sql`true` }, { name: { notIn: [] } }] }],
    ])('%s refuses and every row is untouched', async (_label, where) => {
      await refuses(() => upsertBy(where));

      expect(await rows()).toEqual(before);
    });

    test('a non-empty notIn is a real condition and stays allowed', async () => {
      await upsertBy({ $raw: sql`true`, name: { notIn: ['Ann'] } });

      expect((await rows()).map((r) => r[1])).toEqual(['Ann', 'Rewritten']);
    });
  });
});
