/**
 * E2E Tests: Literal Broad Types
 *
 * Tests literals with broad type variants (String, Int).
 * Covers: creating with any value of the broad type, array of broad literal, filtering.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Literals: Broad Types', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.literals);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.literals);
  });

  describe('create with broad literal', () => {
    test('should create with string value', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 'hello' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.payload).toBe('hello');
    });

    test('should create with int value', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 42 },
      });

      expect(result.payload).toBe(42);
    });

    test('should create with empty string', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: '' },
      });

      expect(result.payload).toBe('');
    });

    test('should create with zero', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 0 },
      });

      expect(result.payload).toBe(0);
    });

    test('should create with negative int', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: -10 },
      });

      expect(result.payload).toBe(-10);
    });
  });

  describe('array of broad literal', () => {
    test('should create with array of mixed broad types', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 'x', values: ['hello', 42, 'world', 0] },
      });

      expect(result.values).toEqual(['hello', 42, 'world', 0]);
    });

    test('should create with empty array', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 'x', values: [] },
      });

      expect(result.values).toEqual([]);
    });

    test('should default array to empty when omitted', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 'x' },
      });

      expect(result.values).toEqual([]);
    });

    test('should create with all string values', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 'x', values: ['a', 'b', 'c'] },
      });

      expect(result.values).toEqual(['a', 'b', 'c']);
    });

    test('should create with all int values', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { payload: 'x', values: [1, 2, 3] },
      });

      expect(result.values).toEqual([1, 2, 3]);
    });
  });

  describe('update broad literal', () => {
    test('should update from string to int', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { payload: 'hello' },
      });

      const updated = await client.db.LiteralBroad.updateUnique({
        where: { id: created.id },
        data: { payload: 99 },
      });

      expect(updated!.payload).toBe(99);
    });

    test('should update from int to string', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { payload: 42 },
      });

      const updated = await client.db.LiteralBroad.updateUnique({
        where: { id: created.id },
        data: { payload: 'changed' },
      });

      expect(updated!.payload).toBe('changed');
    });

    test('should update array with direct assignment', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { payload: 'x', values: ['a', 1] },
      });

      const updated = await client.db.LiteralBroad.updateUnique({
        where: { id: created.id },
        data: { values: ['b', 2, 'c'] },
      });

      expect(updated!.values).toEqual(['b', 2, 'c']);
    });

    test('should push to array of broad literals', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { payload: 'x', values: ['a'] },
      });

      const updated = await client.db.LiteralBroad.updateUnique({
        where: { id: created.id },
        data: { values: { push: 42 } },
      });

      expect(updated!.values).toContain('a');
      expect(updated!.values).toContain(42);
    });
  });

  describe('findMany broad literal', () => {
    test('should find all records', async () => {
      await client.db.LiteralBroad.create({ data: { payload: 'hello' } });
      await client.db.LiteralBroad.create({ data: { payload: 42 } });

      const results = await client.db.LiteralBroad.findMany();

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });
});
