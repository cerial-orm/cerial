/**
 * E2E Tests: One-to-Many Optional - Update Operations
 *
 * Schema: one-to-many-optional.cerial
 * Tests connect/disconnect for optional parent relation.
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
} from '../../../test-helper';

describe('E2E One-to-Many Optional: Update', () => {
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

  describe('connect', () => {
    test('should connect orphan book to publisher', async () => {
      const book = await client.db.Book.create({
        data: { title: 'Orphan', isbn: `ISBN-${uniqueId()}` },
      });

      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      expect(book.publisherId).toBeNull();

      const updated = await client.db.Book.updateMany({
        where: { id: book.id },
        data: {
          publisher: { connect: publisher.id },
        },
      });

      expect(updated[0]?.publisherId?.equals(publisher.id)).toBe(true);
    });

    test('should connect via publisher update', async () => {
      const book = await client.db.Book.create({
        data: { title: 'Orphan', isbn: `ISBN-${uniqueId()}` },
      });

      const publisher = await client.db.Publisher.create({
        data: { name: 'Publisher' },
      });

      await client.db.Publisher.updateMany({
        where: { id: publisher.id },
        data: {
          books: { connect: [book.id] },
        },
      });

      const updatedBook = await client.db.Book.findOne({
        where: { id: book.id },
      });
      expect(updatedBook?.publisherId?.equals(publisher.id)).toBe(true);
    });
  });

  describe('disconnect', () => {
    test('should disconnect book from publisher', async () => {
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

      expect(book.publisherId?.equals(publisher.id)).toBe(true);

      // Disconnect
      const updated = await client.db.Book.updateMany({
        where: { id: book.id },
        data: {
          publisher: { disconnect: true },
        },
      });

      expect(updated[0]?.publisherId).toBeNull();
    });

    test('should disconnect via setting publisherId to null', async () => {
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

      const updated = await client.db.Book.updateMany({
        where: { id: book.id },
        data: { publisherId: null },
      });

      expect(updated[0]?.publisherId).toBeNull();
    });
  });

  describe('reassign', () => {
    test('should move book to different publisher', async () => {
      const pub1 = await client.db.Publisher.create({
        data: { name: 'Publisher 1' },
      });
      const pub2 = await client.db.Publisher.create({
        data: { name: 'Publisher 2' },
      });

      const book = await client.db.Book.create({
        data: {
          title: 'Moving Book',
          isbn: `ISBN-${uniqueId()}`,
          publisher: { connect: pub1.id },
        },
      });

      // Reassign to pub2
      const updated = await client.db.Book.updateMany({
        where: { id: book.id },
        data: {
          publisher: { connect: pub2.id },
        },
      });

      expect(updated[0]?.publisherId?.equals(pub2.id)).toBe(true);
    });
  });
});
