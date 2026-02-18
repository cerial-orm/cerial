/**
 * E2E Tests: One-to-Many Required - Create Operations
 *
 * Schema: one-to-many-required.cerial
 * - Author: id, name, email, posts (Relation[] @model)
 * - PostRequired: id, title, content?, authorId (Record), author (Relation @field)
 *
 * Tests creating parent with children array via nested operations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../../test-helper';

describe('E2E One-to-Many Required: Create', () => {
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

  describe('create parent with nested children', () => {
    test('should create author with nested posts create', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [
              { title: 'Post 1', content: 'Content 1' },
              { title: 'Post 2', content: 'Content 2' },
            ],
          },
        },
      });

      expect(author).toBeDefined();

      // Verify posts were created
      const posts = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });

      expect(posts).toHaveLength(2);
      expect(posts.map((p) => p.title).sort()).toEqual(['Post 1', 'Post 2']);
      posts.forEach((p) => expect(p.authorId.equals(author.id)).toBe(true));
    });

    test('should create author with single nested post', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Single Post Author',
          email: uniqueEmail(),
          posts: {
            create: [{ title: 'Only Post' }],
          },
        },
      });

      const posts = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });

      expect(posts).toHaveLength(1);
      expect(posts[0]?.title).toBe('Only Post');
    });

    test('should create author without posts', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'No Posts Author',
          email: uniqueEmail(),
        },
      });

      expect(author).toBeDefined();

      const posts = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });
      expect(posts).toHaveLength(0);
    });
  });

  describe('create parent with nested connect', () => {
    test('should create author connecting to existing posts', async () => {
      // Create posts first (with temp author)
      const tempAuthor = await client.db.Author.create({
        data: { name: 'Temp', email: uniqueEmail('temp') },
      });

      const post1 = await client.db.PostRequired.create({
        data: {
          title: 'Existing Post 1',
          author: { connect: tempAuthor.id },
        },
      });
      const post2 = await client.db.PostRequired.create({
        data: {
          title: 'Existing Post 2',
          author: { connect: tempAuthor.id },
        },
      });

      // Create new author connecting to posts
      const newAuthor = await client.db.Author.create({
        data: {
          name: 'New Author',
          email: uniqueEmail('new'),
          posts: { connect: [post1.id, post2.id] },
        },
      });

      // Posts should now point to new author
      const updatedPosts = await client.db.PostRequired.findMany({
        where: { authorId: newAuthor.id },
      });

      expect(updatedPosts).toHaveLength(2);
    });
  });
});
