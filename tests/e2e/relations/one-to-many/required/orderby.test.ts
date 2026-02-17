/**
 * E2E Tests: One-to-Many Required - OrderBy Operations
 *
 * Schema: one-to-many-required.cerial
 * Tests ordering children in include.
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

describe('E2E One-to-Many Required: OrderBy', () => {
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

  describe('order included children', () => {
    test('should order posts by title ascending', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [{ title: 'Zebra' }, { title: 'Alpha' }, { title: 'Middle' }],
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

      expect(result?.posts?.map((p) => p.title)).toEqual(['Alpha', 'Middle', 'Zebra']);
    });

    test('should order posts by title descending', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [{ title: 'Zebra' }, { title: 'Alpha' }, { title: 'Middle' }],
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

      expect(result?.posts?.map((p) => p.title)).toEqual(['Zebra', 'Middle', 'Alpha']);
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

  // NOTE: Relation orderBy (e.g., orderBy: { author: { name: 'asc' } }) is not supported.
  // SurrealDB 3.x does not resolve record-link dot notation in ORDER BY clauses.
  // Ordering by related fields silently returns insertion order.
});
