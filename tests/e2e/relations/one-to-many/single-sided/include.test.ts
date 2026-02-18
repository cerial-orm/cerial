/**
 * E2E Tests: One-to-Many Single-Sided - Include
 *
 * Schema: one-to-many-single-sided.cerial
 * Tests that child can include parent but parent cannot include children.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../test-helper';

describe('E2E One-to-Many Single-Sided: Include', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManySingleSided);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManySingleSided);
  });

  describe('include parent from child', () => {
    test('should include article when querying comment', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      const comment = await client.db.Comment.create({
        data: {
          text: 'Comment',
          article: { connect: article.id },
        },
      });

      const result = await client.db.Comment.findOne({
        where: { id: comment.id },
        include: { article: true },
      });

      expect(result?.article).toBeDefined();
      expect(result?.article?.title).toBe('Article');
    });

    test('should return null article for orphan comment', async () => {
      const comment = await client.db.Comment.create({
        data: { text: 'Orphan' },
      });

      const result = await client.db.Comment.findOne({
        where: { id: comment.id },
        include: { article: true },
      });

      expect(result?.article).toBeNull();
    });

    test('should return null article when article was deleted', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Will Delete' },
      });

      const comment = await client.db.Comment.create({
        data: {
          text: 'Comment',
          article: { connect: article.id },
        },
      });

      // Delete article
      await client.db.Article.deleteMany({
        where: { id: article.id },
      });

      const result = await client.db.Comment.findOne({
        where: { id: comment.id },
        include: { article: true },
      });

      expect(result?.article).toBeNull();
    });
  });

  describe('no include from parent', () => {
    test('article has no comments relation to include', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      // Query article - no comments field available
      const result = await client.db.Article.findOne({
        where: { id: article.id },
        // include: { comments: true }  // Would be type error
      });

      expect(result).toBeDefined();
      expect('comments' in result!).toBe(false);
    });
  });

  describe('include in findMany', () => {
    test('should include articles for multiple comments', async () => {
      const article1 = await client.db.Article.create({
        data: { title: 'Article 1' },
      });
      const article2 = await client.db.Article.create({
        data: { title: 'Article 2' },
      });

      await client.db.Comment.create({
        data: { text: 'C1', article: { connect: article1.id } },
      });
      await client.db.Comment.create({
        data: { text: 'C2', article: { connect: article2.id } },
      });
      await client.db.Comment.create({
        data: { text: 'C3' }, // Orphan
      });

      const comments = await client.db.Comment.findMany({
        include: { article: true },
        orderBy: { text: 'asc' },
      });

      expect(comments).toHaveLength(3);
      expect(comments[0]?.article?.title).toBe('Article 1');
      expect(comments[1]?.article?.title).toBe('Article 2');
      expect(comments[2]?.article).toBeNull();
    });
  });
});
