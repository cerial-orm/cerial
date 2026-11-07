/**
 * E2E Tests: a nested create is validated like a top-level create — negative and near-miss cases
 *
 * Schema: test-basics.cerial
 * Model: User { email Email, name String, age Int?, isActive Bool, scores Int[], posts Relation[] }
 *        Post { title String, authorId } — User.posts is the reverse side, Post.author the forward side
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Nested create values — negative cases', () => {
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

  const user = { email: 'a@example.com', name: 'A', isActive: true };
  const counts = async () => ({
    users: (await client.db.User.findMany()).length,
    posts: (await client.db.Post.findMany()).length,
  });

  test('a reverse create refuses a wrong-typed field and writes nothing', () => {
    expect(() => {
      client.db.User.create({
        data: {
          ...user,
          // @ts-expect-error — title expects a string, testing the nested runtime guard
          posts: { create: { title: 1 } },
        },
      });
    }).toThrow(/title must be of type string/);
  });

  test('a reverse create array refuses a bad item', async () => {
    expect(() => {
      client.db.User.create({
        data: {
          ...user,
          // @ts-expect-error — second item has a wrong-typed title
          posts: { create: [{ title: 'ok' }, { title: 2 }] },
        },
      });
    }).toThrow(/title must be of type string/);
    expect(await counts()).toEqual({ users: 0, posts: 0 });
  });

  test('a forward create refuses a date string in an int field', async () => {
    expect(() => {
      client.db.Post.create({
        data: {
          title: 't',
          author: {
            // @ts-expect-error — age expects an int, testing the nested runtime guard
            create: { ...user, age: '2020-01-01' },
          },
        },
      });
    }).toThrow(/age must be of type int/);
    expect(await counts()).toEqual({ users: 0, posts: 0 });
  });

  test.each(['42abc', 1.5])('a forward create refuses age %p', async (age) => {
    expect(() => {
      client.db.Post.create({
        data: {
          title: 't',
          // @ts-expect-error — age expects an int, testing the nested runtime guard
          author: { create: { ...user, age } },
        },
      });
    }).toThrow(/age must be of type int/);
    expect(await counts()).toEqual({ users: 0, posts: 0 });
  });

  test('a forward create refuses a fraction inside an Int[] and names the index', () => {
    expect(() => {
      client.db.Post.create({
        data: {
          title: 't',
          author: { create: { ...user, scores: [1.5, 2] } },
        },
      });
    }).toThrow(/scores\[0\] must be of type int/);
  });

  test('a forward create refuses a number in a string field', () => {
    expect(() => {
      client.db.Post.create({
        data: {
          title: 't',
          // @ts-expect-error — name expects a string, testing the nested runtime guard
          author: { create: { ...user, name: 1 } },
        },
      });
    }).toThrow(/name must be of type string/);
  });

  test('a nested create in an update is refused and the parent is unchanged', async () => {
    const created = await client.db.User.create({ data: user });

    expect(() => {
      client.db.User.updateUnique({
        where: { id: created.id },
        data: {
          name: 'Changed',
          posts: { create: { title: 1 } },
        },
      });
    }).toThrow(/title must be of type string/);

    expect((await client.db.User.findUnique({ where: { id: created.id } }))!.name).toBe('A');
    expect((await counts()).posts).toBe(0);
  });

  test('a nested create in an upsert create branch is refused', async () => {
    expect(() => {
      client.db.User.upsert({
        where: { email: 'a@example.com' },
        create: {
          ...user,
          // @ts-expect-error — title expects a string, testing the nested runtime guard
          posts: { create: { title: 1 } },
        },
        update: {},
      });
    }).toThrow(/title must be of type string/);
    expect(await counts()).toEqual({ users: 0, posts: 0 });
  });

  test('a nested create in a manual transaction is refused', async () => {
    await using txn = await client.$transaction();

    expect(() => {
      client.db.User.create({
        data: {
          ...user,
          // @ts-expect-error — title expects a string, testing the nested runtime guard
          posts: { create: { title: 1 } },
        },
        txn,
      });
    }).toThrow(/title must be of type string/);
    await txn.cancel();
    expect(await counts()).toEqual({ users: 0, posts: 0 });
  });

  describe('near misses still write', () => {
    test('a valid reverse create array', async () => {
      const created = await client.db.User.create({
        data: { ...user, posts: { create: [{ title: 'one' }, { title: 'two' }] } },
      });

      expect(created).not.toBeNull();
      expect((await counts()).posts).toBe(2);
    });

    test('a valid forward create with valid ints and strings', async () => {
      await client.db.Post.create({
        data: { title: 't', author: { create: { ...user, age: 30, scores: [1, 2], nicknames: ['x'] } } },
      });

      const users = await client.db.User.findMany();
      expect(users).toHaveLength(1);
      expect(users[0]!.age).toBe(30);
      expect(users[0]!.scores).toEqual([1, 2]);
    });
  });
});
