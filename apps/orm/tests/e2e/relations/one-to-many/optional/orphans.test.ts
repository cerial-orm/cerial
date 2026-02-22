/**
 * E2E Tests: One-to-Many Optional - Orphan Handling
 *
 * Schema: one-to-many-optional.cerial
 * Tests querying and managing orphaned children.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueId,
} from '../../../test-helper';

describe('E2E One-to-Many Optional: Orphans', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyOptional);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManyOptional);
  });

  describe('query orphans', () => {
    test('should find all orphan books', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      await client.db.Book.create({
        data: { title: 'Published', isbn: `ISBN-${uniqueId()}`, publisher: { connect: publisher.id } },
      });
      await client.db.Book.create({
        data: { title: 'Orphan 1', isbn: `ISBN-${uniqueId()}` },
      });
      await client.db.Book.create({
        data: { title: 'Orphan 2', isbn: `ISBN-${uniqueId()}` },
      });

      const orphans = await client.db.Book.findMany({
        where: { publisherId: null },
      });

      expect(orphans).toHaveLength(2);
      expect(orphans.map((b) => b.title).sort()).toEqual(['Orphan 1', 'Orphan 2']);
    });

    test('should find non-orphan books', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      await client.db.Book.create({
        data: { title: 'Published', isbn: `ISBN-${uniqueId()}`, publisher: { connect: publisher.id } },
      });
      await client.db.Book.create({
        data: { title: 'Orphan', isbn: `ISBN-${uniqueId()}` },
      });

      const published = await client.db.Book.findMany({
        where: { publisherId: { not: null } },
      });

      expect(published).toHaveLength(1);
      expect(published[0]?.title).toBe('Published');
    });
  });

  describe('adopt orphans', () => {
    test('should connect orphan books to publisher', async () => {
      await client.db.Book.create({
        data: { title: 'Orphan 1', isbn: `ISBN-${uniqueId()}` },
      });
      await client.db.Book.create({
        data: { title: 'Orphan 2', isbn: `ISBN-${uniqueId()}` },
      });

      const publisher = await client.db.Publisher.create({
        data: { name: 'Adopter' },
      });

      // Get orphan IDs
      const orphans = await client.db.Book.findMany({
        where: { publisherId: null },
      });
      const orphanIds = orphans.map((b) => b.id);

      // Adopt all orphans
      await client.db.Publisher.updateMany({
        where: { id: publisher.id },
        data: {
          books: { connect: orphanIds },
        },
      });

      // Verify all books now have publisher
      const noOrphans = await client.db.Book.findMany({
        where: { publisherId: null },
      });
      expect(noOrphans).toHaveLength(0);
    });
  });

  describe('orphan after delete', () => {
    test('should become orphan after publisher deleted', async () => {
      const publisher = await client.db.Publisher.create({
        data: {
          name: 'Publisher',
          books: { create: [{ title: 'Book', isbn: `ISBN-${uniqueId()}` }] },
        },
      });

      // Verify book has publisher
      let book = await client.db.Book.findOne({
        where: { title: 'Book' },
      });
      expect(book?.publisherId?.equals(publisher.id)).toBe(true);

      // Delete publisher
      await client.db.Publisher.deleteMany({
        where: { id: publisher.id },
      });

      // Book should be orphan
      book = await client.db.Book.findOne({
        where: { title: 'Book' },
      });
      expect(book?.publisherId).toBeNull();
    });
  });

  describe('count orphans', () => {
    test('should count orphan vs published books', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      await client.db.Book.create({
        data: { title: 'P1', isbn: `ISBN-${uniqueId()}`, publisher: { connect: publisher.id } },
      });
      await client.db.Book.create({
        data: { title: 'P2', isbn: `ISBN-${uniqueId()}`, publisher: { connect: publisher.id } },
      });
      await client.db.Book.create({
        data: { title: 'O1', isbn: `ISBN-${uniqueId()}` },
      });

      const orphanCount = (await client.db.Book.findMany({ where: { publisherId: null } })).length;
      const publishedCount = (await client.db.Book.findMany({ where: { publisherId: { not: null } } })).length;

      expect(orphanCount).toBe(1);
      expect(publishedCount).toBe(2);
    });
  });
});
