/**
 * E2E Tests: Literal Numeric-Only
 *
 * Tests numeric-only literal type (NumericOnly = 1 | 2 | 3 | 4 | 5).
 * Covers: create, update, optional numeric literal, numeric where operators.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';
import { isCerialId } from 'cerial';

describe('E2E Literals: Numeric Only', () => {
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

  describe('create', () => {
    test('should create with each numeric literal value', async () => {
      for (const rank of [1, 2, 3, 4, 5] as const) {
        const result = await client.db.LiteralNumeric.create({ data: { rank } });
        expect(isCerialId(result.id)).toBe(true);
        expect(result.rank).toBe(rank);
      }
    });

    test('should create with optional numeric literal omitted', async () => {
      const result = await client.db.LiteralNumeric.create({ data: { rank: 1 } });

      expect(result.optRank).toBeUndefined();
    });

    test('should create with optional numeric literal provided', async () => {
      const result = await client.db.LiteralNumeric.create({ data: { rank: 1, optRank: 3 } });

      expect(result.optRank).toBe(3);
    });
  });

  describe('update', () => {
    test('should update numeric literal value', async () => {
      const created = await client.db.LiteralNumeric.create({ data: { rank: 1 } });

      const updated = await client.db.LiteralNumeric.updateUnique({
        where: { id: created.id },
        data: { rank: 5 },
      });

      expect(updated!.rank).toBe(5);
    });

    test('should set optional numeric literal', async () => {
      const created = await client.db.LiteralNumeric.create({ data: { rank: 1 } });

      const updated = await client.db.LiteralNumeric.updateUnique({
        where: { id: created.id },
        data: { optRank: 2 },
      });

      expect(updated!.optRank).toBe(2);
    });

    test('should update optional numeric literal to different value', async () => {
      const created = await client.db.LiteralNumeric.create({ data: { rank: 1, optRank: 2 } });

      const updated = await client.db.LiteralNumeric.updateUnique({
        where: { id: created.id },
        data: { optRank: 4 },
      });

      expect(updated!.optRank).toBe(4);
    });
  });

  describe('findMany with all records', () => {
    beforeEach(async () => {
      await client.db.LiteralNumeric.create({ data: { rank: 1, optRank: 5 } });
      await client.db.LiteralNumeric.create({ data: { rank: 2, optRank: 4 } });
      await client.db.LiteralNumeric.create({ data: { rank: 3, optRank: 3 } });
      await client.db.LiteralNumeric.create({ data: { rank: 4, optRank: 2 } });
      await client.db.LiteralNumeric.create({ data: { rank: 5, optRank: 1 } });
    });

    test('should find all numeric literal records', async () => {
      const results = await client.db.LiteralNumeric.findMany();

      expect(results.length).toBe(5);
    });

    test('should filter by exact numeric value', async () => {
      const results = await client.db.LiteralNumeric.findMany({ where: { rank: 3 } });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.rank).toBe(3);
      expect(results[0]!.optRank).toBe(3);
    });

    test('should filter optional numeric literal by value', async () => {
      const results = await client.db.LiteralNumeric.findMany({ where: { optRank: 1 } });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.rank).toBe(5);
    });
  });

  describe('delete with numeric literal filter', () => {
    test('should deleteMany filtered by numeric literal', async () => {
      await client.db.LiteralNumeric.create({ data: { rank: 1 } });
      await client.db.LiteralNumeric.create({ data: { rank: 2 } });
      await client.db.LiteralNumeric.create({ data: { rank: 3 } });

      const count = await client.db.LiteralNumeric.deleteMany({ where: { rank: { lte: 2 } } });

      expect(count).toBe(2);
    });
  });
});
