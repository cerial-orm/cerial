/**
 * E2E Tests: One-to-Many Optional - Include Operations
 *
 * Schema: one-to-many-optional.cerial
 * Tests including nullable parent relation.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
  uniqueId,
} from '../../test-helper';

describe('E2E One-to-Many Optional: Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyOptional);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include nullable parent', () => {
    test('should include publisher when book has one', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      const book = await client.db.Book.create({
        data: {
          title: 'Book',
          isbn: `ISBN-${uniqueId()}`,
          publisher: { connect: publisher.id },
        },
      });

      const result = await client.db.Book.findOne({
        where: { id: book.id },
        include: { publisher: true },
      });

      expect(result?.publisher).toBeDefined();
      expect(result?.publisher?.name).toBe('Publisher');
    });

    test('should return null publisher for orphan book', async () => {
      const book = await client.db.Book.create({
        data: { title: 'Orphan', isbn: `ISBN-${uniqueId()}` },
      });

      const result = await client.db.Book.findOne({
        where: { id: book.id },
        include: { publisher: true },
      });

      expect(result).toBeDefined();
      expect(result?.publisher).toBeNull();
    });
  });

  describe('include children', () => {
    test('should include books when querying publisher', async () => {
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

      const result = await client.db.Publisher.findOne({
        where: { id: publisher.id },
        include: { books: true },
      });

      expect(result?.books).toHaveLength(2);
    });

    test('should return empty array for publisher with no books', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Empty Publisher' },
      });

      const result = await client.db.Publisher.findOne({
        where: { id: publisher.id },
        include: { books: true },
      });

      expect(result?.books).toEqual([]);
    });
  });

  describe('include in findMany with mixed results', () => {
    test('should handle mix of books with and without publishers', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      await client.db.Book.create({
        data: { title: 'Published', isbn: `ISBN-${uniqueId()}`, publisher: { connect: publisher.id } },
      });
      await client.db.Book.create({
        data: { title: 'Orphan', isbn: `ISBN-${uniqueId()}` },
      });

      const books = await client.db.Book.findMany({
        include: { publisher: true },
        orderBy: { title: 'asc' },
      });

      expect(books).toHaveLength(2);
      expect(books[0]?.publisher).toBeNull(); // Orphan
      expect(books[1]?.publisher?.name).toBe('Publisher'); // Published
    });
  });
});
