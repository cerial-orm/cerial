/**
 * E2E Tests: relation orderBy — negative cases
 *
 * A relation can be ordered only through a forward to-one link. Unknown fields under it, reverse
 * relations, to-many relations and a bare direction must throw, naming the field and the model.
 *
 * Schemas: core (User/Post), one-to-many-optional (Publisher/Book), many-to-many (Student/Course)
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type CerialClient, createTestClient, testConfig } from '../test-helper';

describe('Relation orderBy — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  test('unknown field under a relation names the path and the target model', () => {
    // @ts-expect-error — 'nmae' is not a Publisher field, testing runtime guard
    expect(() => client.db.Book.findMany({ orderBy: { publisher: { nmae: 'asc' } } })).toThrow(
      "Invalid orderBy: Unknown field 'publisher.nmae' on model Publisher",
    );
  });

  test('unknown field under a relation on findOne', () => {
    // @ts-expect-error — 'nmae' is not a Publisher field, testing runtime guard
    expect(() => client.db.Book.findOne({ orderBy: { publisher: { nmae: 'asc' } } })).toThrow(
      "Unknown field 'publisher.nmae' on model Publisher",
    );
  });

  test('unknown field two links deep names the full path', () => {
    expect(() =>
      client.db.CategoryTree.findMany({
        // @ts-expect-error — 'nmae' is not a CategoryTree field, testing runtime guard
        orderBy: { parent: { parent: { nmae: 'asc' } } },
      }),
    ).toThrow("Unknown field 'parent.parent.nmae' on model CategoryTree");
  });

  test('hostile key under a relation is rejected, not interpolated', () => {
    // @ts-expect-error — not a field, testing runtime guard
    expect(() => client.db.Book.findMany({ orderBy: { publisher: { 'name; DELETE book': 'asc' } } })).toThrow(
      'Invalid orderBy: Unknown field',
    );
  });

  test('invalid direction under a relation', () => {
    // @ts-expect-error — 'sideways' is not a direction, testing runtime guard
    expect(() => client.db.Book.findMany({ orderBy: { publisher: { name: 'sideways' } } })).toThrow(
      "Order direction for 'publisher.name' must be 'asc' or 'desc'",
    );
  });

  test('a relation given a direction instead of a target field', () => {
    // @ts-expect-error — a relation takes an object of target fields, testing runtime guard
    expect(() => client.db.Book.findMany({ orderBy: { publisher: 'asc' } })).toThrow(
      "Cannot order by relation 'publisher' on model Book directly",
    );
  });

  test('reverse relation is rejected with its own message', () => {
    // @ts-expect-error — reverse relations are not in the OrderBy type, testing runtime guard
    expect(() => client.db.Publisher.findMany({ orderBy: { books: { title: 'asc' } } })).toThrow(
      "Invalid orderBy: Cannot order by reverse relation 'books' on model Publisher",
    );
  });

  test('reverse relation reached through a link is rejected', () => {
    expect(() =>
      client.db.CategoryTree.findMany({
        // @ts-expect-error — reverse relations are not in the OrderBy type, testing runtime guard
        orderBy: { parent: { children: { name: 'asc' } } },
      }),
    ).toThrow("reverse relation 'parent.children' on model CategoryTree");
  });

  test('to-many relation is rejected', () => {
    // @ts-expect-error — to-many relations are not in the OrderBy type, testing runtime guard
    expect(() => client.db.Student.findMany({ orderBy: { courses: { name: 'asc' } } })).toThrow(
      "Invalid orderBy: Cannot order by to-many relation 'courses' on model Student",
    );
  });
});
