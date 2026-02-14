/**
 * E2E Tests: One-to-Many Optional - Upsert
 *
 * Schema: one-to-many-optional.cerial
 * - Publisher: id, name, books (Relation[] @model)
 * - Book: id, title, isbn (@unique), publisherId (Record?), publisher (Relation? @field)
 *
 * FK on Book side (optional). Tests upsert with one-to-many relations:
 * FK operations, nested create/connect from both sides, disconnect, include.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig, uniqueId } from '../../test-helper';

describe('E2E One-to-Many Optional: Upsert', () => {
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

  // ==========================================================================
  // FK field in upsert (Book → Publisher)
  // ==========================================================================

  describe('upsert book with FK field', () => {
    test('creates book with publisherId on create path', async () => {
      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      const isbn = `ISBN-${uniqueId()}`;
      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'New Book', isbn, publisherId: publisher.id },
        update: { title: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe('New Book');
      expect(result!.publisherId?.equals(publisher.id)).toBe(true);
    });

    test('creates book without publisher (null FK) on create path', async () => {
      const isbn = `ISBN-${uniqueId()}`;
      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'Orphan Book', isbn },
        update: { title: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe('Orphan Book');
      expect(result!.publisherId).toBeNull();
    });

    test('reassigns book to different publisher via FK in update', async () => {
      const pub1 = await client.db.Publisher.create({ data: { name: 'Pub 1' } });
      const pub2 = await client.db.Publisher.create({ data: { name: 'Pub 2' } });

      const isbn = `ISBN-${uniqueId()}`;
      const book = await client.db.Book.create({
        data: { title: 'Book', isbn, publisher: { connect: pub1.id } },
      });

      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'New', isbn },
        update: { publisherId: pub2.id },
      });

      expect(result).toBeDefined();
      expect(result!.publisherId?.equals(pub2.id)).toBe(true);
    });

    test('sets FK to null (disconnect) via update', async () => {
      const publisher = await client.db.Publisher.create({ data: { name: 'Publisher' } });

      const isbn = `ISBN-${uniqueId()}`;
      await client.db.Book.create({
        data: { title: 'Book', isbn, publisher: { connect: publisher.id } },
      });

      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'New', isbn },
        update: { publisherId: null },
      });

      expect(result).toBeDefined();
      expect(result!.publisherId).toBeNull();
    });
  });

  // ==========================================================================
  // Nested create from PK side (Book → Publisher)
  // ==========================================================================

  describe('nested create from PK side (Book)', () => {
    test('creates book with nested publisher create on upsert create path', async () => {
      const isbn = `ISBN-${uniqueId()}`;
      const result = await client.db.Book.upsert({
        where: { isbn },
        create: {
          title: 'Published Book',
          isbn,
          publisher: {
            create: { name: 'New Publisher' },
          },
        },
        update: { title: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe('Published Book');
      expect(result!.publisherId).toBeDefined();

      // Verify publisher was created
      const publisher = await client.db.Publisher.findOne({
        where: { id: result!.publisherId! },
      });
      expect(publisher).toBeDefined();
      expect(publisher!.name).toBe('New Publisher');
    });

    test('creates new publisher via nested create on upsert update path', async () => {
      const isbn = `ISBN-${uniqueId()}`;
      await client.db.Book.create({
        data: { title: 'Existing', isbn },
      });

      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'New', isbn },
        update: {
          title: 'Updated',
          publisher: {
            create: { name: 'Update Publisher' },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe('Updated');
      expect(result!.publisherId).toBeDefined();

      const publisher = await client.db.Publisher.findOne({
        where: { id: result!.publisherId! },
      });
      expect(publisher!.name).toBe('Update Publisher');
    });
  });

  // ==========================================================================
  // Nested connect from PK side (Book → Publisher)
  // ==========================================================================

  describe('nested connect from PK side (Book)', () => {
    test('connects existing publisher on create path', async () => {
      const publisher = await client.db.Publisher.create({ data: { name: 'Pub' } });

      const isbn = `ISBN-${uniqueId()}`;
      const result = await client.db.Book.upsert({
        where: { isbn },
        create: {
          title: 'Connected Book',
          isbn,
          publisher: { connect: publisher.id },
        },
        update: { title: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.publisherId?.equals(publisher.id)).toBe(true);
    });

    test('connects different publisher on update path', async () => {
      const pub1 = await client.db.Publisher.create({ data: { name: 'Pub 1' } });
      const pub2 = await client.db.Publisher.create({ data: { name: 'Pub 2' } });

      const isbn = `ISBN-${uniqueId()}`;
      await client.db.Book.create({
        data: { title: 'Book', isbn, publisher: { connect: pub1.id } },
      });

      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'New', isbn },
        update: {
          publisher: { connect: pub2.id },
        },
      });

      expect(result).toBeDefined();
      expect(result!.publisherId?.equals(pub2.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Nested disconnect from PK side (Book → Publisher)
  // ==========================================================================

  describe('nested disconnect', () => {
    test('disconnects publisher from book on update path', async () => {
      const publisher = await client.db.Publisher.create({ data: { name: 'Pub' } });

      const isbn = `ISBN-${uniqueId()}`;
      await client.db.Book.create({
        data: { title: 'Book', isbn, publisher: { connect: publisher.id } },
      });

      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'New', isbn },
        update: {
          publisher: { disconnect: true },
        },
      });

      expect(result).toBeDefined();
      expect(result!.publisherId).toBeNull();
    });
  });

  // ==========================================================================
  // Nested operations from non-PK side (Publisher → Books)
  // ==========================================================================

  describe('nested from non-PK side (Publisher)', () => {
    test('creates publisher with nested book creates on upsert create path', async () => {
      const result = await client.db.Publisher.upsert({
        where: { id: 'publisher:nested_books' },
        create: {
          name: 'Big Publisher',
          books: {
            create: [
              { title: 'Book 1', isbn: `ISBN-${uniqueId()}` },
              { title: 'Book 2', isbn: `ISBN-${uniqueId()}` },
            ],
          },
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Big Publisher');

      const books = await client.db.Book.findMany({
        where: { publisherId: result!.id },
      });
      expect(books).toHaveLength(2);
    });

    test('connects existing books on upsert update path', async () => {
      const publisher = await client.db.Publisher.create({ data: { name: 'Publisher' } });

      const book1 = await client.db.Book.create({
        data: { title: 'Orphan 1', isbn: `ISBN-${uniqueId()}` },
      });
      const book2 = await client.db.Book.create({
        data: { title: 'Orphan 2', isbn: `ISBN-${uniqueId()}` },
      });

      const result = await client.db.Publisher.upsert({
        where: { id: publisher.id },
        create: { name: 'Not This' },
        update: {
          books: { connect: [book1.id, book2.id] },
        },
      });

      expect(result).toBeDefined();

      const updatedBook1 = await client.db.Book.findOne({ where: { id: book1.id } });
      const updatedBook2 = await client.db.Book.findOne({ where: { id: book2.id } });
      expect(updatedBook1?.publisherId?.equals(publisher.id)).toBe(true);
      expect(updatedBook2?.publisherId?.equals(publisher.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Include
  // ==========================================================================

  describe('include', () => {
    test('includes books in publisher upsert result', async () => {
      const publisher = await client.db.Publisher.create({ data: { name: 'Publisher' } });

      await client.db.Book.create({
        data: { title: 'Book 1', isbn: `ISBN-${uniqueId()}`, publisher: { connect: publisher.id } },
      });

      const result = await client.db.Publisher.upsert({
        where: { id: publisher.id },
        create: { name: 'Not This' },
        update: { name: 'Updated Publisher' },
        include: { books: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated Publisher');
      expect(Array.isArray((result as any).books)).toBe(true);
      expect((result as any).books.length).toBe(1);
      expect((result as any).books[0].title).toBe('Book 1');
    });

    test('includes publisher in book upsert result', async () => {
      const publisher = await client.db.Publisher.create({ data: { name: 'Include Pub' } });

      const isbn = `ISBN-${uniqueId()}`;
      await client.db.Book.create({
        data: { title: 'Book', isbn, publisher: { connect: publisher.id } },
      });

      const result = await client.db.Book.upsert({
        where: { isbn },
        create: { title: 'New', isbn },
        update: { title: 'Updated' },
        include: { publisher: true },
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe('Updated');
      expect((result as any).publisher).toBeDefined();
      expect((result as any).publisher.name).toBe('Include Pub');
    });

    test('includes empty books array on publisher create path', async () => {
      const result = await client.db.Publisher.upsert({
        where: { id: 'publisher:empty_inc' },
        create: { name: 'New Publisher' },
        update: { name: 'Updated' },
        include: { books: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('New Publisher');
      expect(Array.isArray((result as any).books)).toBe(true);
      expect((result as any).books.length).toBe(0);
    });
  });
});
