/**
 * E2E Tests: Literal with Object Variant
 *
 * Tests CRUD operations for literal fields that include an object variant.
 * literal WithObject { 'empty', LiteralPoint }
 * LiteralPoint = object { label String, value Int }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../relations/test-helper';
import { NONE, isCerialId } from 'cerial';

describe('E2E Literals: Object Variant', () => {
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
      const result = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.payload).toBe('empty');
    });

    test('should create with object variant', async () => {
      const result = await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'point-a', value: 10 } },
      });

      expect(result.payload).toEqual({ label: 'point-a', value: 10 });
    });

    test('should create with optional set to object', async () => {
      const result = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', optPayload: { label: 'opt', value: 5 } },
      });

      expect(result.payload).toBe('empty');
      expect(result.optPayload).toEqual({ label: 'opt', value: 5 });
    });

    test('should create with optional set to string', async () => {
      const result = await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'a', value: 1 }, optPayload: 'empty' },
      });

      expect(result.payload).toEqual({ label: 'a', value: 1 });
      expect(result.optPayload).toBe('empty');
    });

    test('should create with optional omitted', async () => {
      const result = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty' },
      });

      expect(result.optPayload).toBeUndefined();
    });

    test('should create with array of mixed values', async () => {
      const result = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', payloads: ['empty', { label: 'p1', value: 1 }, { label: 'p2', value: 2 }] },
      });

      expect(result.payloads).toEqual(['empty', { label: 'p1', value: 1 }, { label: 'p2', value: 2 }]);
    });

    test('should create with empty array', async () => {
      const result = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', payloads: [] },
      });

      expect(result.payloads).toEqual([]);
    });
  });

  describe('read', () => {
    test('should findUnique with object value', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'find-me', value: 42 } },
      });

      const found = await client.db.LiteralWithObjectVariant.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.payload).toEqual({ label: 'find-me', value: 42 });
    });

    test('should findMany with mixed variants', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'x', value: 1 } } });

      const results = await client.db.LiteralWithObjectVariant.findMany();

      expect(results.length).toBe(2);
      const payloads = results.map((r) => r.payload);
      expect(payloads).toContainEqual('empty');
      expect(payloads).toContainEqual({ label: 'x', value: 1 });
    });
  });

  describe('update', () => {
    test('should update from string to object', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty' },
      });

      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: { payload: { label: 'updated', value: 99 } },
      });

      expect(updated!.payload).toEqual({ label: 'updated', value: 99 });
    });

    test('should update from object to string', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'orig', value: 1 } },
      });

      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: { payload: 'empty' },
      });

      expect(updated!.payload).toBe('empty');
    });

    test('should update optional from undefined to value', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty' },
      });

      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: { optPayload: { label: 'now-set', value: 7 } },
      });

      expect(updated!.optPayload).toEqual({ label: 'now-set', value: 7 });
    });

    test('should clear optional with NONE', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', optPayload: { label: 'clear-me', value: 1 } },
      });

      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: { optPayload: NONE },
      });

      expect(updated!.optPayload).toBeUndefined();
    });

    test('should update with unset on optional', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', optPayload: 'empty' },
      });

      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: {},
        unset: { optPayload: true },
      });

      expect(updated!.optPayload).toBeUndefined();
    });

    test('should push to array', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', payloads: ['empty'] },
      });

      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: { payloads: { push: { label: 'pushed', value: 3 } } },
      });

      expect(updated!.payloads).toEqual(['empty', { label: 'pushed', value: 3 }]);
    });

    test('should replace array with set', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', payloads: ['empty', { label: 'a', value: 1 }] },
      });

      const updated = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: { payloads: [{ label: 'only', value: 100 }] },
      });

      expect(updated!.payloads).toEqual([{ label: 'only', value: 100 }]);
    });

    test('should return before state', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'before', value: 1 } },
      });

      const before = await client.db.LiteralWithObjectVariant.updateUnique({
        where: { id: created.id },
        data: { payload: 'empty' },
        return: 'before',
      });

      expect(before!.payload).toEqual({ label: 'before', value: 1 });
    });
  });

  describe('delete', () => {
    test('should delete and return before state', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'del', value: 5 }, optPayload: 'empty' },
      });

      const deleted = await client.db.LiteralWithObjectVariant.deleteUnique({
        where: { id: created.id },
        return: 'before',
      });

      expect(deleted!.payload).toEqual({ label: 'del', value: 5 });
      expect(deleted!.optPayload).toBe('empty');
    });

    test('should deleteMany with filter', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'keep', value: 1 } } });

      const count = await client.db.LiteralWithObjectVariant.deleteMany({
        where: { payload: { eq: 'empty' } },
      });

      expect(count).toBe(1);

      const remaining = await client.db.LiteralWithObjectVariant.findMany();
      expect(remaining.length).toBe(1);
      expect(remaining[0]).toBeDefined();
      expect(remaining[0]!.payload).toEqual({ label: 'keep', value: 1 });
    });
  });

  describe('filtering', () => {
    test('should filter by eq with string variant', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'x', value: 1 } } });

      const results = await client.db.LiteralWithObjectVariant.findMany({
        where: { payload: { eq: 'empty' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toBe('empty');
    });

    test('should filter by eq with object variant', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'match', value: 7 } } });

      const results = await client.db.LiteralWithObjectVariant.findMany({
        where: { payload: { eq: { label: 'match', value: 7 } } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toEqual({ label: 'match', value: 7 });
    });

    test('should filter by neq', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'a', value: 1 } } });

      const results = await client.db.LiteralWithObjectVariant.findMany({
        where: { payload: { neq: 'empty' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toEqual({ label: 'a', value: 1 });
    });

    test('should filter by in with mixed variants', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'a', value: 1 } } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'b', value: 2 } } });

      const results = await client.db.LiteralWithObjectVariant.findMany({
        where: { payload: { in: ['empty', { label: 'a', value: 1 }] } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter array with has', async () => {
      await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', payloads: ['empty', { label: 'a', value: 1 }] },
      });
      await client.db.LiteralWithObjectVariant.create({
        data: { payload: 'empty', payloads: [{ label: 'b', value: 2 }] },
      });

      const results = await client.db.LiteralWithObjectVariant.findMany({
        where: { payloads: { has: 'empty' } },
      });

      expect(results.length).toBe(1);
    });

    test('should filter array with isEmpty', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty', payloads: [] } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty', payloads: ['empty'] } });

      const results = await client.db.LiteralWithObjectVariant.findMany({
        where: { payloads: { isEmpty: true } },
      });

      expect(results.length).toBe(1);
    });
  });

  describe('select', () => {
    test('should select specific fields', async () => {
      await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'sel', value: 3 }, optPayload: 'empty' },
      });

      const results = await client.db.LiteralWithObjectVariant.findMany({
        select: { payload: true },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.payload).toEqual({ label: 'sel', value: 3 });
      expect((results[0]! as Record<string, unknown>).optPayload).toBeUndefined();
      expect((results[0]! as Record<string, unknown>).id).toBeUndefined();
    });
  });

  describe('upsert', () => {
    test('should create on upsert when not found', async () => {
      const result = await client.db.LiteralWithObjectVariant.upsert({
        where: { id: 'literal_with_object_variant:upsert1' },
        create: { payload: { label: 'created', value: 1 } },
        update: { payload: 'empty' },
      });

      expect(result).not.toBeNull();
      expect(result!.payload).toEqual({ label: 'created', value: 1 });
    });

    test('should update on upsert when found', async () => {
      const created = await client.db.LiteralWithObjectVariant.create({
        data: { payload: { label: 'orig', value: 1 } },
      });

      const result = await client.db.LiteralWithObjectVariant.upsert({
        where: { id: created.id },
        create: { payload: { label: 'never', value: 99 } },
        update: { payload: 'empty' },
      });

      expect(result).not.toBeNull();
      expect(result!.payload).toBe('empty');
    });
  });

  describe('count and exists', () => {
    test('should count records', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } });
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'a', value: 1 } } });

      const count = await client.db.LiteralWithObjectVariant.count();
      expect(count).toBe(2);
    });

    test('should check exists', async () => {
      await client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'exists', value: 1 } } });

      const exists = await client.db.LiteralWithObjectVariant.exists({
        payload: { eq: { label: 'exists', value: 1 } },
      });
      expect(exists).toBe(true);

      const notExists = await client.db.LiteralWithObjectVariant.exists({ payload: { eq: 'empty' } });
      expect(notExists).toBe(false);
    });
  });

  describe('transaction', () => {
    test('should create multiple records in transaction', async () => {
      const [r1, r2] = await client.$transaction([
        client.db.LiteralWithObjectVariant.create({ data: { payload: 'empty' } }),
        client.db.LiteralWithObjectVariant.create({ data: { payload: { label: 'tx', value: 1 } } }),
      ]);

      expect(r1.payload).toBe('empty');
      expect(r2.payload).toEqual({ label: 'tx', value: 1 });
    });
  });
});
