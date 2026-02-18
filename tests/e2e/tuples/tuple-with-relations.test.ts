/**
 * E2E Tests: Tuple with Relations
 *
 * Tests models that have both tuple fields and relation fields.
 * TupleWithRelation has a location Coordinate and posts Relation[].
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Tuples: With Relations', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.tuples);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.tuples);
  });

  describe('create model with tuple and relation', () => {
    test('should create parent with tuple field', async () => {
      const author = await client.db.TupleWithRelation.create({
        data: { name: 'Author1', location: [40.7, -74.0] },
      });

      expect(isCerialId(author.id)).toBe(true);
      expect(author.name).toBe('Author1');
      expect(author.location).toEqual([40.7, -74.0]);
    });

    test('should create child with optional tuple field', async () => {
      const author = await client.db.TupleWithRelation.create({
        data: { name: 'Author2', location: [0, 0] },
      });

      const post = await client.db.TupleRelatedPost.create({
        data: { title: 'Post1', authorId: author.id, position: [10, 20] },
      });

      expect(post.title).toBe('Post1');
      expect(post.position).toEqual([10, 20]);
    });

    test('should create child without optional tuple', async () => {
      const author = await client.db.TupleWithRelation.create({
        data: { name: 'Author3', location: [0, 0] },
      });

      const post = await client.db.TupleRelatedPost.create({
        data: { title: 'Post2', authorId: author.id },
      });

      expect(post.title).toBe('Post2');
      expect(post.position).toBeUndefined();
    });
  });

  describe('query with include', () => {
    test('should include related posts with tuple fields', async () => {
      const author = await client.db.TupleWithRelation.create({
        data: { name: 'IncludeAuthor', location: [40, -74] },
      });

      await client.db.TupleRelatedPost.create({
        data: { title: 'P1', authorId: author.id, position: [1, 2] },
      });
      await client.db.TupleRelatedPost.create({
        data: { title: 'P2', authorId: author.id, position: [3, 4] },
      });

      const result = await client.db.TupleWithRelation.findUnique({
        where: { id: author.id },
        include: { posts: true },
      });

      expect(result).not.toBeNull();
      expect(result!.location).toEqual([40, -74]);
      expect(result!.posts).toHaveLength(2);
      expect(result!.posts[0]!.position).toBeDefined();
    });
  });

  describe('filter on tuple in related model', () => {
    test('should filter parent by tuple field and include children', async () => {
      const a1 = await client.db.TupleWithRelation.create({
        data: { name: 'FilterAuthor1', location: [40, -74] },
      });
      const a2 = await client.db.TupleWithRelation.create({
        data: { name: 'FilterAuthor2', location: [34, -118] },
      });

      await client.db.TupleRelatedPost.create({ data: { title: 'FA1P', authorId: a1.id } });
      await client.db.TupleRelatedPost.create({ data: { title: 'FA2P', authorId: a2.id } });

      const results = await client.db.TupleWithRelation.findMany({
        where: { location: { lat: { gt: 35 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('FilterAuthor1');
    });
  });
});
