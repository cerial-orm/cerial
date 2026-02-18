/**
 * E2E Tests: One-to-Many Required - Create from Child Side
 *
 * Schema: one-to-many-required.cerial
 * Tests creating child with parent via connect/create.
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

describe('E2E One-to-Many Required: Create from Child', () => {
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

  describe('create child with nested parent create', () => {
    test('should create post with nested author create', async () => {
      const post = await client.db.PostRequired.create({
        data: {
          title: 'New Post',
          content: 'Content',
          author: {
            create: {
              name: 'New Author',
              email: uniqueEmail(),
            },
          },
        },
      });

      expect(post.authorId).toBeDefined();

      // Verify author was created
      const author = await client.db.Author.findOne({
        where: { id: post.authorId },
      });
      expect(author?.name).toBe('New Author');
    });
  });

  describe('create child with nested parent connect', () => {
    test('should create post connecting to existing author', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Existing Author', email: uniqueEmail() },
      });

      const post = await client.db.PostRequired.create({
        data: {
          title: 'Post',
          author: { connect: author.id },
        },
      });

      expect(post.authorId.equals(author.id)).toBe(true);
    });

    test('should create multiple posts for same author', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Prolific Author', email: uniqueEmail() },
      });

      const post1 = await client.db.PostRequired.create({
        data: { title: 'Post 1', author: { connect: author.id } },
      });
      const post2 = await client.db.PostRequired.create({
        data: { title: 'Post 2', author: { connect: author.id } },
      });
      const post3 = await client.db.PostRequired.create({
        data: { title: 'Post 3', author: { connect: author.id } },
      });

      expect(post1.authorId.equals(author.id)).toBe(true);
      expect(post2.authorId.equals(author.id)).toBe(true);
      expect(post3.authorId.equals(author.id)).toBe(true);

      const posts = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });
      expect(posts).toHaveLength(3);
    });
  });

  describe('required author validation', () => {
    test('should reject post without author', async () => {
      await expect(
        (async () => {
          await client.db.PostRequired.create({
            // @ts-expect-error — testing runtime validation: missing required 'author' field
            data: {
              title: 'Orphan Post',
            },
          });
        })(),
      ).rejects.toThrow();
    });

    test('should reject post with non-existent author', async () => {
      await expect(
        (async () => {
          await client.db.PostRequired.create({
            data: {
              title: 'Bad Author',
              author: { connect: 'author:nonexistent' },
            },
          });
        })(),
      ).rejects.toThrow();
    });
  });

  describe('direct authorId', () => {
    test('should create post with direct authorId', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Author', email: uniqueEmail() },
      });

      const post = await client.db.PostRequired.create({
        data: {
          title: 'Direct ID Post',
          authorId: author.id,
        },
      });

      expect(post.authorId.equals(author.id)).toBe(true);
    });
  });
});
