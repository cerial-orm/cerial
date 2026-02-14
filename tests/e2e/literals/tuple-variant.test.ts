/**
 * E2E Tests: Literal with Tuple Variant
 *
 * Tests CRUD operations for literal fields that include a tuple variant.
 * literal WithTuple { 'none', LiteralCoord }
 * LiteralCoord = tuple { x Float, y Float }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../relations/test-helper';
import { NONE, isCerialId } from 'cerial';

describe('E2E Literals: Tuple Variant', () => {
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
    test('should create with string variant', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: 'none' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.payload).toBe('none');
    });

    test('should create with tuple variant (array form)', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: [1.5, 2.5] },
      });

      expect(result.payload).toEqual([1.5, 2.5]);
    });

    test('should create with tuple variant (object form)', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: { x: 3.0, y: 4.0 } },
      });

      // Output is always array form
      expect(result.payload).toEqual([3.0, 4.0]);
    });

    test('should create with optional tuple variant set', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: 'none', optPayload: [10, 20] },
      });

      expect(result.payload).toBe('none');
      expect(result.optPayload).toEqual([10, 20]);
    });

    test('should create with optional tuple variant as string', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: [1, 2], optPayload: 'none' },
      });

      expect(result.payload).toEqual([1, 2]);
      expect(result.optPayload).toBe('none');
    });

    test('should create with optional omitted (undefined)', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: 'none' },
      });

      expect(result.optPayload).toBeUndefined();
    });

    test('should create with array of mixed literal values', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: ['none', [1, 2], [3, 4]] },
      });

      expect(result.payloads).toEqual(['none', [1, 2], [3, 4]]);
    });

    test('should create with empty array', async () => {
      const result = await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: [] },
      });

      expect(result.payloads).toEqual([]);
    });
  });

  describe('read', () => {
    test('should findUnique and return correct variant types', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: [5.5, 6.5] },
      });

      const found = await client.db.LiteralWithTuple.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.payload).toEqual([5.5, 6.5]);
    });

    test('should findMany with string and tuple values', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: 'none' } });
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });

      const results = await client.db.LiteralWithTuple.findMany();

      expect(results.length).toBe(2);
      const payloads = results.map((r) => r.payload);
      expect(payloads).toContainEqual('none');
      expect(payloads).toContainEqual([1, 2]);
    });
  });

  describe('update', () => {
    test('should update from string to tuple', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: 'none' },
      });

      const updated = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: { payload: [7, 8] },
      });

      expect(updated!.payload).toEqual([7, 8]);
    });

    test('should update from tuple to string', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: [1, 2] },
      });

      const updated = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: { payload: 'none' },
      });

      expect(updated!.payload).toBe('none');
    });

    test('should update optional from undefined to tuple', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: 'none' },
      });

      const updated = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: { optPayload: [9, 10] },
      });

      expect(updated!.optPayload).toEqual([9, 10]);
    });

    test('should clear optional with NONE', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: 'none', optPayload: [1, 2] },
      });

      const updated = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: { optPayload: NONE },
      });

      expect(updated!.optPayload).toBeUndefined();
    });

    test('should update with unset on optional', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: 'none', optPayload: [5, 6] },
      });

      const updated = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: {},
        unset: { optPayload: true },
      });

      expect(updated!.optPayload).toBeUndefined();
    });

    test('should update array with push (string variant)', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: [[1, 2]] },
      });

      const updated = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: { payloads: { push: 'none' } },
      });

      expect(updated!.payloads).toEqual([[1, 2], 'none']);
    });

    test('should update array with full set', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: ['none', [1, 2]] },
      });

      const updated = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: { payloads: [[5, 6]] },
      });

      expect(updated!.payloads).toEqual([[5, 6]]);
    });

    test('should return before state on update', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: [1, 2] },
      });

      const before = await client.db.LiteralWithTuple.updateUnique({
        where: { id: created.id },
        data: { payload: 'none' },
        return: 'before',
      });

      expect(before!.payload).toEqual([1, 2]);
    });
  });

  describe('delete', () => {
    test('should delete and return before state', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: [1, 2], optPayload: 'none' },
      });

      const deleted = await client.db.LiteralWithTuple.deleteUnique({
        where: { id: created.id },
        return: 'before',
      });

      expect(deleted!.payload).toEqual([1, 2]);
      expect(deleted!.optPayload).toBe('none');
    });

    test('should deleteMany', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: 'none' } });
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });

      const count = await client.db.LiteralWithTuple.deleteMany({
        where: { payload: { eq: 'none' } },
      });

      expect(count).toBe(1);

      const remaining = await client.db.LiteralWithTuple.findMany();
      expect(remaining.length).toBe(1);
      expect(remaining[0]).toBeDefined();
      expect(remaining[0]!.payload).toEqual([1, 2]);
    });
  });

  describe('filtering', () => {
    test('should filter by eq with string variant', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: 'none' } });
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });

      const results = await client.db.LiteralWithTuple.findMany({
        where: { payload: { eq: 'none' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toBe('none');
    });

    test('should filter by eq with tuple variant', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: 'none' } });
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });

      const results = await client.db.LiteralWithTuple.findMany({
        where: { payload: { eq: [1, 2] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toEqual([1, 2]);
    });

    test('should filter by neq', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: 'none' } });
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });

      const results = await client.db.LiteralWithTuple.findMany({
        where: { payload: { neq: 'none' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toEqual([1, 2]);
    });

    test('should filter by in with mixed variants', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: 'none' } });
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });
      await client.db.LiteralWithTuple.create({ data: { payload: [3, 4] } });

      const results = await client.db.LiteralWithTuple.findMany({
        where: { payload: { in: ['none', [1, 2]] } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter array with has', async () => {
      await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: ['none', [1, 2]] },
      });
      await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: [[3, 4]] },
      });

      const results = await client.db.LiteralWithTuple.findMany({
        where: { payloads: { has: 'none' } },
      });

      expect(results.length).toBe(1);
    });

    test('should filter array with isEmpty', async () => {
      await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: [] },
      });
      await client.db.LiteralWithTuple.create({
        data: { payload: 'none', payloads: ['none'] },
      });

      const results = await client.db.LiteralWithTuple.findMany({
        where: { payloads: { isEmpty: true } },
      });

      expect(results.length).toBe(1);
    });
  });

  describe('select', () => {
    test('should select specific fields', async () => {
      await client.db.LiteralWithTuple.create({
        data: { payload: [1, 2], optPayload: 'none' },
      });

      const results = await client.db.LiteralWithTuple.findMany({
        select: { payload: true },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toEqual([1, 2]);
      expect((results[0]! as Record<string, unknown>).optPayload).toBeUndefined();
      expect((results[0]! as Record<string, unknown>).id).toBeUndefined();
    });
  });

  describe('upsert', () => {
    test('should create on upsert when not found', async () => {
      const result = await client.db.LiteralWithTuple.upsert({
        where: { id: 'literal_with_tuple:upsert1' },
        create: { payload: [1, 2] },
        update: { payload: 'none' },
      });

      expect(result).not.toBeNull();
      expect(result!.payload).toEqual([1, 2]);
    });

    test('should update on upsert when found', async () => {
      const created = await client.db.LiteralWithTuple.create({
        data: { payload: [1, 2] },
      });

      const result = await client.db.LiteralWithTuple.upsert({
        where: { id: created.id },
        create: { payload: [5, 6] },
        update: { payload: 'none' },
      });

      expect(result).not.toBeNull();
      expect(result!.payload).toBe('none');
    });
  });

  describe('count and exists', () => {
    test('should count records', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: 'none' } });
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });

      const count = await client.db.LiteralWithTuple.count();
      expect(count).toBe(2);
    });

    test('should check exists with filter', async () => {
      await client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } });

      const existsTuple = await client.db.LiteralWithTuple.exists({ payload: { eq: [1, 2] } });
      expect(existsTuple).toBe(true);

      const existsNone = await client.db.LiteralWithTuple.exists({ payload: { eq: 'none' } });
      expect(existsNone).toBe(false);
    });
  });

  describe('transaction', () => {
    test('should create multiple records in transaction', async () => {
      const [r1, r2] = await client.$transaction([
        client.db.LiteralWithTuple.create({ data: { payload: 'none' } }),
        client.db.LiteralWithTuple.create({ data: { payload: [1, 2] } }),
      ]);

      expect(r1.payload).toBe('none');
      expect(r2.payload).toEqual([1, 2]);
    });
  });
});
