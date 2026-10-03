/**
 * E2E Tests for the `return` mode on a nested-operation updateUnique
 *
 * A write that carries a nested relation op must return what the same write without it returns, in
 * every `return` mode. Every case runs the nested call and a plain control on a fresh seed and
 * asserts they agree.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

/** Narrows a row the test just created: a missing one is a broken setup, not a failed assertion. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);

  return value;
}

describe('E2E Nested update return mode', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
  });

  const seed = async () => {
    const tag1 = await client.db.Tag.create({ data: { name: 't1' } });
    const tag2 = await client.db.Tag.create({ data: { name: 't2' } });
    const a = await client.db.User.create({
      data: { email: 'a@x.io', name: 'a', isActive: true, age: 10, tagIds: [tag1.id] },
    });

    return { a, tag1, tag2 };
  };

  type Seed = Awaited<ReturnType<typeof seed>>;
  type Row = { name: string; age?: number | null; tagIds: unknown[] };

  // Ids differ between the nested and the plain run, so rows are compared on content
  const shape = (row: Row | null) => (row ? { name: row.name, age: row.age, tags: row.tagIds.length } : row);

  const run = async <T>(write: (s: Seed) => PromiseLike<T>) => {
    await truncateTables(client, tables.core);

    return write(await seed());
  };

  describe('before', () => {
    test('returns the name as it was before the update, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'NEW', age: 99, tags: { connect: [tag2.id] } },
          return: 'before',
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id }, data: { name: 'NEW', age: 99 }, return: 'before' }),
      );

      expect(plain?.name).toBe('a');
      expect(nested?.name).toBe('a');
      expect(nested?.age).toBe(10);
      expect(shape(nested)).toEqual({ name: 'a', age: 10, tags: 1 });
    });

    test('returns the relation state before a connect applied by the same call', async () => {
      const { a, tag2 } = await seed();
      const before = await client.db.User.updateUnique({
        where: { id: a.id },
        data: { tags: { connect: [tag2.id] } },
        return: 'before',
      });
      const after = must(await client.db.User.findOne({ where: { id: a.id } }), 'user');

      expect(before?.tagIds).toHaveLength(1);
      expect(after.tagIds).toHaveLength(2);
    });

    test('returns the relation state before a disconnect applied by the same call', async () => {
      const { a, tag1 } = await seed();
      const before = await client.db.User.updateUnique({
        where: { id: a.id },
        data: { tags: { disconnect: [tag1.id] } },
        return: 'before',
      });
      const after = must(await client.db.User.findOne({ where: { id: a.id } }), 'user');

      expect(before?.tagIds).toHaveLength(1);
      expect(after.tagIds).toHaveLength(0);
    });

    test('still writes the update and the link', async () => {
      const { a, tag2 } = await seed();
      await client.db.User.updateUnique({
        where: { id: a.id },
        data: { name: 'NEW', tags: { connect: [tag2.id] } },
        return: 'before',
      });
      const after = must(await client.db.User.findOne({ where: { id: a.id } }), 'user');

      expect(after.name).toBe('NEW');
      expect(after.tagIds).toHaveLength(2);
    });

    test('a non-matching guard key returns null and writes nothing, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id, name: 'WRONG' },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          return: 'before',
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id, name: 'WRONG' }, data: { name: 'NEW' }, return: 'before' }),
      );

      expect(plain).toBeNull();
      expect(nested).toBeNull();
      expect(must(await client.db.User.findOne({ where: { email: 'a@x.io' } }), 'user').name).toBe('a');
    });
  });

  describe('after, null and default', () => {
    for (const [label, mode] of [
      ['default', undefined],
      ['after', 'after'],
      ['null', null],
    ] as const) {
      test(`${label} returns the updated row, as the plain call does`, async () => {
        const nested = await run(({ a, tag2 }) =>
          client.db.User.updateUnique({
            where: { id: a.id },
            data: { name: 'NEW', tags: { connect: [tag2.id] } },
            return: mode,
          }),
        );
        const plain = await run(({ a }) =>
          client.db.User.updateUnique({ where: { id: a.id }, data: { name: 'NEW' }, return: mode }),
        );

        expect(plain?.name).toBe('NEW');
        expect(nested?.name).toBe('NEW');
        expect(shape(nested)?.tags).toBe(2);
        expect(shape(plain)?.age).toBe(shape(nested)?.age);
      });

      test(`${label} returns null for a non-matching guard key, as the plain call does`, async () => {
        const nested = await run(({ a, tag2 }) =>
          client.db.User.updateUnique({
            where: { id: a.id, name: 'WRONG' },
            data: { name: 'NEW', tags: { connect: [tag2.id] } },
            return: mode,
          }),
        );
        const plain = await run(({ a }) =>
          client.db.User.updateUnique({ where: { id: a.id, name: 'WRONG' }, data: { name: 'NEW' }, return: mode }),
        );

        expect(plain).toBeNull();
        expect(nested).toBeNull();
      });
    }
  });

  describe('true', () => {
    test('returns true when the row matched, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          return: true,
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id }, data: { name: 'NEW' }, return: true }),
      );

      expect(plain).toBe(true);
      expect(nested).toBe(true);
    });

    test('returns false when nothing matched, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id, name: 'WRONG' },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          return: true,
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id, name: 'WRONG' }, data: { name: 'NEW' }, return: true }),
      );

      expect(plain).toBe(false);
      expect(nested).toBe(false);
    });
  });
});
