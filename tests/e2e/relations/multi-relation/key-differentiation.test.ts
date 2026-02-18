/**
 * E2E Tests: Multi-Relation - Key Differentiation
 *
 * Schema: multi-relation.cerial
 * Tests that @key differentiates between author and reviewer relations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Multi-Relation: Key Differentiation', () => {
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

  describe('authoredDocs vs reviewedDocs', () => {
    test('should differentiate authored and reviewed docs', async () => {
      const alice = await client.db.Writer.create({
        data: { name: 'Alice' },
      });
      const bob = await client.db.Writer.create({
        data: { name: 'Bob' },
      });

      // Alice authors, Bob reviews
      await client.db.Document.create({
        data: {
          title: 'Doc 1',
          author: { connect: alice.id },
          reviewer: { connect: bob.id },
        },
      });

      // Bob authors, Alice reviews
      await client.db.Document.create({
        data: {
          title: 'Doc 2',
          author: { connect: bob.id },
          reviewer: { connect: alice.id },
        },
      });

      // Alice: authoredDocs should have Doc 1
      const aliceResult = await client.db.Writer.findOne({
        where: { id: alice.id },
        include: { authoredDocs: true, reviewedDocs: true },
      });

      expect(aliceResult?.authoredDocs?.map((d) => d.title)).toEqual(['Doc 1']);
      expect(aliceResult?.reviewedDocs?.map((d) => d.title)).toEqual(['Doc 2']);

      // Bob: authoredDocs should have Doc 2
      const bobResult = await client.db.Writer.findOne({
        where: { id: bob.id },
        include: { authoredDocs: true, reviewedDocs: true },
      });

      expect(bobResult?.authoredDocs?.map((d) => d.title)).toEqual(['Doc 2']);
      expect(bobResult?.reviewedDocs?.map((d) => d.title)).toEqual(['Doc 1']);
    });

    test('should count docs correctly per relation type', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Writer' },
      });
      const otherWriter = await client.db.Writer.create({
        data: { name: 'Other' },
      });

      // Writer authors 3 docs
      await client.db.Document.create({
        data: { title: 'Authored 1', author: { connect: writer.id } },
      });
      await client.db.Document.create({
        data: { title: 'Authored 2', author: { connect: writer.id } },
      });
      await client.db.Document.create({
        data: { title: 'Authored 3', author: { connect: writer.id } },
      });

      // Writer reviews 2 docs (authored by other)
      await client.db.Document.create({
        data: {
          title: 'Reviewed 1',
          author: { connect: otherWriter.id },
          reviewer: { connect: writer.id },
        },
      });
      await client.db.Document.create({
        data: {
          title: 'Reviewed 2',
          author: { connect: otherWriter.id },
          reviewer: { connect: writer.id },
        },
      });

      const result = await client.db.Writer.findOne({
        where: { id: writer.id },
        include: { authoredDocs: true, reviewedDocs: true },
      });

      expect(result?.authoredDocs).toHaveLength(3);
      expect(result?.reviewedDocs).toHaveLength(2);
    });
  });

  describe('self-author self-review', () => {
    test('should handle writer as both author and reviewer of same doc', async () => {
      const writer = await client.db.Writer.create({
        data: { name: 'Self Reviewer' },
      });

      const doc = await client.db.Document.create({
        data: {
          title: 'Self Reviewed',
          author: { connect: writer.id },
          reviewer: { connect: writer.id },
        },
      });

      const result = await client.db.Writer.findOne({
        where: { id: writer.id },
        include: { authoredDocs: true, reviewedDocs: true },
      });

      // Same doc appears in both lists
      expect(result?.authoredDocs?.some((d) => d.id.equals(doc.id))).toBe(true);
      expect(result?.reviewedDocs?.some((d) => d.id.equals(doc.id))).toBe(true);
    });
  });
});
