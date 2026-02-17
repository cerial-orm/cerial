/**
 * E2E Tests: One-to-Many @onDelete(SetNull) - Explicit
 *
 * Uses one-to-many-optional.cerial (default SetNull behavior)
 * Tests children becoming orphans when parent deleted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueId,
} from '../../test-helper';

describe('E2E One-to-Many @onDelete(SetNull)', () => {
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

  describe('setnull behavior', () => {
    test('should set all book.publisherId to null when publisher deleted', async () => {
      const publisher = await client.db.Publisher.create({
        data: {
          name: 'Publisher',
          books: {
            create: [
              { title: 'Book 1', isbn: `ISBN-${uniqueId()}` },
              { title: 'Book 2', isbn: `ISBN-${uniqueId()}` },
              { title: 'Book 3', isbn: `ISBN-${uniqueId()}` },
            ],
          },
        },
      });

      // Delete publisher
      await client.db.Publisher.deleteMany({
        where: { id: publisher.id },
      });

      // All books should be orphaned
      const books = await client.db.Book.findMany({});
      expect(books).toHaveLength(3);
      books.forEach((book) => {
        expect(book.publisherId).toBeNull();
      });
    });
  });

  describe('orphan management', () => {
    test('should be able to find orphaned books', async () => {
      const publisher = await client.db.Publisher.create({
        data: {
          name: 'Publisher',
          books: { create: [{ title: 'Will Orphan', isbn: `ISBN-${uniqueId()}` }] },
        },
      });

      await client.db.Publisher.deleteMany({
        where: { id: publisher.id },
      });

      const orphans = await client.db.Book.findMany({
        where: { publisherId: null },
      });

      expect(orphans).toHaveLength(1);
      expect(orphans[0]?.title).toBe('Will Orphan');
    });

    test('should be able to reassign orphaned books', async () => {
      const publisher1 = await client.db.Publisher.create({
        data: {
          name: 'Publisher 1',
          books: { create: [{ title: 'Orphan', isbn: `ISBN-${uniqueId()}` }] },
        },
      });

      // Delete publisher - book becomes orphan
      await client.db.Publisher.deleteMany({
        where: { id: publisher1.id },
      });

      // Create new publisher
      const publisher2 = await client.db.Publisher.create({
        data: { name: 'Publisher 2' },
      });

      // Reassign orphan
      await client.db.Book.updateMany({
        where: { publisherId: null },
        data: { publisherId: publisher2.id },
      });

      const books = await client.db.Book.findMany({
        where: { publisherId: publisher2.id },
      });
      expect(books).toHaveLength(1);
    });
  });

  describe('include after setnull', () => {
    test('should return null publisher in include after deletion', async () => {
      const publisher = await client.db.Publisher.create({
        data: {
          name: 'Publisher',
          books: { create: [{ title: 'Book', isbn: `ISBN-${uniqueId()}` }] },
        },
      });

      const bookBefore = await client.db.Book.findOne({
        where: { title: 'Book' },
        include: { publisher: true },
      });
      expect(bookBefore?.publisher?.name).toBe('Publisher');

      // Delete publisher
      await client.db.Publisher.deleteMany({
        where: { id: publisher.id },
      });

      const bookAfter = await client.db.Book.findOne({
        where: { title: 'Book' },
        include: { publisher: true },
      });
      expect(bookAfter?.publisherId).toBeNull();
      expect(bookAfter?.publisher).toBeNull();
    });
  });
});
