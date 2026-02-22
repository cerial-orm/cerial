/**
 * E2E Tests: One-to-Many Optional - Create Operations
 *
 * Schema: one-to-many-optional.cerial
 * - Publisher: id, name, books (Relation[] @model)
 * - Book: id, title, isbn, publisherId (Record?), publisher (Relation? @field)
 *
 * Tests creating with optional parent relation.
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

describe('E2E One-to-Many Optional: Create', () => {
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

  describe('create child without parent', () => {
    test('should create book without publisher', async () => {
      const book = await client.db.Book.create({
        data: {
          title: 'Self Published',
          isbn: `ISBN-${uniqueId()}`,
        },
      });

      expect(book).toBeDefined();
      expect(book.publisherId).toBeNull();
    });

    test('should create book with explicit null publisherId', async () => {
      const book = await client.db.Book.create({
        data: {
          title: 'Indie Book',
          isbn: `ISBN-${uniqueId()}`,
          publisherId: null,
        },
      });

      expect(book.publisherId).toBeNull();
    });
  });

  describe('create child with parent', () => {
    test('should create book with nested publisher create', async () => {
      const book = await client.db.Book.create({
        data: {
          title: 'Published Book',
          isbn: `ISBN-${uniqueId()}`,
          publisher: {
            create: { name: 'New Publisher' },
          },
        },
      });

      expect(book.publisherId).toBeDefined();

      // Verify publisher was created
      const publisher = await client.db.Publisher.findOne({
        where: { id: book.publisherId! },
      });
      expect(publisher?.name).toBe('New Publisher');
    });

    test('should create book connecting to existing publisher', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Existing Publisher' },
      });

      const book = await client.db.Book.create({
        data: {
          title: 'Connected Book',
          isbn: `ISBN-${uniqueId()}`,
          publisher: { connect: publisher.id },
        },
      });

      expect(book.publisherId?.equals(publisher.id)).toBe(true);
    });
  });

  describe('create parent with children', () => {
    test('should create publisher with nested books', async () => {
      const publisher = await client.db.Publisher.create({
        data: {
          name: 'Big Publisher',
          books: {
            create: [
              { title: 'Book 1', isbn: `ISBN-${uniqueId()}` },
              { title: 'Book 2', isbn: `ISBN-${uniqueId()}` },
            ],
          },
        },
      });

      expect(publisher).toBeDefined();

      const books = await client.db.Book.findMany({
        where: { publisherId: publisher.id },
      });
      expect(books).toHaveLength(2);
    });

    test('should create publisher without books', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Empty Publisher' },
      });

      expect(publisher).toBeDefined();

      const books = await client.db.Book.findMany({
        where: { publisherId: publisher.id },
      });
      expect(books).toHaveLength(0);
    });
  });

  describe('mixed create', () => {
    test('should have orphan and published books together', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      await client.db.Book.create({
        data: { title: 'Published', isbn: `ISBN-${uniqueId()}`, publisher: { connect: publisher.id } },
      });
      await client.db.Book.create({
        data: { title: 'Self Pub 1', isbn: `ISBN-${uniqueId()}` },
      });
      await client.db.Book.create({
        data: { title: 'Self Pub 2', isbn: `ISBN-${uniqueId()}` },
      });

      const allBooks = await client.db.Book.findMany({});
      expect(allBooks).toHaveLength(3);

      const orphans = await client.db.Book.findMany({
        where: { publisherId: null },
      });
      expect(orphans).toHaveLength(2);
    });
  });
});
