/**
 * E2E Tests: Literal Filtering
 *
 * Tests where clause operators for literal fields.
 * Covers: eq (direct), neq, in, notIn, numeric comparison ops (gt/gte/lt/lte/between),
 * broad string ops (contains/startsWith/endsWith), array literal ops (has/hasAll/hasAny/isEmpty),
 * nullable literal filtering, AND/OR/NOT logical operators.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../relations/test-helper';

describe('E2E Literals: Filtering', () => {
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

  describe('string literal filters (Status)', () => {
    beforeEach(async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'inactive', priority: 2, mixed: 'high' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'pending', priority: 3, mixed: true },
      });
    });

    test('should filter by direct value (eq shorthand)', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { status: 'active' },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });

    test('should filter by eq operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { status: { eq: 'inactive' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('B');
    });

    test('should filter by neq operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { status: { neq: 'active' } },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.name === 'B')).toBe(true);
      expect(results.some((r) => r.name === 'C')).toBe(true);
    });

    test('should filter by in operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { status: { in: ['active', 'pending'] } },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.name === 'A')).toBe(true);
      expect(results.some((r) => r.name === 'C')).toBe(true);
    });

    test('should filter by notIn operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { status: { notIn: ['active', 'pending'] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('B');
    });
  });

  describe('int literal filters (Priority)', () => {
    beforeEach(async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 2, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 3, mixed: 'low' },
      });
    });

    test('should filter by direct int value', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { priority: 2 },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('B');
    });

    test('should filter by gt operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { priority: { gt: 1 } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by gte operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { priority: { gte: 2 } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by lt operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { priority: { lt: 3 } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by lte operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { priority: { lte: 2 } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by between operator', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { priority: { between: [1, 2] } },
      });

      expect(results.length).toBe(2);
    });
  });

  describe('numeric-only literal filters (NumericOnly)', () => {
    beforeEach(async () => {
      await client.db.LiteralNumeric.create({ data: { rank: 1 } });
      await client.db.LiteralNumeric.create({ data: { rank: 3 } });
      await client.db.LiteralNumeric.create({ data: { rank: 5 } });
    });

    test('should filter numeric literal by direct value', async () => {
      const results = await client.db.LiteralNumeric.findMany({
        where: { rank: 3 },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.rank).toBe(3);
    });

    test('should filter numeric literal by gt', async () => {
      const results = await client.db.LiteralNumeric.findMany({
        where: { rank: { gt: 2 } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter numeric literal by between', async () => {
      const results = await client.db.LiteralNumeric.findMany({
        where: { rank: { between: [2, 4] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.rank).toBe(3);
    });

    test('should filter numeric literal by in', async () => {
      const results = await client.db.LiteralNumeric.findMany({
        where: { rank: { in: [1, 5] } },
      });

      expect(results.length).toBe(2);
    });
  });

  describe('broad literal filters (Broad = String | Int)', () => {
    beforeEach(async () => {
      await client.db.LiteralBroad.create({ data: { value: 'hello world' } });
      await client.db.LiteralBroad.create({ data: { value: 42 } });
      await client.db.LiteralBroad.create({ data: { value: 'test string' } });
    });

    test('should filter broad literal by direct string value', async () => {
      const results = await client.db.LiteralBroad.findMany({
        where: { value: 'hello world' },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.value).toBe('hello world');
    });

    test('should filter broad literal by direct int value', async () => {
      const results = await client.db.LiteralBroad.findMany({
        where: { value: 42 },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.value).toBe(42);
    });

    // String operators (contains/startsWith/endsWith) on broad literals (String | Int)
    // fail at runtime when any record has a non-string value, because SurrealDB's
    // string::contains/string::starts_with/string::ends_with cannot operate on integers.

    test('should fail broad literal contains when non-string values exist', async () => {
      const query = client.db.LiteralBroad.findMany({
        where: { value: { contains: 'world' } },
      });

      await expect(
        (async () => {
          await query;
        })(),
      ).rejects.toThrow();
    });

    test('should fail broad literal startsWith when non-string values exist', async () => {
      const query = client.db.LiteralBroad.findMany({
        where: { value: { startsWith: 'test' } },
      });

      await expect(
        (async () => {
          await query;
        })(),
      ).rejects.toThrow();
    });

    test('should fail broad literal endsWith when non-string values exist', async () => {
      const query = client.db.LiteralBroad.findMany({
        where: { value: { endsWith: 'string' } },
      });

      await expect(
        (async () => {
          await query;
        })(),
      ).rejects.toThrow();
    });

    test('should filter broad literal by in with mixed types', async () => {
      const results = await client.db.LiteralBroad.findMany({
        where: { value: { in: ['hello world', 42] } },
      });

      expect(results.length).toBe(2);
    });
  });

  describe('array literal filters', () => {
    beforeEach(async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low', statuses: ['active', 'pending'] },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 1, mixed: 'low', statuses: ['inactive'] },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 1, mixed: 'low', statuses: [] },
      });
    });

    test('should filter array literal by has', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { statuses: { has: 'active' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });

    test('should filter array literal by hasAny', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { statuses: { hasAny: ['active', 'inactive'] } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter array literal by hasAll', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { statuses: { hasAll: ['active', 'pending'] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });

    test('should filter array literal by isEmpty true', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { statuses: { isEmpty: true } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('C');
    });

    test('should filter array literal by isEmpty false', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { statuses: { isEmpty: false } },
      });

      expect(results.length).toBe(2);
    });
  });

  describe('broad array literal filters', () => {
    beforeEach(async () => {
      await client.db.LiteralBroad.create({
        data: { value: 'x', values: ['hello', 42, 'world'] },
      });
      await client.db.LiteralBroad.create({
        data: { value: 'y', values: [1, 2, 3] },
      });
      await client.db.LiteralBroad.create({
        data: { value: 'z', values: [] },
      });
    });

    test('should filter broad array by has string', async () => {
      const results = await client.db.LiteralBroad.findMany({
        where: { values: { has: 'hello' } },
      });

      expect(results.length).toBe(1);
    });

    test('should filter broad array by has int', async () => {
      const results = await client.db.LiteralBroad.findMany({
        where: { values: { has: 42 } },
      });

      expect(results.length).toBe(1);
    });

    test('should filter broad array by isEmpty', async () => {
      const results = await client.db.LiteralBroad.findMany({
        where: { values: { isEmpty: true } },
      });

      expect(results.length).toBe(1);
    });
  });

  describe('nullable literal filters', () => {
    beforeEach(async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low', nullStatus: 'active' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 1, mixed: 'low', nullStatus: null },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 1, mixed: 'low' },
      });
    });

    test('should filter nullable literal by value', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { nullStatus: 'active' },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });

    test('should filter nullable literal by null', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { nullStatus: null },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('B');
    });
  });

  describe('extended literal filters', () => {
    beforeEach(async () => {
      await client.db.LiteralExtended.create({ data: { status: 'active' } });
      await client.db.LiteralExtended.create({ data: { status: 'archived' } });
      await client.db.LiteralExtended.create({ data: { status: 'deleted' } });
    });

    test('should filter extended literal by original value', async () => {
      const results = await client.db.LiteralExtended.findMany({
        where: { status: 'active' },
      });

      expect(results.length).toBe(1);
    });

    test('should filter extended literal by new value', async () => {
      const results = await client.db.LiteralExtended.findMany({
        where: { status: 'archived' },
      });

      expect(results.length).toBe(1);
    });

    test('should filter extended literal by in with mixed base/extension', async () => {
      const results = await client.db.LiteralExtended.findMany({
        where: { status: { in: ['active', 'deleted'] } },
      });

      expect(results.length).toBe(2);
    });
  });

  describe('logical operators with literals', () => {
    beforeEach(async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'inactive', priority: 2, mixed: 'high' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'pending', priority: 3, mixed: true },
      });
    });

    test('should filter with AND on multiple literal fields', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { AND: [{ status: 'active' }, { priority: 1 }] },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });

    test('should filter with OR on literal fields', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { OR: [{ status: 'active' }, { status: 'pending' }] },
      });

      expect(results.length).toBe(2);
    });

    test('should filter with NOT on literal field', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { NOT: { status: 'active' } },
      });

      expect(results.length).toBe(2);
    });

    test('should combine literal filter with string filter', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { status: 'active', name: { startsWith: 'A' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });
  });
});
