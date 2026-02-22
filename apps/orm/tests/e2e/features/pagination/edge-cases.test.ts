import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Pagination Edge Cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);

    await client.db.User.create({
      data: {
        email: 'alice@example.com',
        name: 'Alice',
        isActive: true,
      },
    });

    await client.db.User.create({
      data: {
        email: 'bob@example.com',
        name: 'Bob',
        isActive: true,
      },
    });

    await client.db.User.create({
      data: {
        email: 'charlie@example.com',
        name: 'Charlie',
        isActive: false,
      },
    });

    await client.db.User.create({
      data: {
        email: 'diana@example.com',
        name: 'Diana',
        isActive: true,
      },
    });

    await client.db.User.create({
      data: {
        email: 'eve@example.com',
        name: 'Eve',
        isActive: false,
      },
    });
  });

  describe('limit: 0', () => {
    test('should return empty array when limit is 0', async () => {
      const results = await client.db.User.findMany({
        limit: 0,
      });

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });

    test('should return empty array with limit: 0 and offset', async () => {
      const results = await client.db.User.findMany({
        limit: 0,
        offset: 2,
      });

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });

    test('should return empty array with limit: 0 and where clause', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: true },
        limit: 0,
      });

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });
  });

  describe('offset greater than total records', () => {
    test('should return empty array when offset exceeds total records', async () => {
      const results = await client.db.User.findMany({
        offset: 10,
      });

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });

    test('should return empty array when offset equals total records', async () => {
      const results = await client.db.User.findMany({
        offset: 5,
      });

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });

    test('should return empty array with offset > total and limit specified', async () => {
      const results = await client.db.User.findMany({
        offset: 10,
        limit: 5,
      });

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });

    test('should return empty array with offset > total and where clause', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: true },
        offset: 10,
      });

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });
  });

  describe('limit: 1', () => {
    test('should return exactly 1 record when limit is 1', async () => {
      const results = await client.db.User.findMany({
        limit: 1,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('Alice');
    });

    test('should return exactly 1 record with limit: 1 and offset', async () => {
      const results = await client.db.User.findMany({
        limit: 1,
        offset: 2,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('Charlie');
    });

    test('should return exactly 1 record with limit: 1 and where clause', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: false },
        limit: 1,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('Charlie');
    });

    test('should return exactly 1 record with limit: 1 and orderBy', async () => {
      const results = await client.db.User.findMany({
        limit: 1,
        orderBy: { name: 'desc' },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('Eve');
    });
  });

  describe('limit + offset combinations', () => {
    test('should return correct slice with limit and offset', async () => {
      const results = await client.db.User.findMany({
        limit: 2,
        offset: 1,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.name).toBe('Bob');
      expect(results[1]?.name).toBe('Charlie');
    });

    test('should return correct slice with limit: 3 and offset: 2', async () => {
      const results = await client.db.User.findMany({
        limit: 3,
        offset: 2,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(3);
      expect(results[0]?.name).toBe('Charlie');
      expect(results[1]?.name).toBe('Diana');
      expect(results[2]?.name).toBe('Eve');
    });

    test('should return partial slice when limit exceeds remaining records', async () => {
      const results = await client.db.User.findMany({
        limit: 10,
        offset: 3,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.name).toBe('Diana');
      expect(results[1]?.name).toBe('Eve');
    });

    test('should return correct slice with limit: 1 and offset: 4', async () => {
      const results = await client.db.User.findMany({
        limit: 1,
        offset: 4,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('Eve');
    });
  });

  describe('limit + offset + orderBy', () => {
    test('should return correctly ordered slice with limit and offset', async () => {
      const results = await client.db.User.findMany({
        limit: 2,
        offset: 1,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.name).toBe('Bob');
      expect(results[1]?.name).toBe('Charlie');
    });

    test('should return correctly ordered slice with descending order', async () => {
      const results = await client.db.User.findMany({
        limit: 2,
        offset: 1,
        orderBy: { name: 'desc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.name).toBe('Diana');
      expect(results[1]?.name).toBe('Charlie');
    });

    test('should return correctly ordered slice with offset: 0', async () => {
      const results = await client.db.User.findMany({
        limit: 3,
        offset: 0,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(3);
      expect(results[0]?.name).toBe('Alice');
      expect(results[1]?.name).toBe('Bob');
      expect(results[2]?.name).toBe('Charlie');
    });

    test('should return correctly ordered slice with large offset', async () => {
      const results = await client.db.User.findMany({
        limit: 2,
        offset: 3,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.name).toBe('Diana');
      expect(results[1]?.name).toBe('Eve');
    });
  });

  describe('limit + offset + where', () => {
    test('should return filtered slice with limit and offset', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: true },
        limit: 2,
        offset: 0,
      });

      expect(results.length).toBe(2);
      expect(results.every((u) => u.isActive === true)).toBe(true);
    });

    test('should return filtered slice with offset greater than filtered count', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: false },
        limit: 5,
        offset: 2,
      });

      expect(results).toEqual([]);
    });

    test('should return filtered slice with limit: 1', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: true },
        limit: 1,
        offset: 1,
      });

      expect(results.length).toBe(1);
      expect(results[0]?.isActive).toBe(true);
    });

    test('should return filtered slice with limit and offset and orderBy', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: true },
        limit: 2,
        offset: 0,
        orderBy: { name: 'desc' },
      });

      expect(results.length).toBe(2);
      expect(results.every((u) => u.isActive === true)).toBe(true);
      expect(results[0]?.name).toBe('Diana');
    });
  });

  describe('offset: 0 equivalence', () => {
    test('should return same results with offset: 0 as without offset', async () => {
      const withoutOffset = await client.db.User.findMany({
        limit: 2,
      });

      const withOffset = await client.db.User.findMany({
        limit: 2,
        offset: 0,
      });

      expect(withoutOffset).toEqual(withOffset);
    });

    test('should return same results with offset: 0 and orderBy', async () => {
      const withoutOffset = await client.db.User.findMany({
        limit: 3,
        orderBy: { name: 'asc' },
      });

      const withOffset = await client.db.User.findMany({
        limit: 3,
        offset: 0,
        orderBy: { name: 'asc' },
      });

      expect(withoutOffset).toEqual(withOffset);
    });

    test('should return same results with offset: 0 and where', async () => {
      const withoutOffset = await client.db.User.findMany({
        where: { isActive: true },
        limit: 2,
      });

      const withOffset = await client.db.User.findMany({
        where: { isActive: true },
        limit: 2,
        offset: 0,
      });

      expect(withoutOffset).toEqual(withOffset);
    });
  });

  describe('large limit (greater than total records)', () => {
    test('should return all records when limit exceeds total', async () => {
      const results = await client.db.User.findMany({
        limit: 100,
      });

      expect(results.length).toBe(5);
    });

    test('should return all records with large limit and offset: 0', async () => {
      const results = await client.db.User.findMany({
        limit: 1000,
        offset: 0,
      });

      expect(results.length).toBe(5);
    });

    test('should return remaining records with large limit and offset', async () => {
      const results = await client.db.User.findMany({
        limit: 100,
        offset: 2,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(3);
      expect(results[0]?.name).toBe('Charlie');
      expect(results[1]?.name).toBe('Diana');
      expect(results[2]?.name).toBe('Eve');
    });

    test('should return all filtered records with large limit', async () => {
      const results = await client.db.User.findMany({
        where: { isActive: true },
        limit: 100,
      });

      expect(results.length).toBe(3);
      expect(results.every((u) => u.isActive === true)).toBe(true);
    });

    test('should return all records in correct order with large limit and orderBy', async () => {
      const results = await client.db.User.findMany({
        limit: 100,
        orderBy: { name: 'asc' },
      });

      expect(results.length).toBe(5);
      expect(results[0]?.name).toBe('Alice');
      expect(results[1]?.name).toBe('Bob');
      expect(results[2]?.name).toBe('Charlie');
      expect(results[3]?.name).toBe('Diana');
      expect(results[4]?.name).toBe('Eve');
    });
  });
});
