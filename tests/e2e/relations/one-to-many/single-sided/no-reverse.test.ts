/**
 * E2E Tests: One-to-Many Single-Sided - No Reverse Access
 *
 * Schema: one-to-many-single-sided.cerial
 * Tests that Article has no comments accessor.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E One-to-Many Single-Sided: No Reverse', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManySingleSided);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('article has no comments field', () => {
    test('article model should not have comments relation', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      // Article only has id and title
      expect(article.id).toBeDefined();
      expect(article.title).toBe('Article');
      expect((article as any).comments).toBeUndefined();
    });

    test('findOne on article should not have comments', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      const found = await client.db.Article.findOne({
        where: { id: article.id },
      });

      expect(Object.keys(found!)).not.toContain('comments');
    });
  });

  describe('no nested operations from parent', () => {
    test('cannot create comments via article nested create', async () => {
      // Article has no comments field, so no nested create
      const article = await client.db.Article.create({
        data: {
          title: 'Article',
          // comments: { create: [...] }  // Would be type error
        },
      });

      expect(article).toBeDefined();
    });

    test('cannot connect comments via article update', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      // Update article - no comments operations available
      await client.db.Article.updateMany({
        where: { id: article.id },
        data: { title: 'Updated' },
      });

      const updated = await client.db.Article.findOne({
        where: { id: article.id },
      });
      expect(updated?.title).toBe('Updated');
    });
  });

  describe('delete behavior', () => {
    test('should orphan comments when article deleted (SetNull default)', async () => {
      const article = await client.db.Article.create({
        data: { title: 'Article' },
      });

      await client.db.Comment.create({
        data: { text: 'C1', article: { connect: article.id } },
      });
      await client.db.Comment.create({
        data: { text: 'C2', article: { connect: article.id } },
      });

      // Delete article
      await client.db.Article.deleteMany({
        where: { id: article.id },
      });

      // Comments should be orphaned (SetNull default for optional relations)
      const comments = await client.db.Comment.findMany({});
      expect(comments).toHaveLength(2);
      comments.forEach((c) => expect(c.articleId).toBeNull());
    });
  });

  describe('manual aggregation', () => {
    test('should count comments per article manually', async () => {
      const article1 = await client.db.Article.create({
        data: { title: 'Popular' },
      });
      const article2 = await client.db.Article.create({
        data: { title: 'Quiet' },
      });

      // Add comments to article1
      await client.db.Comment.create({
        data: { text: 'C1', article: { connect: article1.id } },
      });
      await client.db.Comment.create({
        data: { text: 'C2', article: { connect: article1.id } },
      });
      await client.db.Comment.create({
        data: { text: 'C3', article: { connect: article1.id } },
      });

      // Count comments manually
      const article1Comments = await client.db.Comment.findMany({
        where: { articleId: article1.id },
      });
      const article2Comments = await client.db.Comment.findMany({
        where: { articleId: article2.id },
      });

      expect(article1Comments).toHaveLength(3);
      expect(article2Comments).toHaveLength(0);
    });
  });
});
