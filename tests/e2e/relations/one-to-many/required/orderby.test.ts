/**
 * E2E Tests: One-to-Many Required - OrderBy Operations
 *
 * Schema: one-to-many-required.cerial
 * Tests ordering children in include.
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

describe('E2E One-to-Many Required: OrderBy', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('order included children', () => {
    test('should order posts by title ascending', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [
              { title: 'Zebra' },
              { title: 'Alpha' },
              { title: 'Middle' },
            ],
          },
        },
      });

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: {
          posts: {
            orderBy: { title: 'asc' },
          },
        },
      });

      expect(result?.posts?.map((p) => p.title)).toEqual([
        'Alpha',
        'Middle',
        'Zebra',
      ]);
    });

    test('should order posts by title descending', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [
              { title: 'Zebra' },
              { title: 'Alpha' },
              { title: 'Middle' },
            ],
          },
        },
      });

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: {
          posts: {
            orderBy: { title: 'desc' },
          },
        },
      });

      expect(result?.posts?.map((p) => p.title)).toEqual([
        'Zebra',
        'Middle',
        'Alpha',
      ]);
    });

    test('should order posts by createdAt', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Author', email: uniqueEmail() },
      });

      // Create posts sequentially to ensure different timestamps
      await client.db.PostRequired.create({
        data: { title: 'First', author: { connect: author.id } },
      });
      await new Promise((r) => setTimeout(r, 10)); // Small delay
      await client.db.PostRequired.create({
        data: { title: 'Second', author: { connect: author.id } },
      });
      await new Promise((r) => setTimeout(r, 10));
      await client.db.PostRequired.create({
        data: { title: 'Third', author: { connect: author.id } },
      });

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: {
          posts: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      expect(result?.posts?.[0]?.title).toBe('Third');
      expect(result?.posts?.[2]?.title).toBe('First');
    });
  });

  describe('order with limit', () => {
    test('should get most recent posts', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Author', email: uniqueEmail() },
      });

      for (let i = 1; i <= 5; i++) {
        await client.db.PostRequired.create({
          data: { title: `Post ${i}`, author: { connect: author.id } },
        });
        await new Promise((r) => setTimeout(r, 5));
      }

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: {
          posts: {
            orderBy: { createdAt: 'desc' },
            limit: 2,
          },
        },
      });

      expect(result?.posts).toHaveLength(2);
      expect(result?.posts?.[0]?.title).toBe('Post 5');
      expect(result?.posts?.[1]?.title).toBe('Post 4');
    });
  });

  describe('order posts query', () => {
    test('should order posts by author name', async () => {
      await client.db.Author.create({
        data: {
          name: 'Zebra Author',
          email: uniqueEmail('z'),
          posts: { create: [{ title: 'Zebra Post' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Alpha Author',
          email: uniqueEmail('a'),
          posts: { create: [{ title: 'Alpha Post' }] },
        },
      });

      const posts = await client.db.PostRequired.findMany({
        orderBy: { author: { name: 'asc' } },
        include: { author: true },
      });

      expect(posts[0]?.author?.name).toBe('Alpha Author');
      expect(posts[1]?.author?.name).toBe('Zebra Author');
    });
  });
});
