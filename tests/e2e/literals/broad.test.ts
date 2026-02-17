/**
 * E2E Tests: Literal Broad Types
 *
 * Tests literals with broad type variants (String, Int).
 * Covers: creating with any value of the broad type, array of broad literal, filtering.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import { isCerialId } from 'cerial';

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
        data: { value: 'hello' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.value).toBe('hello');
    });

    test('should create with int value', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: 42 },
      });

      expect(result.value).toBe(42);
    });

    test('should create with empty string', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: '' },
      });

      expect(result.value).toBe('');
    });

    test('should create with zero', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: 0 },
      });

      expect(result.value).toBe(0);
    });

    test('should create with negative int', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: -10 },
      });

      expect(result.value).toBe(-10);
    });
  });

  describe('array of broad literal', () => {
    test('should create with array of mixed broad types', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: 'x', values: ['hello', 42, 'world', 0] },
      });

      expect(result.values).toEqual(['hello', 42, 'world', 0]);
    });

    test('should create with empty array', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: 'x', values: [] },
      });

      expect(result.values).toEqual([]);
    });

    test('should default array to empty when omitted', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: 'x' },
      });

      expect(result.values).toEqual([]);
    });

    test('should create with all string values', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: 'x', values: ['a', 'b', 'c'] },
      });

      expect(result.values).toEqual(['a', 'b', 'c']);
    });

    test('should create with all int values', async () => {
      const result = await client.db.LiteralBroad.create({
        data: { value: 'x', values: [1, 2, 3] },
      });

      expect(result.values).toEqual([1, 2, 3]);
    });
  });

  describe('update broad literal', () => {
    test('should update from string to int', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { value: 'hello' },
      });

      const updated = await client.db.LiteralBroad.updateUnique({
        where: { id: created.id },
        data: { value: 99 },
      });

      expect(updated!.value).toBe(99);
    });

    test('should update from int to string', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { value: 42 },
      });

      const updated = await client.db.LiteralBroad.updateUnique({
        where: { id: created.id },
        data: { value: 'changed' },
      });

      expect(updated!.value).toBe('changed');
    });

    test('should update array with direct assignment', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { value: 'x', values: ['a', 1] },
      });

      const updated = await client.db.LiteralBroad.updateUnique({
        where: { id: created.id },
        data: { values: ['b', 2, 'c'] },
      });

      expect(updated!.values).toEqual(['b', 2, 'c']);
    });

    test('should push to array of broad literals', async () => {
      const created = await client.db.LiteralBroad.create({
        data: { value: 'x', values: ['a'] },
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
      await client.db.LiteralBroad.create({ data: { value: 'hello' } });
      await client.db.LiteralBroad.create({ data: { value: 42 } });

      const results = await client.db.LiteralBroad.findMany();

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });
});
