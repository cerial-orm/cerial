/**
 * E2E Tests: Multi-Relation - Create
 *
 * Schema: multi-relation.cerial
 * - Writer: id, name, authoredDocs (Relation[] @key), reviewedDocs (Relation[] @key)
 * - Document: id, title, authorId, author (Relation @field @key),
 *             reviewerId?, reviewer (Relation? @field @key)
 *
 * Tests same person can be author AND reviewer via @key differentiation.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

describe('E2E Multi-Relation: Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.multiRelation);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('create document with author', () => {
    test('should create document with author via connect', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Writer' },
      });

      const doc = await client.db.Document.create({
        data: {
          title: 'Doc',
          author: { connect: writer.id },
        },
      });

      expect(doc.authorId).toBe(writer.id);
      expect(doc.reviewerId).toBeNull();
    });

    test('should create document with nested author create', async () => {
      const doc = await client.db.Document.create({
        data: {
          title: 'Doc',
          author: {
            create: { name: 'New Author' },
          },
        },
      });

      expect(doc.authorId).toBeDefined();

      const author = await client.db.Writer.findOne({
        where: { id: doc.authorId },
      });
      expect(author?.name).toBe('New Author');
    });
  });

  describe('create document with reviewer', () => {
    test('should create document with reviewer via connect', async () => {
      const author = await client.db.Writer.create({
        data: { name: 'Author' },
      });
      const reviewer = await client.db.Writer.create({
        data: { name: 'Reviewer' },
      });

      const doc = await client.db.Document.create({
        data: {
          title: 'Doc',
          author: { connect: author.id },
          reviewer: { connect: reviewer.id },
        },
      });

      expect(doc.authorId).toBe(author.id);
      expect(doc.reviewerId).toBe(reviewer.id);
    });
  });

  describe('same writer as author and reviewer', () => {
    test('should allow same writer to be both author and reviewer', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Self Reviewer' },
      });

      const doc = await client.db.Document.create({
        data: {
          title: 'Self Reviewed Doc',
          author: { connect: writer.id },
          reviewer: { connect: writer.id },
        },
      });

      expect(doc.authorId).toBe(writer.id);
      expect(doc.reviewerId).toBe(writer.id);
    });
  });

  describe('multiple documents per writer', () => {
    test('should allow writer to author multiple documents', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Prolific Writer' },
      });

      await client.db.Document.create({
        data: { title: 'Doc 1', author: { connect: writer.id } },
      });
      await client.db.Document.create({
        data: { title: 'Doc 2', author: { connect: writer.id } },
      });
      await client.db.Document.create({
        data: { title: 'Doc 3', author: { connect: writer.id } },
      });

      const docs = await client.db.Document.findMany({
        where: { authorId: writer.id },
      });

      expect(docs).toHaveLength(3);
    });

    test('should allow writer to review multiple documents', async () => {
      const author = await client.db.Writer.create({
        data: { name: 'Author' },
      });
      const reviewer = await client.db.Writer.create({
        data: { name: 'Reviewer' },
      });

      await client.db.Document.create({
        data: {
          title: 'Doc 1',
          author: { connect: author.id },
          reviewer: { connect: reviewer.id },
        },
      });
      await client.db.Document.create({
        data: {
          title: 'Doc 2',
          author: { connect: author.id },
          reviewer: { connect: reviewer.id },
        },
      });

      const reviewedDocs = await client.db.Document.findMany({
        where: { reviewerId: reviewer.id },
      });

      expect(reviewedDocs).toHaveLength(2);
    });
  });
});
