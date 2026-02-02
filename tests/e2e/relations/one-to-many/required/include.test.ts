/**
 * E2E Tests: One-to-Many Required - Include Operations
 *
 * Schema: one-to-many-required.cerial
 * Tests including related records with pagination support.
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

describe('E2E One-to-Many Required: Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include children from parent', () => {
    test('should include posts when querying author', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [{ title: 'Post 1' }, { title: 'Post 2' }],
          },
        },
      });

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: { posts: true },
      });

      expect(result?.posts).toBeDefined();
      expect(result?.posts).toHaveLength(2);
      expect(result?.posts?.map((p) => p.title).sort()).toEqual([
        'Post 1',
        'Post 2',
      ]);
    });

    test('should return empty array when author has no posts', async () => {
      const author = await client.db.Author.create({
        data: { name: 'No Posts', email: uniqueEmail() },
      });

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: { posts: true },
      });

      expect(result?.posts).toEqual([]);
    });
  });

  describe('include parent from child', () => {
    test('should include author when querying post', async () => {
      const author = await client.db.Author.create({
        data: { name: 'Author', email: uniqueEmail() },
      });

      const post = await client.db.PostRequired.create({
        data: { title: 'Post', author: { connect: author.id } },
      });

      const result = await client.db.PostRequired.findOne({
        where: { id: post.id },
        include: { author: true },
      });

      expect(result?.author).toBeDefined();
      expect(result?.author?.name).toBe('Author');
    });
  });

  describe('include with orderBy', () => {
    test('should order included posts', async () => {
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
  });

  describe('include with limit', () => {
    test('should limit included posts', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Author',
          email: uniqueEmail(),
          posts: {
            create: [
              { title: 'Post 1' },
              { title: 'Post 2' },
              { title: 'Post 3' },
              { title: 'Post 4' },
              { title: 'Post 5' },
            ],
          },
        },
      });

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: {
          posts: {
            limit: 2,
          },
        },
      });

      expect(result?.posts).toHaveLength(2);
    });
  });

  describe('include with offset', () => {
    test('should skip posts with offset', async () => {
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

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: {
          posts: {
            orderBy: { title: 'asc' },
            offset: 1,
            limit: 2,
          },
        },
      });

      expect(result?.posts).toHaveLength(2);
      expect(result?.posts?.[0]?.title).toBe('Post 2');
    });
  });

  describe('include in findMany', () => {
    test('should include posts for multiple authors', async () => {
      await client.db.Author.create({
        data: {
          name: 'Author 1',
          email: uniqueEmail('a1'),
          posts: { create: [{ title: 'A1 Post' }] },
        },
      });
      await client.db.Author.create({
        data: {
          name: 'Author 2',
          email: uniqueEmail('a2'),
          posts: { create: [{ title: 'A2 Post 1' }, { title: 'A2 Post 2' }] },
        },
      });

      const authors = await client.db.Author.findMany({
        include: { posts: true },
        orderBy: { name: 'asc' },
      });

      expect(authors).toHaveLength(2);
      expect(authors[0]?.posts).toHaveLength(1);
      expect(authors[1]?.posts).toHaveLength(2);
    });
  });

  describe('nested include', () => {
    test('should support nested include (author.posts.author)', async () => {
      const author = await client.db.Author.create({
        data: {
          name: 'Nested Author',
          email: uniqueEmail(),
          posts: { create: [{ title: 'Nested Post' }] },
        },
      });

      const result = await client.db.Author.findOne({
        where: { id: author.id },
        include: {
          posts: {
            include: { author: true },
          },
        },
      });

      expect(result?.posts?.[0]?.author?.name).toBe('Nested Author');
    });
  });
});
