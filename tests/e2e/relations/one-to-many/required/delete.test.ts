/**
 * E2E Tests: One-to-Many Required - Delete Operations
 *
 * Schema: one-to-many-required.cerial
 * Tests cascade delete all children when parent deleted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../../test-helper';

describe('E2E One-to-Many Required: Delete', () => {
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

  describe('cascade delete', () => {
    test('should cascade delete all posts when author deleted', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [
              { title: 'Post 1' },
              { title: 'Post 2' },
              { title: 'Post 3' },
            ],
          },
        },
      });

      // Verify posts exist
      const postsBefore = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });
      expect(postsBefore).toHaveLength(3);

      // Delete author
      await client.db.Author.deleteMany({
        where: { id: author.id },
      });

      // Author gone
      expect(
        await client.db.Author.findOne({ where: { id: author.id } })
      ).toBeNull();

      // All posts gone (cascaded)
      const postsAfter = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });
      expect(postsAfter).toHaveLength(0);
    });

    test('should cascade delete only related posts', async () => {
      const author1 = await client.db.Author.create({
        data: {
          name: 'Author 1',
          email: uniqueEmail('a1'),
          posts: { create: [{ title: 'A1 Post' }] },
        },
      });
      const author2 = await client.db.Author.create({
        data: {
          name: 'Author 2',
          email: uniqueEmail('a2'),
          posts: { create: [{ title: 'A2 Post' }] },
        },
      });

      // Delete author1
      await client.db.Author.deleteMany({
        where: { id: author1.id },
      });

      // Author1 posts gone
      expect(
        await client.db.PostRequired.findMany({
          where: { authorId: author1.id },
        })
      ).toHaveLength(0);

      // Author2 posts remain
      expect(
        await client.db.PostRequired.findMany({
          where: { authorId: author2.id },
        })
      ).toHaveLength(1);
    });
  });

  describe('delete child only', () => {
    test('should delete post without affecting author', async () => {
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

      // Delete one post
      await client.db.PostRequired.deleteMany({
        where: { id: posts[0]!.id },
      });

      // Author still exists
      expect(
        await client.db.Author.findOne({ where: { id: author.id } })
      ).toBeDefined();

      // Only one post remains
      expect(
        await client.db.PostRequired.findMany({ where: { authorId: author.id } })
      ).toHaveLength(1);
    });
  });

  describe('delete author with no posts', () => {
    test('should delete author without posts', async () => {
      const author = await client.db.Author.create({
        data: { name: 'No Posts', email: uniqueEmail() },
      });

      await client.db.Author.deleteMany({
        where: { id: author.id },
      });

      expect(
        await client.db.Author.findOne({ where: { id: author.id } })
      ).toBeNull();
    });
  });

  describe('deleteMany cascade', () => {
    test('should cascade delete posts when multiple authors deleted', async () => {
      await client.db.Author.create({
        data: {
          name: 'Delete Me 1',
          email: uniqueEmail('d1'),
          posts: { create: [{ title: 'D1 Post' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Delete Me 2',
          email: uniqueEmail('d2'),
          posts: { create: [{ title: 'D2 Post' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Keep Me',
          email: uniqueEmail('k'),
          posts: { create: [{ title: 'Keep Post' }] },
        },
      });

      // Delete authors matching pattern
      await client.db.Author.deleteMany({
        where: { name: { contains: 'Delete Me' } },
      });

      // Only 'Keep Me' author remains
      const authors = await client.db.Author.findMany({});
      expect(authors).toHaveLength(1);
      expect(authors[0]?.name).toBe('Keep Me');

      // Only 'Keep Post' remains
      const posts = await client.db.PostRequired.findMany({});
      expect(posts).toHaveLength(1);
      expect(posts[0]?.title).toBe('Keep Post');
    });
  });
});
