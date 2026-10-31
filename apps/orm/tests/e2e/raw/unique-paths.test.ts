/**
 * E2E Tests: `$raw` on unique paths and on upsert
 *
 * An upsert skips the unique-field check, so a where made only of `$raw` would rewrite every row the fragment
 * matches. It refuses at any AND, OR and NOT depth, and the rows are compared afterwards. `$raw` beside a
 * unique key filters on the unique methods and a `$raw` alone is refused there. `deleteMany` and `updateMany`
 * with `$raw` alone stay allowed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError, sql } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];

describe('E2E $raw on unique paths', () => {
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
      { email: 'c@x.test', name: 'Cy', isActive: true, age: 60 },
    ])
      await client.db.User.create({ data });
  });

  const rows = async (): Promise<Array<[string, string, number | null | undefined]>> =>
    (await client.db.User.findMany({ orderBy: { email: 'asc' } })).map((u) => [u.email, u.name, u.age]);
  const before: Array<[string, string, number]> = [
    ['a@x.test', 'Ann', 20],
    ['b@x.test', 'Bob', 40],
    ['c@x.test', 'Cy', 60],
  ];

  const refuses = async (run: () => PromiseLike<unknown>): Promise<void> => {
    await expect(
      (async () => {
        await run();
      })(),
    ).rejects.toThrow(CerialValidationError);
  };

  const upsertBy = (where: object) =>
    client.db.User.upsert({
      where: where as never,
      create: { email: 'new@x.test', name: 'New', isActive: true },
      update: { name: 'Rewritten' },
    });

  describe('an upsert filtered only by $raw refuses and every row is untouched', () => {
    const shapes: Array<[string, () => object]> = [
      ['$raw alone', () => ({ $raw: sql`true` })],
      ['inside AND', () => ({ AND: [{ $raw: sql`true` }] })],
      ['inside NOT', () => ({ NOT: { $raw: sql`age > ${100}` } })],
      ['inside OR', () => ({ OR: [{ $raw: sql`true` }] })],
      ['three levels down', () => ({ OR: [{ AND: [{ NOT: { $raw: sql`false` } }] }] })],
    ];

    test.each(shapes)('%s', async (_label, where) => {
      await refuses(() => upsertBy(where()));

      expect(await rows()).toEqual(before);
    });
  });

  describe('$raw beside another condition stays allowed on upsert', () => {
    test('beside a unique field', async () => {
      await upsertBy({ email: 'a@x.test', $raw: sql`age < ${30}` });

      expect(await rows()).toEqual([
        ['a@x.test', 'Rewritten', 20],
        ['b@x.test', 'Bob', 40],
        ['c@x.test', 'Cy', 60],
      ]);
    });

    test('beside a non-unique field', async () => {
      await upsertBy({ name: 'Bob', $raw: sql`age > ${30}` });

      expect(await rows()).toEqual([
        ['a@x.test', 'Ann', 20],
        ['b@x.test', 'Rewritten', 40],
        ['c@x.test', 'Cy', 60],
      ]);
    });

    test('beside an id', async () => {
      const cy = (await client.db.User.findOne({ where: { name: 'Cy' } }))!;
      await upsertBy({ id: cy.id, $raw: sql`age > ${50}` });

      expect((await rows()).map((r) => r[1])).toEqual(['Ann', 'Bob', 'Rewritten']);
    });

    test('a fragment that matches nothing creates a row', async () => {
      await upsertBy({ email: 'new@x.test', $raw: sql`age > ${50}` });

      expect(await client.db.User.count()).toBe(4);
    });
  });

  describe('the unique methods take $raw beside a unique key', () => {
    test('$raw alone is refused on each', async () => {
      await refuses(() => client.db.User.findUnique({ where: { $raw: sql`true` } as never }));
      await refuses(() => client.db.User.updateUnique({ where: { $raw: sql`true` } as never, data: { name: 'X' } }));
      await refuses(() => client.db.User.deleteUnique({ where: { $raw: sql`true` } as never }));

      expect(await rows()).toEqual(before);
    });

    test('a matching fragment filters in', async () => {
      expect((await client.db.User.findUnique({ where: { email: 'a@x.test', $raw: sql`age < ${30}` } }))?.name).toBe(
        'Ann',
      );
      await client.db.User.updateUnique({
        where: { email: 'a@x.test', $raw: sql`age < ${30}` },
        data: { name: 'Ann2' },
      });
      expect((await rows())[0]?.[1]).toBe('Ann2');
    });

    test('a fragment that rules the row out leaves it', async () => {
      expect(await client.db.User.findUnique({ where: { email: 'a@x.test', $raw: sql`age > ${30}` } })).toBeNull();
      await client.db.User.updateUnique({ where: { email: 'a@x.test', $raw: sql`age > ${30}` }, data: { name: 'X' } });
      await client.db.User.deleteUnique({ where: { email: 'a@x.test', $raw: sql`age > ${30}` } });

      expect(await rows()).toEqual(before);
    });

    test('deleteUnique removes the one row the fragment keeps', async () => {
      await client.db.User.deleteUnique({ where: { email: 'a@x.test', $raw: sql`age < ${30}` } });

      expect((await rows()).map((r) => r[0])).toEqual(['b@x.test', 'c@x.test']);
    });
  });

  describe('deleteMany and updateMany with $raw alone stay allowed', () => {
    test('updateMany', async () => {
      await client.db.User.updateMany({ where: { $raw: sql`age > ${30}` }, data: { name: 'Old' } });

      expect((await rows()).map((r) => r[1])).toEqual(['Ann', 'Old', 'Old']);
    });

    test('deleteMany', async () => {
      await client.db.User.deleteMany({ where: { $raw: sql`age > ${30}` } });

      expect((await rows()).map((r) => r[1])).toEqual(['Ann']);
    });
  });
});
