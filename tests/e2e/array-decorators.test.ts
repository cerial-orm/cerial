/**
 * E2E Tests for @distinct and @sort Array Decorators
 *
 * Tests the behavior of @distinct and @sort decorators on primitive array fields.
 * These decorators apply VALUE clauses in SurrealDB migrations:
 * - @distinct: VALUE IF $value THEN $value.distinct() ELSE [] END
 * - @sort: VALUE IF $value THEN $value.sort::asc() ELSE [] END
 * - @sort(false): VALUE IF $value THEN $value.sort::desc() ELSE [] END
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, testConfig } from './test-client';

describe('E2E Array Decorators (@distinct and @sort)', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client);
  });

  describe('@distinct decorator', () => {
    test('should store unique values only on create', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-distinct-1',
          uniqueTags: ['a', 'b', 'a', 'c', 'b', 'a'],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      // Should remove duplicates, resulting in 3 unique values
      expect(record.uniqueTags).toHaveLength(3);
      expect(record.uniqueTags).toContain('a');
      expect(record.uniqueTags).toContain('b');
      expect(record.uniqueTags).toContain('c');
    });

    test('should store unique values only on update', async () => {
      await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-distinct-2',
          uniqueTags: ['x'],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      const updated = await client.db.ArrayDecoratorTest.updateMany({
        where: { id: 'test-distinct-2' },
        data: { uniqueTags: ['x', 'y', 'x', 'z', 'y', 'x'] },
      });

      expect(updated[0]?.uniqueTags).toHaveLength(3);
      expect(updated[0]?.uniqueTags).toContain('x');
      expect(updated[0]?.uniqueTags).toContain('y');
      expect(updated[0]?.uniqueTags).toContain('z');
    });

    test('should compare with normal array that keeps duplicates', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-distinct-compare',
          uniqueTags: ['a', 'b', 'a'],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: ['a', 'b', 'a'], // Same values but no @distinct
          normalScores: [],
        },
      });

      // uniqueTags should have duplicates removed
      expect(record.uniqueTags).toHaveLength(2);

      // normalTags should keep duplicates
      expect(record.normalTags).toHaveLength(3);
      expect(record.normalTags).toEqual(['a', 'b', 'a']);
    });
  });

  describe('@sort decorator (ascending)', () => {
    test('should store values in ascending order on create', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-sort-asc-1',
          uniqueTags: [],
          sortedScores: [50, 20, 80, 10, 90],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      expect(record.sortedScores).toEqual([10, 20, 50, 80, 90]);
    });

    test('should store values in ascending order on update', async () => {
      await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-sort-asc-2',
          uniqueTags: [],
          sortedScores: [100],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      const updated = await client.db.ArrayDecoratorTest.updateMany({
        where: { id: 'test-sort-asc-2' },
        data: { sortedScores: [30, 10, 50, 20, 40] },
      });

      expect(updated[0]?.sortedScores).toEqual([10, 20, 30, 40, 50]);
    });

    test('should compare with normal array that keeps original order', async () => {
      const values = [50, 20, 80, 10, 90];
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-sort-compare',
          uniqueTags: [],
          sortedScores: values,
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: values, // Same values but no @sort
        },
      });

      // sortedScores should be sorted ascending
      expect(record.sortedScores).toEqual([10, 20, 50, 80, 90]);

      // normalScores should keep original order
      expect(record.normalScores).toEqual([50, 20, 80, 10, 90]);
    });
  });

  describe('@sort(false) decorator (descending)', () => {
    test('should store dates in descending order on create', async () => {
      const dates = [new Date('2024-01-15'), new Date('2024-03-01'), new Date('2024-02-10')];

      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-sort-desc-1',
          uniqueTags: [],
          sortedScores: [],
          recentDates: dates,
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      // Should be sorted descending (most recent first)
      expect(record.recentDates).toHaveLength(3);
      expect(record.recentDates[0]?.getTime()).toBe(new Date('2024-03-01').getTime());
      expect(record.recentDates[1]?.getTime()).toBe(new Date('2024-02-10').getTime());
      expect(record.recentDates[2]?.getTime()).toBe(new Date('2024-01-15').getTime());
    });

    test('should store dates in descending order on update', async () => {
      await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-sort-desc-2',
          uniqueTags: [],
          sortedScores: [],
          recentDates: [new Date('2024-06-01')],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      const newDates = [new Date('2024-04-01'), new Date('2024-08-01'), new Date('2024-02-01')];
      const updated = await client.db.ArrayDecoratorTest.updateMany({
        where: { id: 'test-sort-desc-2' },
        data: { recentDates: newDates },
      });

      expect(updated[0]?.recentDates).toHaveLength(3);
      expect(updated[0]?.recentDates[0]?.getTime()).toBe(new Date('2024-08-01').getTime());
      expect(updated[0]?.recentDates[1]?.getTime()).toBe(new Date('2024-04-01').getTime());
      expect(updated[0]?.recentDates[2]?.getTime()).toBe(new Date('2024-02-01').getTime());
    });
  });

  describe('@distinct @sort combined (ascending)', () => {
    test('should store unique values in ascending order on create', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-both-asc-1',
          uniqueTags: [],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: ['zebra', 'apple', 'banana', 'apple', 'zebra', 'cherry'],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      // Should be unique AND sorted alphabetically
      expect(record.uniqueSortedCategories).toEqual(['apple', 'banana', 'cherry', 'zebra']);
    });

    test('should store unique values in ascending order on update', async () => {
      await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-both-asc-2',
          uniqueTags: [],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: ['initial'],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      const updated = await client.db.ArrayDecoratorTest.updateMany({
        where: { id: 'test-both-asc-2' },
        data: { uniqueSortedCategories: ['dog', 'cat', 'bird', 'cat', 'dog', 'ant'] },
      });

      expect(updated[0]?.uniqueSortedCategories).toEqual(['ant', 'bird', 'cat', 'dog']);
    });
  });

  describe('@distinct @sort(false) combined (descending)', () => {
    test('should store unique integers in descending order on create', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-both-desc-1',
          uniqueTags: [],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [3, 1, 4, 1, 5, 9, 2, 6, 5, 3],
          normalTags: [],
          normalScores: [],
        },
      });

      // Should be unique AND sorted descending
      expect(record.uniqueSortedPriorities).toEqual([9, 6, 5, 4, 3, 2, 1]);
    });

    test('should store unique integers in descending order on update', async () => {
      await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-both-desc-2',
          uniqueTags: [],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [100],
          normalTags: [],
          normalScores: [],
        },
      });

      const updated = await client.db.ArrayDecoratorTest.updateMany({
        where: { id: 'test-both-desc-2' },
        data: { uniqueSortedPriorities: [5, 2, 8, 2, 5, 1] },
      });

      expect(updated[0]?.uniqueSortedPriorities).toEqual([8, 5, 2, 1]);
    });
  });

  describe('Empty arrays', () => {
    test('should handle empty arrays with @distinct', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-empty-distinct',
          uniqueTags: [],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      expect(record.uniqueTags).toEqual([]);
    });

    test('should handle empty arrays with @sort', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-empty-sort',
          uniqueTags: [],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      expect(record.sortedScores).toEqual([]);
      expect(record.recentDates).toEqual([]);
    });
  });

  describe('Single element arrays', () => {
    test('should handle single element with @distinct', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-single-distinct',
          uniqueTags: ['only'],
          sortedScores: [],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      expect(record.uniqueTags).toEqual(['only']);
    });

    test('should handle single element with @sort', async () => {
      const record = await client.db.ArrayDecoratorTest.create({
        data: {
          id: 'test-single-sort',
          uniqueTags: [],
          sortedScores: [42],
          recentDates: [],
          uniqueSortedCategories: [],
          uniqueSortedPriorities: [],
          normalTags: [],
          normalScores: [],
        },
      });

      expect(record.sortedScores).toEqual([42]);
    });
  });
});
