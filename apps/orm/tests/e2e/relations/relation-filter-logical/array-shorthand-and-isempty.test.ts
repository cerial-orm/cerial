/**
 * E2E Tests: a plain array-relation filter as shorthand for `some`, and `isEmpty` as an existence check
 *
 * Seed: Zed owns posts a and d, Amy owns b and e, Bob owns c, Cat owns none. Each test selects a
 * different subset of authors, and the destructive ones assert the survivors by name, so a clause
 * that was dropped (everyone deleted) or inverted (the complement deleted) fails.
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
import { namesOf, seedAuthorsAndPosts } from './helpers';

const TABLES = tables.oneToManyRequired;

describe('E2E array relation: shorthand for some, and isEmpty', () => {
  let client: CerialClient;

  const survivors = async (): Promise<string[]> => namesOf(await client.db.Author.findMany());

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
    await seedAuthorsAndPosts(client);
  });

  describe('plain filter equals some', () => {
    test('findMany returns the same authors as the explicit form', async () => {
      const plain = await client.db.Author.findMany({ where: { posts: { title: { in: ['a', 'c'] } } } });
      const explicit = await client.db.Author.findMany({ where: { posts: { some: { title: { in: ['a', 'c'] } } } } });

      expect(namesOf(plain)).toEqual(['Bob', 'Zed']);
      expect(namesOf(plain)).toEqual(namesOf(explicit));
    });

    test('a direct value, and two fields on the same child', async () => {
      expect(namesOf(await client.db.Author.findMany({ where: { posts: { title: 'b' } } }))).toEqual(['Amy']);
      // Zed has posts a and d, but no single post satisfies both titles
      expect(await client.db.Author.findMany({ where: { posts: { title: 'a', authorId: 'a-amy' } } })).toEqual([]);
    });

    test('findOne', async () => {
      const found = await client.db.Author.findOne({ where: { posts: { title: 'c' } } });

      expect(found?.name).toBe('Bob');
    });

    test('count and exists', async () => {
      expect(await client.db.Author.count({ posts: { title: { in: ['a', 'b'] } } })).toBe(2);
      expect(await client.db.Author.exists({ posts: { title: 'c' } })).toBe(true);
      expect(await client.db.Author.exists({ posts: { title: 'zzz' } })).toBe(false);
    });

    test('updateMany touches only authors with a matching post', async () => {
      await client.db.Author.updateMany({ where: { posts: { title: 'c' } }, data: { name: 'Renamed' } });

      expect(await survivors()).toEqual(['Amy', 'Cat', 'Renamed', 'Zed']);
    });

    test('deleteMany deletes only authors with a matching post', async () => {
      await client.db.Author.deleteMany({ where: { posts: { title: 'c' } } });

      expect(await survivors()).toEqual(['Amy', 'Cat', 'Zed']);
    });

    test('deleteMany with a filter nothing matches deletes nothing', async () => {
      await client.db.Author.deleteMany({ where: { posts: { title: 'zzz' } } });

      expect(await survivors()).toEqual(['Amy', 'Bob', 'Cat', 'Zed']);
    });

    test('every and none stay explicit and unchanged', async () => {
      expect(namesOf(await client.db.Author.findMany({ where: { posts: { none: { title: 'a' } } } }))).toEqual([
        'Amy',
        'Bob',
        'Cat',
      ]);
      expect(namesOf(await client.db.Author.findMany({ where: { posts: { every: { title: 'c' } } } }))).toEqual([
        'Bob',
      ]);
    });

    test('array $transaction mode', async () => {
      const where = { posts: { title: { in: ['a', 'c'] } } };
      const [rows, count] = await client.$transaction([
        client.db.Author.findMany({ where }),
        client.db.Author.count(where),
      ]);

      expect(namesOf(rows)).toEqual(['Bob', 'Zed']);
      expect(count).toBe(2);
    });
  });

  describe('refusals', () => {
    test('shorthand keys beside a quantifier are refused, and deleteMany deletes nothing', async () => {
      const where = { posts: { title: 'a', none: { title: 'c' } } };

      await expect((async () => client.db.Author.findMany({ where }))()).rejects.toThrow('mixes the field keys');
      await expect((async () => client.db.Author.deleteMany({ where }))()).rejects.toThrow('mixes the field keys');
      expect(await survivors()).toEqual(['Amy', 'Bob', 'Cat', 'Zed']);
    });

    test('a lone some on an unknown target field still throws and deleteMany deletes nothing', async () => {
      const where = { posts: { some: { titel: 'a' } } };

      // @ts-expect-error a typo in a target field is a type error, and the runtime refuses it as well
      await expect((async () => client.db.Author.findMany({ where }))()).rejects.toThrow();
      // @ts-expect-error a typo in a target field is a type error, and the runtime refuses it as well
      await expect((async () => client.db.Author.deleteMany({ where }))()).rejects.toThrow();
      expect(await survivors()).toEqual(['Amy', 'Bob', 'Cat', 'Zed']);
    });

    test('an unknown shorthand key is refused and deletes nothing', async () => {
      const where = { posts: { titel: 'a' } };

      // @ts-expect-error a typo in a target field is a type error, and the runtime refuses it as well
      await expect((async () => client.db.Author.deleteMany({ where }))()).rejects.toThrow();
      expect(await survivors()).toEqual(['Amy', 'Bob', 'Cat', 'Zed']);
    });
  });

  describe('isEmpty', () => {
    test('true matches authors with no posts', async () => {
      expect(namesOf(await client.db.Author.findMany({ where: { posts: { isEmpty: true } } }))).toEqual(['Cat']);
    });

    test('false matches authors with at least one post', async () => {
      expect(namesOf(await client.db.Author.findMany({ where: { posts: { isEmpty: false } } }))).toEqual([
        'Amy',
        'Bob',
        'Zed',
      ]);
    });

    test('findOne, count and exists', async () => {
      expect((await client.db.Author.findOne({ where: { posts: { isEmpty: true } } }))?.name).toBe('Cat');
      expect(await client.db.Author.count({ posts: { isEmpty: false } })).toBe(3);
      expect(await client.db.Author.exists({ posts: { isEmpty: true } })).toBe(true);
    });

    test('exists is false once nobody matches', async () => {
      await client.db.Author.deleteMany({ where: { posts: { isEmpty: true } } });

      expect(await client.db.Author.exists({ posts: { isEmpty: true } })).toBe(false);
    });

    test('updateMany renames only the author with no posts', async () => {
      await client.db.Author.updateMany({ where: { posts: { isEmpty: true } }, data: { name: 'Renamed' } });

      expect(await survivors()).toEqual(['Amy', 'Bob', 'Renamed', 'Zed']);
    });

    test('deleteMany with isEmpty true deletes only the author with no posts', async () => {
      await client.db.Author.deleteMany({ where: { posts: { isEmpty: true } } });

      expect(await survivors()).toEqual(['Amy', 'Bob', 'Zed']);
      expect(await client.db.PostRequired.count()).toBe(5);
    });

    test('deleteMany with isEmpty false deletes every author with posts and leaves the empty one', async () => {
      await client.db.Author.deleteMany({ where: { posts: { isEmpty: false } } });

      expect(await survivors()).toEqual(['Cat']);
    });

    test('isEmpty composes with a quantifier', async () => {
      const authors = await client.db.Author.findMany({
        where: { posts: { isEmpty: false, none: { title: 'a' } } },
      });

      expect(namesOf(authors)).toEqual(['Amy', 'Bob']);
    });

    test('array $transaction mode', async () => {
      const [empty, nonEmpty] = await client.$transaction([
        client.db.Author.count({ posts: { isEmpty: true } }),
        client.db.Author.count({ posts: { isEmpty: false } }),
      ]);

      expect([empty, nonEmpty]).toEqual([1, 3]);
    });
  });
});
