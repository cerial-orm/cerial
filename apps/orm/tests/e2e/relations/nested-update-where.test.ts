/**
 * E2E Tests for the `where` clause on nested-operation updates
 *
 * A write that carries a nested relation op must match exactly the rows the same write without it
 * matches. Every case runs the nested call and a plain control and asserts they agree.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Nested update where clause', () => {
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
    const a = await client.db.User.create({ data: { email: 'a@x.io', name: 'a', isActive: true, age: 10 } });
    await client.db.User.create({ data: { email: 'b@x.io', name: 'b', isActive: true, age: 20 } });
    await client.db.User.create({ data: { email: 'd@x.io', name: 'd', isActive: false, age: 30 } });
    const tag = await client.db.Tag.create({ data: { name: 't1' } });

    return { a, tag };
  };

  const snapshot = async () =>
    (await client.db.User.findMany({ orderBy: { email: 'asc' } })).map((u) => ({
      name: u.name,
      age: u.age,
      tags: u.tagIds.length,
    }));

  // Runs `write` on a fresh seed and returns what it returned plus the resulting table. Tag links are
  // dropped from the snapshot so the nested and plain runs are comparable on the matched rows alone.
  const run = async <T>(write: (s: Awaited<ReturnType<typeof seed>>) => PromiseLike<T>) => {
    await truncateTables(client, tables.core);
    const s = await seed();
    const returned = await write(s);
    const rows = (await snapshot()).map(({ name, age }) => ({ name, age }));

    return { returned, rows };
  };

  describe('updateUnique', () => {
    test('a non-matching guard key beside the id writes nothing, as without the nested op', async () => {
      const nested = await run(({ a, tag }) =>
        client.db.User.updateUnique({
          where: { id: a.id, name: 'WRONG' },
          data: { age: 77, tags: { connect: [tag.id] } },
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id, name: 'WRONG' }, data: { age: 77 } }),
      );

      expect(plain.returned).toBeNull();
      expect(nested.returned).toBeNull();
      expect(nested.rows).toEqual(plain.rows);
      expect(nested.rows.find((r) => r.name === 'a')?.age).toBe(10);
    });

    test('a non-matching guard key links no tag', async () => {
      const { a, tag } = await seed();
      await client.db.User.updateUnique({
        where: { id: a.id, name: 'WRONG' },
        data: { age: 77, tags: { connect: [tag.id] } },
      });

      const tagAfter = await client.db.Tag.findOne({ where: { id: tag.id } });
      expect(tagAfter?.userIds).toHaveLength(0);
      expect((await snapshot()).every((u) => u.tags === 0)).toBe(true);
    });

    test('a matching guard key still updates and links', async () => {
      const { a, tag } = await seed();
      const r = await client.db.User.updateUnique({
        where: { id: a.id, name: 'a' },
        data: { age: 77, tags: { connect: [tag.id] } },
      });

      expect(r?.age).toBe(77);
      expect(r?.tagIds).toHaveLength(1);
      const tagAfter = await client.db.Tag.findOne({ where: { id: tag.id } });
      expect(tagAfter?.userIds).toHaveLength(1);
    });

    test('a string id still resolves', async () => {
      const { a, tag } = await seed();
      const r = await client.db.User.updateUnique({
        where: { id: String(a.id) },
        data: { age: 55, tags: { connect: [tag.id] } },
      });

      expect(r?.age).toBe(55);
    });
  });

  describe('updateMany', () => {
    test('a multi-key where updates only the matching row, as without the nested op', async () => {
      const nested = await run(({ tag }) =>
        client.db.User.updateMany({
          where: { isActive: true, name: 'a' },
          data: { age: 99, tags: { connect: [tag.id] } },
        }),
      );
      const plain = await run(() =>
        client.db.User.updateMany({ where: { isActive: true, name: 'a' }, data: { age: 99 } }),
      );

      expect(nested.returned.map((u) => u.name)).toEqual(['a']);
      expect(plain.returned.map((u) => u.name)).toEqual(['a']);
      expect(nested.rows).toEqual(plain.rows);
      expect(nested.rows.filter((r) => r.age === 99)).toHaveLength(1);
    });

    test('only the matched row is linked to the tag', async () => {
      const { tag } = await seed();
      await client.db.User.updateMany({
        where: { isActive: true, name: 'a' },
        data: { tags: { connect: [tag.id] } },
      });

      const linked = (await snapshot()).filter((u) => u.tags === 1);
      expect(linked.map((u) => u.name)).toEqual(['a']);
    });

    const wheres: Array<[string, Record<string, unknown>, string[]]> = [
      ['AND', { AND: [{ name: 'a' }, { isActive: true }] }, ['a']],
      ['OR', { OR: [{ name: 'a' }, { name: 'b' }] }, ['a', 'b']],
      ['NOT', { NOT: { name: 'a' } }, ['b', 'd']],
      ['a filter object (gt)', { age: { gt: 15 } }, ['b', 'd']],
      ['a filter object (in)', { name: { in: ['a', 'b'] } }, ['a', 'b']],
      ['a filter object after another key', { isActive: true, age: { gt: 15 } }, ['b']],
    ];

    for (const [label, where, expected] of wheres) {
      test(`${label} matches the same rows with and without the nested op`, async () => {
        const nested = await run(({ tag }) =>
          client.db.User.updateMany({ where, data: { age: 99, tags: { connect: [tag.id] } } }),
        );
        const plain = await run(() => client.db.User.updateMany({ where, data: { age: 99 } }));

        expect(plain.returned.map((u) => u.name).sort()).toEqual(expected);
        expect(nested.returned.map((u) => u.name).sort()).toEqual(expected);
        expect(nested.rows).toEqual(plain.rows);
      });
    }

    test('a where that matches nothing writes nothing', async () => {
      const nested = await run(({ tag }) =>
        client.db.User.updateMany({
          where: { name: 'nobody' },
          data: { age: 99, tags: { connect: [tag.id] } },
        }),
      );
      const plain = await run(() => client.db.User.updateMany({ where: { name: 'nobody' }, data: { age: 99 } }));

      expect(nested.returned).toEqual([]);
      expect(nested.rows).toEqual(plain.rows);
    });

    test('an empty where still throws a validation error', async () => {
      const { tag } = await seed();

      await expect(
        (async () => {
          await client.db.User.updateMany({ where: {}, data: { age: 1, tags: { connect: [tag.id] } } });
        })(),
      ).rejects.toThrow();
    });
  });

  describe('reverse create', () => {
    test('creates the child under the matched parent only', async () => {
      await seed();
      await client.db.User.updateMany({
        where: { isActive: true, name: 'a' },
        data: { posts: { create: [{ title: 'p1' }] } },
      });

      const posts = await client.db.Post.findMany({ include: { author: true } });
      expect(posts).toHaveLength(1);
      expect(posts[0]?.author?.name).toBe('a');
    });

    test('creates nothing when the where matches nothing', async () => {
      await seed();
      await client.db.User.updateMany({
        where: { name: 'nobody' },
        data: { posts: { create: [{ title: 'p1' }] } },
      });

      expect(await client.db.Post.findMany()).toHaveLength(0);
    });
  });

  describe('upsert existence check', () => {
    test('a multi-key where is checked as a whole before choosing update or create', async () => {
      const { a, tag } = await seed();
      // email matches an existing row but name does not, so the whole where matches nothing and the
      // create branch runs; the first-key-only check would have taken the update branch
      await client.db.User.upsert({
        where: { email: 'a@x.io', name: 'WRONG' },
        create: { email: 'new@x.io', name: 'new', isActive: true, tags: { connect: [tag.id] } },
        update: { age: 77, tags: { connect: [tag.id] } },
      });

      const aAfter = await client.db.User.findOne({ where: { id: a.id } });
      expect(aAfter?.age).toBe(10);
      expect(await client.db.User.findOne({ where: { email: 'new@x.io' } })).not.toBeNull();
    });
  });
});
