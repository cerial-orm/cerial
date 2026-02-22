/**
 * E2E Tests: One-to-Many Optional - Delete Operations
 *
 * Schema: one-to-many-optional.cerial
 * Tests SetNull on parent delete - books become orphans.
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

describe('E2E One-to-Many Optional: Delete', () => {
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

  describe('SetNull default behavior', () => {
    test('should set book.publisherId to null when publisher deleted', async () => {
      const publisher = await client.db.Publisher.create({
        data: {
          name: 'Publisher',
          books: {
            create: [
              { title: 'Book 1', isbn: `ISBN-${uniqueId()}` },
              { title: 'Book 2', isbn: `ISBN-${uniqueId()}` },
            ],
          },
        },
      });

      const booksBefore = await client.db.Book.findMany({
        where: { publisherId: publisher.id },
      });
      expect(booksBefore).toHaveLength(2);

      // Delete publisher
      await client.db.Publisher.deleteMany({
        where: { id: publisher.id },
      });

      // Books should now be orphans
      const booksAfter = await client.db.Book.findMany({});
      expect(booksAfter).toHaveLength(2);
      booksAfter.forEach((book) => {
        expect(book.publisherId).toBeNull();
      });
    });

    test('should only orphan books of deleted publisher', async () => {
      const pub1 = await client.db.Publisher.create({
        data: { name: 'Publisher 1' },
      });
      const pub2 = await client.db.Publisher.create({
        data: { name: 'Publisher 2' },
      });

      await client.db.Book.create({
        data: { title: 'P1 Book', isbn: `ISBN-${uniqueId()}`, publisher: { connect: pub1.id } },
      });
      await client.db.Book.create({
        data: { title: 'P2 Book', isbn: `ISBN-${uniqueId()}`, publisher: { connect: pub2.id } },
      });

      // Delete pub1
      await client.db.Publisher.deleteMany({
        where: { id: pub1.id },
      });

      // P2 book should still have publisher
      const p2Book = await client.db.Book.findOne({
        where: { title: 'P2 Book' },
      });
      expect(p2Book?.publisherId?.equals(pub2.id)).toBe(true);

      // P1 book should be orphaned
      const p1Book = await client.db.Book.findOne({
        where: { title: 'P1 Book' },
      });
      expect(p1Book?.publisherId).toBeNull();
    });
  });

  describe('delete book', () => {
    test('should delete book without affecting publisher', async () => {
      const publisher = await client.db.Publisher.create({
        data: {
          name: 'Publisher',
          books: {
            create: [
              { title: 'Book 1', isbn: `ISBN-${uniqueId()}` },
              { title: 'Book 2', isbn: `ISBN-${uniqueId()}` },
            ],
          },
        },
      });

      const books = await client.db.Book.findMany({
        where: { publisherId: publisher.id },
      });

      // Delete one book
      await client.db.Book.deleteMany({
        where: { id: books[0]!.id },
      });

      // Publisher still exists
      expect(await client.db.Publisher.findOne({ where: { id: publisher.id } })).toBeDefined();

      // Only one book remains
      expect(await client.db.Book.findMany({ where: { publisherId: publisher.id } })).toHaveLength(1);
    });
  });

  describe('delete orphan', () => {
    test('should delete orphan book', async () => {
      const book = await client.db.Book.create({
        data: { title: 'Orphan', isbn: `ISBN-${uniqueId()}` },
      });

      await client.db.Book.deleteMany({
        where: { id: book.id },
      });

      expect(await client.db.Book.findOne({ where: { id: book.id } })).toBeNull();
    });
  });
});
