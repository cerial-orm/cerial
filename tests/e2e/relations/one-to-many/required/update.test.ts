/**
 * E2E Tests: One-to-Many Required - Update Operations
 *
 * Schema: one-to-many-required.cerial
 * Tests adding/removing children from parent.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../../test-helper';

describe('E2E One-to-Many Required: Update', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('add children via connect', () => {
    test('should add existing posts to author via connect', async () => {
      const author1 = await client.db.Author.create({
        data: { name: 'Author 1', email: uniqueEmail('a1') },
      });
      const author2 = await client.db.Author.create({
        data: { name: 'Author 2', email: uniqueEmail('a2') },
      });

      // Create posts for author1
      const post1 = await client.db.PostRequired.create({
        data: { title: 'Post 1', author: { connect: author1.id } },
      });
      const post2 = await client.db.PostRequired.create({
        data: { title: 'Post 2', author: { connect: author1.id } },
      });

      // Transfer posts to author2
      await client.db.Author.updateMany({
        where: { id: author2.id },
        data: {
          posts: { connect: [post1.id, post2.id] },
        },
      });

      // Posts should now belong to author2
      const postsForAuthor2 = await client.db.PostRequired.findMany({
        where: { authorId: author2.id },
      });
      expect(postsForAuthor2).toHaveLength(2);
    });
  });

  describe('add children via create', () => {
    test('should add new posts to author via nested create', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Author', email: uniqueEmail() },
      });

      // Add posts via update
      await client.db.Author.updateMany({
        where: { id: author.id },
        data: {
          posts: {
            create: [{ title: 'New Post 1' }, { title: 'New Post 2' }],
          },
        },
      });

      const posts = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });
      expect(posts).toHaveLength(2);
    });
  });

  describe('reassign child to different parent', () => {
    test('should move post from one author to another', async () => {
      const author1 = await client.db.Author.create({
        data: { name: 'Author 1', email: uniqueEmail('a1') },
      });
      const author2 = await client.db.Author.create({
        data: { name: 'Author 2', email: uniqueEmail('a2') },
      });

      const post = await client.db.PostRequired.create({
        data: { title: 'Moving Post', author: { connect: author1.id } },
      });

      expect(post.authorId.equals(author1.id)).toBe(true);

      // Move to author2
      const updated = await client.db.PostRequired.updateMany({
        where: { id: post.id },
        data: {
          author: { connect: author2.id },
        },
      });

      expect(updated[0]?.authorId?.equals(author2.id)).toBe(true);
    });
  });

  describe('update child fields', () => {
    test('should update post without affecting author relation', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Author', email: uniqueEmail() },
      });

      const post = await client.db.PostRequired.create({
        data: { title: 'Original', author: { connect: author.id } },
      });

      const updated = await client.db.PostRequired.updateMany({
        where: { id: post.id },
        data: { title: 'Updated', content: 'New content' },
      });

      expect(updated[0]?.title).toBe('Updated');
      expect(updated[0]?.content).toBe('New content');
      expect(updated[0]?.authorId?.equals(author.id)).toBe(true);
    });
  });

  describe('update parent fields', () => {
    test('should update author without affecting posts', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Original Name',
          email: uniqueEmail(),
          posts: {
            create: [{ title: 'Post 1' }, { title: 'Post 2' }],
          },
        },
      });

      await client.db.Author.updateMany({
        where: { id: author.id },
        data: { name: 'Updated Name' },
      });

      // Posts should still exist
      const posts = await client.db.PostRequired.findMany({
        where: { authorId: author.id },
      });
      expect(posts).toHaveLength(2);

      const updatedAuthor = await client.db.Author.findOne({
        where: { id: author.id },
      });
      expect(updatedAuthor?.name).toBe('Updated Name');
    });
  });
});
