/**
 * E2E Tests: logical operators on the reverse-relation path (Author.posts)
 *
 * A bare AND, OR or NOT directly under a reverse relation is refused: the quantifier (some, every,
 * none) says what is being quantified, so the operator belongs inside its body. Inside the body the
 * operators compose sibling conditions on the same related row.
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

describe('E2E relation filter logical operators: reverse path', () => {
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
    await seedAuthorsAndPosts(client);
  });

  describe('inside a quantifier body', () => {
    test('some + OR', async () => {
      const authors = await client.db.Author.findMany({
        where: { posts: { some: { OR: [{ title: 'a' }, { title: 'c' }] } } },
      });

      expect(namesOf(authors)).toEqual(['Bob', 'Zed']);
    });

    test('none + OR includes the author with no posts', async () => {
      const authors = await client.db.Author.findMany({
        where: { posts: { none: { OR: [{ title: 'a' }, { title: 'b' }] } } },
      });

      expect(namesOf(authors)).toEqual(['Bob', 'Cat']);
    });

    test('every + OR requires at least one post', async () => {
      const authors = await client.db.Author.findMany({
        where: { posts: { every: { OR: [{ title: 'a' }, { title: 'd' }] } } },
      });

      expect(namesOf(authors)).toEqual(['Zed']);
    });

    test('some + AND on one row that cannot satisfy both matches no author', async () => {
      const authors = await client.db.Author.findMany({
        where: { posts: { some: { AND: [{ title: 'a' }, { title: 'd' }] } } },
      });

      expect(authors).toEqual([]);
    });

    test('some + AND on one row that can satisfy both', async () => {
      const authors = await client.db.Author.findMany({
        where: { posts: { some: { AND: [{ title: { in: ['a', 'b'] } }, { title: { in: ['b', 'c'] } }] } } },
      });

      expect(namesOf(authors)).toEqual(['Amy']);
    });

    test('some + NOT', async () => {
      const authors = await client.db.Author.findMany({
        where: { posts: { some: { NOT: { title: 'a' } } } },
      });

      expect(namesOf(authors)).toEqual(['Amy', 'Bob', 'Zed']);
    });

    test('count and exists agree with findMany', async () => {
      const where = { posts: { some: { OR: [{ title: 'a' }, { title: 'c' }] } } };

      expect(await client.db.Author.count(where)).toBe(2);
      expect(await client.db.Author.exists(where)).toBe(true);
    });
  });

  describe('a bare operator directly under the relation', () => {
    test.each(['AND', 'OR', 'NOT'] as const)('%s is refused, not skipped', async (op) => {
      const value = op === 'NOT' ? { title: 'a' } : [{ title: 'a' }];

      await expect(
        (async () => {
          await client.db.Author.findMany({
            where: { posts: { [op]: value } },
          });
        })(),
      ).rejects.toThrow(/Unknown key/);
    });

    test('the refusal applies to count and deleteMany too, and deletes nothing', async () => {
      const where = { posts: { OR: [{ title: 'a' }] } };

      // @ts-expect-error the reverse relation filter accepts only some, every and none
      await expect((async () => client.db.Author.count(where))()).rejects.toThrow();
      // @ts-expect-error the reverse relation filter accepts only some, every and none
      await expect((async () => client.db.Author.deleteMany({ where }))()).rejects.toThrow();
      expect(await client.db.Author.count()).toBe(4);
    });
  });
});
