/**
 * E2E Tests: unknown keys in a relation's nested where — negative and positive cases
 *
 * A typo'd key under a relation filter used to be skipped by the nested condition builder, so the
 * filter vanished and findMany returned more rows than asked for. The destructive cases assert the
 * rows that survived.
 *
 * Schema: one-to-many (Author, PostRequired)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// A typo'd key is what a JavaScript caller can send; the generated types reject it
const hostile = (value: unknown): never => value as never;

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Unknown relation where keys — negative and positive cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyRequired);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManyRequired);
    const ada = await client.db.Author.create({ data: { name: 'Ada', email: 'ada@x.co' } });
    const bob = await client.db.Author.create({ data: { name: 'Bob', email: 'bob@x.co' } });
    await client.db.PostRequired.create({ data: { title: 'A1', authorId: ada.id } });
    await client.db.PostRequired.create({ data: { title: 'A2', authorId: ada.id } });
    await client.db.PostRequired.create({ data: { title: 'B1', authorId: bob.id } });
  });

  const forward = "Invalid where clause: Unknown field 'author.nmae' on model Author";
  const reverse = (q: string) => `Invalid where clause: Unknown field 'posts.${q}.titel' on model PostRequired`;

  test('findMany rejects an unknown key on a forward relation, naming the target model', async () => {
    await rejects(() => client.db.PostRequired.findMany({ where: hostile({ author: { nmae: 'Ada' } }) }), forward);
  });

  test('findMany rejects an unknown key inside some, every and none on an array relation', async () => {
    for (const q of ['some', 'every', 'none'])
      await rejects(
        () => client.db.Author.findMany({ where: hostile({ posts: { [q]: { titel: 'A1' } } }) }),
        reverse(q),
      );
  });

  test('findMany rejects an array relation key that is not some, every or none', async () => {
    await rejects(
      () => client.db.Author.findMany({ where: hostile({ posts: { title: 'A1' } }) }),
      "Unknown key 'title' in the filter on relation 'posts' of model Author",
    );
  });

  test('count, findFirst and exists reject it too', async () => {
    await rejects(() => client.db.PostRequired.count(hostile({ author: { nmae: 'Ada' } })), forward);
    await rejects(() => client.db.PostRequired.findOne({ where: hostile({ author: { nmae: 'Ada' } }) }), forward);
    await rejects(() => client.db.PostRequired.exists(hostile({ author: { nmae: 'Ada' } })), forward);
  });

  test('deleteMany throws and deletes nothing', async () => {
    await rejects(() => client.db.PostRequired.deleteMany({ where: hostile({ author: { nmae: 'Ada' } }) }), forward);
    expect(await client.db.PostRequired.count()).toBe(3);
  });

  test('updateMany throws and updates nothing', async () => {
    await rejects(
      () => client.db.PostRequired.updateMany({ where: hostile({ author: { nmae: 'Ada' } }), data: { title: 'X' } }),
      forward,
    );
    expect(await client.db.PostRequired.count({ title: 'X' })).toBe(0);
  });

  test('a typo beside a valid key still throws', async () => {
    await rejects(
      () => client.db.PostRequired.findMany({ where: hostile({ author: { name: 'Ada', nmae: 'x' } }) }),
      forward,
    );
  });

  test('a typo inside a relation filter under AND or NOT throws', async () => {
    await rejects(
      () => client.db.PostRequired.findMany({ where: hostile({ AND: [{ author: { nmae: 'Ada' } }] }) }),
      forward,
    );
    await rejects(
      () => client.db.PostRequired.findMany({ where: hostile({ NOT: { author: { nmae: 'Ada' } } }) }),
      forward,
    );
  });

  describe('valid relation filters keep working', () => {
    test('forward relation filters the rows', async () => {
      const posts = await client.db.PostRequired.findMany({
        where: { author: { name: 'Ada' } },
        orderBy: { title: 'asc' },
      });
      expect(posts.map((p) => p.title)).toEqual(['A1', 'A2']);
    });

    test('some, every and none filter the rows', async () => {
      const some = await client.db.Author.findMany({ where: { posts: { some: { title: 'A1' } } } });
      expect(some.map((a) => a.name)).toEqual(['Ada']);

      const none = await client.db.Author.findMany({ where: { posts: { none: { title: 'A1' } } } });
      expect(none.map((a) => a.name)).toEqual(['Bob']);

      const every = await client.db.Author.findMany({ where: { posts: { every: { title: { startsWith: 'B' } } } } });
      expect(every.map((a) => a.name)).toEqual(['Bob']);
    });

    test('operators inside a relation filter keep working', async () => {
      const posts = await client.db.PostRequired.findMany({ where: { author: { name: { in: ['Bob'] } } } });
      expect(posts.map((p) => p.title)).toEqual(['B1']);
    });
  });
});
