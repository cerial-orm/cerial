/**
 * E2E Tests: One-to-Many Single-Sided - Child Only
 *
 * Schema: one-to-many-single-sided.cerial
 * - Article: id, title (NO comments Relation - single-sided)
 * - Comment: id, text, articleId (Record?), article (Relation? @field)
 *
 * Tests single-sided where only child defines the relation.
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

describe('E2E One-to-Many Single-Sided: Child Only', () => {
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

  describe('create comment with article', () => {
    test('should create comment with nested article create', async () => {
      const comment = await client.db.Comment.create({
        data: {
          text: 'Great article!',
          article: {
            create: { title: 'New Article' },
          },
        },
      });

      expect(comment.articleId).toBeDefined();

      // Verify article exists
      const article = await client.db.Article.findOne({
        where: { id: comment.articleId! },
      });
      expect(article?.title).toBe('New Article');
    });

    test('should create comment connecting to existing article', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Existing Article' },
      });

      const comment = await client.db.Comment.create({
        data: {
          text: 'Comment',
          article: { connect: article.id },
        },
      });

      expect(comment.articleId?.equals(article.id)).toBe(true);
    });

    test('should create comment without article', async () => {
      const comment = await client.db.Comment.create({
        data: { text: 'Orphan comment' },
      });

      expect(comment.articleId).toBeNull();
    });
  });

  describe('create article (no comments access)', () => {
    test('should create article without comments reference', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      expect(article).toBeDefined();
      expect(article.title).toBe('Article');
      // Article has no comments field
      expect((article as any).comments).toBeUndefined();
    });
  });

  describe('multiple comments per article', () => {
    test('should allow multiple comments for same article', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Popular Article' },
      });

      await client.db.Comment.create({
        data: { text: 'Comment 1', article: { connect: article.id } },
      });
      await client.db.Comment.create({
        data: { text: 'Comment 2', article: { connect: article.id } },
      });
      await client.db.Comment.create({
        data: { text: 'Comment 3', article: { connect: article.id } },
      });

      const comments = await client.db.Comment.findMany({
        where: { articleId: article.id },
      });
      expect(comments).toHaveLength(3);
    });
  });

  describe('manual reverse query', () => {
    test('should find comments for article via manual query', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      await client.db.Comment.create({
        data: { text: 'C1', article: { connect: article.id } },
      });
      await client.db.Comment.create({
        data: { text: 'C2', article: { connect: article.id } },
      });

      // Manual query to find comments for article
      const comments = await client.db.Comment.findMany({
        where: { articleId: article.id },
      });

      expect(comments).toHaveLength(2);
    });
  });
});
