/**
 * E2E Tests: Multi-Relation - Include
 *
 * Schema: multi-relation.cerial
 * Tests including both author and reviewer relations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

describe('E2E Multi-Relation: Include', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.multiRelation);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.multiRelation);
  });

  describe('include author', () => {
    test('should include author from document', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Author' },
      });

      const doc = await client.db.Document.create({
        data: { title: 'Doc', author: { connect: writer.id } },
      });

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
        include: { author: true },
      });

      expect(result?.author?.name).toBe('Author');
    });
  });

  describe('include reviewer', () => {
    test('should include reviewer from document', async () => {
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

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
        include: { reviewer: true },
      });

      expect(result?.reviewer?.name).toBe('Reviewer');
    });

    test('should return null reviewer when not assigned', async () => {
      const author = await client.db.Writer.create({
        data: { name: 'Author' },
      });

      const doc = await client.db.Document.create({
        data: { title: 'Doc', author: { connect: author.id } },
      });

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
        include: { reviewer: true },
      });

      expect(result?.reviewer).toBeNull();
    });
  });

  describe('include both author and reviewer', () => {
    test('should include both relations', async () => {
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

      const result = await client.db.Document.findOne({
        where: { id: doc.id },
        include: { author: true, reviewer: true },
      });

      expect(result?.author?.name).toBe('Author');
      expect(result?.reviewer?.name).toBe('Reviewer');
    });
  });

  describe('include authoredDocs and reviewedDocs', () => {
    test('should include both doc lists from writer', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Writer' },
      });
      const other = await client.db.Writer.create({
        data: { name: 'Other' },
      });

      await client.db.Document.create({
        data: { title: 'Authored', author: { connect: writer.id } },
      });
      await client.db.Document.create({
        data: {
          title: 'Reviewed',
          author: { connect: other.id },
          reviewer: { connect: writer.id },
        },
      });

      const result = await client.db.Writer.findOne({
        where: { id: writer.id },
        include: { authoredDocs: true, reviewedDocs: true },
      });

      expect(result?.authoredDocs?.map((d) => d.title)).toContain('Authored');
      expect(result?.reviewedDocs?.map((d) => d.title)).toContain('Reviewed');
    });
  });

  describe('include with ordering', () => {
    test('should order authoredDocs by title', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Writer' },
      });

      await client.db.Document.create({
        data: { title: 'Zebra', author: { connect: writer.id } },
      });
      await client.db.Document.create({
        data: { title: 'Alpha', author: { connect: writer.id } },
      });

      const result = await client.db.Writer.findOne({
        where: { id: writer.id },
        include: {
          authoredDocs: {
            orderBy: { title: 'asc' },
          },
        },
      });

      expect(result?.authoredDocs?.map((d) => d.title)).toEqual([
        'Alpha',
        'Zebra',
      ]);
    });
  });
});
