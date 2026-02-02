/**
 * E2E Tests: Multi-Relation - Update
 *
 * Schema: multi-relation.cerial
 * Tests updating author and reviewer relations.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

describe('E2E Multi-Relation: Update', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.multiRelation);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('update author', () => {
    test('should change author via connect', async () => {
      const oldAuthor = await client.db.Writer.create({
        data: { name: 'Old Author' },
      });
      const newAuthor = await client.db.Writer.create({
        data: { name: 'New Author' },
      });

      const doc = await client.db.Document.create({
        data: { title: 'Doc', author: { connect: oldAuthor.id } },
      });

      await client.db.Document.updateMany({
        where: { id: doc.id },
        data: { author: { connect: newAuthor.id } },
      });

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
      });

      expect(result?.authorId).toBe(newAuthor.id);
    });
  });

  describe('update reviewer', () => {
    test('should assign reviewer via connect', async () => {
      const author = await client.db.Writer.create({
        data: { name: 'Author' },
      });
      const reviewer = await client.db.Writer.create({
        data: { name: 'Reviewer' },
      });

      const doc = await client.db.Document.create({
        data: { title: 'Doc', author: { connect: author.id } },
      });

      expect(doc.reviewerId).toBeNull();

      await client.db.Document.updateMany({
        where: { id: doc.id },
        data: { reviewer: { connect: reviewer.id } },
      });

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
      });

      expect(result?.reviewerId).toBe(reviewer.id);
    });

    test('should change reviewer via connect', async () => {
      const author = await client.db.Writer.create({
        data: { name: 'Author' },
      });
      const oldReviewer = await client.db.Writer.create({
        data: { name: 'Old Reviewer' },
      });
      const newReviewer = await client.db.Writer.create({
        data: { name: 'New Reviewer' },
      });

      const doc = await client.db.Document.create({
        data: {
          title: 'Doc',
          author: { connect: author.id },
          reviewer: { connect: oldReviewer.id },
        },
      });

      await client.db.Document.updateMany({
        where: { id: doc.id },
        data: { reviewer: { connect: newReviewer.id } },
      });

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
      });

      expect(result?.reviewerId).toBe(newReviewer.id);
    });

    test('should remove reviewer via disconnect', async () => {
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

      await client.db.Document.updateMany({
        where: { id: doc.id },
        data: { reviewer: { disconnect: true } },
      });

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
      });

      expect(result?.reviewerId).toBeNull();
    });
  });

  describe('update both simultaneously', () => {
    test('should update author and reviewer at once', async () => {
      const oldAuthor = await client.db.Writer.create({
        data: { name: 'Old Author' },
      });
      const newAuthor = await client.db.Writer.create({
        data: { name: 'New Author' },
      });
      const newReviewer = await client.db.Writer.create({
        data: { name: 'New Reviewer' },
      });

      const doc = await client.db.Document.create({
        data: { title: 'Doc', author: { connect: oldAuthor.id } },
      });

      await client.db.Document.updateMany({
        where: { id: doc.id },
        data: {
          author: { connect: newAuthor.id },
          reviewer: { connect: newReviewer.id },
        },
      });

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
      });

      expect(result?.authorId).toBe(newAuthor.id);
      expect(result?.reviewerId).toBe(newReviewer.id);
    });
  });
});
