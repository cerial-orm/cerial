/**
 * E2E Tests for `include` on `create` and `updateMany`
 *
 * Both writes project their result through the same field list `findMany` uses, so an included
 * relation arrives as the related rows. Each positive case has a negative twin: an include the model
 * cannot honour is rejected before the write runs and leaves no row behind.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const names = (rows: Array<{ name: string }> | undefined) => (rows ? rows.map((r) => r.name).sort() : rows);

describe('E2E include on create and updateMany', () => {
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

  const seedTags = async () => {
    const t1 = await client.db.Tag.create({ data: { name: 't1' } });
    const t2 = await client.db.Tag.create({ data: { name: 't2' } });

    return { t1, t2 };
  };

  describe('create include', () => {
    test('returns an array relation as the related rows', async () => {
      const { t1, t2 } = await seedTags();
      const user = await client.db.User.create({
        data: { email: 'a@x.io', name: 'a', isActive: true, tagIds: [t1.id, t2.id] },
        include: { tags: true },
      });

      expect(names(user.tags)).toEqual(['t1', 't2']);
      expect(user.name).toBe('a');
    });

    test('returns a forward relation as the related row', async () => {
      const author = await client.db.User.create({ data: { email: 'a@x.io', name: 'a', isActive: true } });
      const post = await client.db.Post.create({
        data: { title: 'p', authorId: author.id },
        include: { author: true },
      });

      expect(post.author.email).toBe('a@x.io');
      expect(post.author.id.equals(author.id)).toBe(true);
    });

    test('returns an empty reverse relation as an empty array', async () => {
      const user = await client.db.User.create({
        data: { email: 'a@x.io', name: 'a', isActive: true },
        include: { posts: true },
      });

      expect(user.posts).toEqual([]);
    });

    test('honours the include options', async () => {
      const { t1, t2 } = await seedTags();
      const user = await client.db.User.create({
        data: { email: 'a@x.io', name: 'a', isActive: true, tagIds: [t1.id, t2.id] },
        include: { tags: { orderBy: { name: 'desc' }, limit: 1 } },
      });

      expect(names(user.tags)).toEqual(['t2']);
    });

    test('combines with select, which limits the base fields only', async () => {
      const { t1 } = await seedTags();
      const user = await client.db.User.create({
        data: { email: 'a@x.io', name: 'a', isActive: true, tagIds: [t1.id] },
        select: { name: true },
        include: { tags: true },
      });

      expect(Object.keys(user).sort()).toEqual(['name', 'tags']);
      expect(names(user.tags)).toEqual(['t1']);
    });

    test('without include the relation is absent', async () => {
      const { t1 } = await seedTags();
      const user = await client.db.User.create({
        data: { email: 'a@x.io', name: 'a', isActive: true, tagIds: [t1.id] },
      });

      expect('tags' in user).toBe(false);
    });

    test('works on a create that carries a nested relation op', async () => {
      const { t1 } = await seedTags();
      const user = await client.db.User.create({
        data: { email: 'a@x.io', name: 'a', isActive: true, tags: { connect: [t1.id] } },
        include: { tags: true, posts: true },
      });

      expect(names(user.tags)).toEqual(['t1']);
      expect(user.posts).toEqual([]);
    });

    test('works inside a transaction', async () => {
      const { t1 } = await seedTags();
      const [user] = await client.$transaction([
        client.db.User.create({
          data: { email: 'a@x.io', name: 'a', isActive: true, tagIds: [t1.id] },
          include: { tags: true },
        }),
      ]);

      expect(names(user.tags)).toEqual(['t1']);
    });

    test('rejects an unknown relation name and writes nothing', async () => {
      const attempt = async () => {
        await client.db.User.create({
          data: { email: 'a@x.io', name: 'a', isActive: true },
          // @ts-expect-error negative test: 'nope' is not a relation on User
          include: { nope: true },
        });
      };

      await expect(attempt()).rejects.toThrow(/Unknown field 'nope'/);
      expect(await client.db.User.count()).toBe(0);
    });

    test('rejects a scalar field named in include and writes nothing', async () => {
      const attempt = async () => {
        await client.db.User.create({
          data: { email: 'a@x.io', name: 'a', isActive: true },
          // @ts-expect-error negative test: 'name' is a scalar, not a relation
          include: { name: true },
        });
      };

      await expect(attempt()).rejects.toThrow();
      expect(await client.db.User.count()).toBe(0);
    });

    test('rejects an unknown include on the nested path and writes nothing', async () => {
      const { t1 } = await seedTags();
      const attempt = async () => {
        await client.db.User.create({
          data: { email: 'a@x.io', name: 'a', isActive: true, tags: { connect: [t1.id] } },
          // @ts-expect-error negative test: 'nope' is not a relation on User
          include: { nope: true },
        });
      };

      await expect(attempt()).rejects.toThrow(/Unknown field 'nope'/);
      expect(await client.db.User.count()).toBe(0);
    });
  });

  describe('updateMany include', () => {
    const seedUsers = async () => {
      const { t1, t2 } = await seedTags();
      const a = await client.db.User.create({
        data: { email: 'a@x.io', name: 'a', isActive: true, tagIds: [t1.id] },
      });
      const b = await client.db.User.create({
        data: { email: 'b@x.io', name: 'b', isActive: true, tagIds: [t1.id, t2.id] },
      });

      return { t1, t2, a, b };
    };

    test('returns the relation on every updated row', async () => {
      await seedUsers();
      const rows = await client.db.User.updateMany({
        where: { isActive: true },
        data: { age: 5 },
        include: { tags: true },
      });

      expect(rows).toHaveLength(2);
      const byName = Object.fromEntries(rows.map((r) => [r.name, names(r.tags)]));
      expect(byName).toEqual({ a: ['t1'], b: ['t1', 't2'] });
      expect(rows.every((r) => r.age === 5)).toBe(true);
    });

    test('returns the relation as written by the same call', async () => {
      const { a, t2 } = await seedUsers();
      const rows = await client.db.User.updateMany({
        where: { id: a.id },
        data: { tagIds: [t2.id] },
        include: { tags: true },
      });

      expect(names(rows[0]?.tags)).toEqual(['t2']);
    });

    test('combines with select and with the include options', async () => {
      await seedUsers();
      const rows = await client.db.User.updateMany({
        where: { name: 'b' },
        data: { age: 7 },
        select: { name: true },
        include: { tags: { orderBy: { name: 'asc' }, limit: 1 } },
      });

      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['name', 'tags']);
      expect(names(rows[0]?.tags)).toEqual(['t1']);
    });

    test('returns an empty array when nothing matches', async () => {
      await seedUsers();
      const rows = await client.db.User.updateMany({
        where: { name: 'nobody' },
        data: { age: 1 },
        include: { tags: true },
      });

      expect(rows).toEqual([]);
    });

    test('without include the relation is absent', async () => {
      await seedUsers();
      const rows = await client.db.User.updateMany({ where: { name: 'a' }, data: { age: 1 } });

      expect('tags' in (rows[0] ?? {})).toBe(false);
    });

    test('works on an update that carries a nested relation op', async () => {
      const { a, t2 } = await seedUsers();
      const rows = await client.db.User.updateMany({
        where: { id: a.id },
        data: { age: 9, tags: { connect: [t2.id] } },
        include: { tags: true },
      });

      expect(names(rows[0]?.tags)).toEqual(['t1', 't2']);
      expect(rows[0]?.age).toBe(9);
    });

    test('works inside a transaction', async () => {
      await seedUsers();
      const [rows] = await client.$transaction([
        client.db.User.updateMany({ where: { name: 'a' }, data: { age: 3 }, include: { tags: true } }),
      ]);

      expect(names(rows[0]?.tags)).toEqual(['t1']);
    });

    test('rejects an unknown relation name and leaves the rows untouched', async () => {
      await seedUsers();
      const attempt = async () => {
        await client.db.User.updateMany({
          where: { isActive: true },
          data: { age: 99 },
          // @ts-expect-error negative test: 'nope' is not a relation on User
          include: { nope: true },
        });
      };

      await expect(attempt()).rejects.toThrow(/Unknown field 'nope'/);
      expect(await client.db.User.count({ age: 99 })).toBe(0);
    });

    test('rejects an unknown include on the nested path and leaves the rows untouched', async () => {
      const { a, t2 } = await seedUsers();
      const attempt = async () => {
        await client.db.User.updateMany({
          where: { id: a.id },
          data: { age: 99, tags: { connect: [t2.id] } },
          // @ts-expect-error negative test: 'nope' is not a relation on User
          include: { nope: true },
        });
      };

      await expect(attempt()).rejects.toThrow(/Unknown field 'nope'/);
      expect(await client.db.User.count({ age: 99 })).toBe(0);
    });
  });
});
