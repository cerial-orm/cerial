/**
 * E2E Tests: One-to-Many Required - Where/Filter Operations
 *
 * Schema: one-to-many-required.cerial
 * Tests filtering by child properties.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../../test-helper';

describe('E2E One-to-Many Required: Where', () => {
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
  });

  describe('filter by related parent', () => {
    test('should filter posts by author name', async () => {
      const author1 = await client.db.Author.create({
        data: {
          name: 'John Doe',
          email: uniqueEmail('john'),
          posts: { create: [{ title: 'John Post' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Jane Doe',
          email: uniqueEmail('jane'),
          posts: { create: [{ title: 'Jane Post' }] },
        },
      });

      const posts = await client.db.PostRequired.findMany({
        where: {
          author: { name: 'John Doe' },
        },
      });

      expect(posts).toHaveLength(1);
      expect(posts[0]?.title).toBe('John Post');
    });

    test('should filter posts by author name pattern', async () => {
      await client.db.Author.create({
        data: {
          name: 'John Smith',
          email: uniqueEmail('johns'),
          posts: { create: [{ title: 'Smith Post' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'John Doe',
          email: uniqueEmail('johnd'),
          posts: { create: [{ title: 'Doe Post' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Jane Doe',
          email: uniqueEmail('jane'),
          posts: { create: [{ title: 'Jane Post' }] },
        },
      });

      // Find posts where author name starts with John
      const posts = await client.db.PostRequired.findMany({
        where: {
          author: { name: { startsWith: 'John' } },
        },
      });

      expect(posts).toHaveLength(2);
    });
  });

  describe('filter by direct FK', () => {
    test('should filter posts by authorId', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: { create: [{ title: 'Post 1' }, { title: 'Post 2' }] },
        },
      });

      const posts = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });

      expect(posts).toHaveLength(2);
    });
  });

  describe('filter parent by children (some/every/none)', () => {
    test('should find authors who have some post with specific title', async () => {
      await client.db.Author.create({
        data: {
          name: 'Has Matching',
          email: uniqueEmail('match'),
          posts: { create: [{ title: 'Special Post' }, { title: 'Other' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'No Match',
          email: uniqueEmail('nomatch'),
          posts: { create: [{ title: 'Regular' }] },
        },
      });

      const authors = await client.db.Author.findMany({
        where: {
          posts: {
            some: { title: { contains: 'Special' } },
          },
        },
      });

      expect(authors).toHaveLength(1);
      expect(authors[0]?.name).toBe('Has Matching');
    });

    test('should find authors where every post matches', async () => {
      await client.db.Author.create({
        data: {
          name: 'All Match',
          email: uniqueEmail('all'),
          posts: {
            create: [{ title: 'Draft: Post 1' }, { title: 'Draft: Post 2' }],
          },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Partial Match',
          email: uniqueEmail('partial'),
          posts: { create: [{ title: 'Draft: Post' }, { title: 'Published' }] },
        },
      });

      const authors = await client.db.Author.findMany({
        where: {
          posts: {
            every: { title: { startsWith: 'Draft:' } },
          },
        },
      });

      expect(authors).toHaveLength(1);
      expect(authors[0]?.name).toBe('All Match');
    });

    test('should find authors with no posts matching', async () => {
      await client.db.Author.create({
        data: {
          name: 'No Draft',
          email: uniqueEmail('nodraft'),
          posts: { create: [{ title: 'Published 1' }, { title: 'Published 2' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Has Draft',
          email: uniqueEmail('hasdraft'),
          posts: { create: [{ title: 'Draft: Work' }] },
        },
      });

      const authors = await client.db.Author.findMany({
        where: {
          posts: {
            none: { title: { startsWith: 'Draft:' } },
          },
        },
      });

      expect(authors).toHaveLength(1);
      expect(authors[0]?.name).toBe('No Draft');
    });
  });

  describe('combine filters', () => {
    test('should combine author and post filters', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Target Author',
          email: uniqueEmail(),
          posts: {
            create: [
              { title: 'Match', content: 'Has content' },
              { title: 'No Match', content: null }, // explicit null stored
            ],
          },
        },
      });

      const posts = await client.db.PostRequired.findMany({
        where: {
          authorId: author.id,
          content: { not: null },
        },
      });

      expect(posts).toHaveLength(1);
      expect(posts[0]?.title).toBe('Match');
    });
  });
});
