/**
 * E2E Tests: Literal with Both Tuple and Object Variants
 *
 * Tests CRUD operations for literal fields that include both tuple and object variants.
 * literal WithBoth { 'none', 'empty', LiteralCoord, LiteralPoint }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId, NONE } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Literals: Mixed Variant (tuple + object)', () => {
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

  describe('create with each variant kind', () => {
    test('should create with first string variant', async () => {
      const result = await client.db.LiteralWithBoth.create({
        data: { data: 'none' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.data).toBe('none');
    });

    test('should create with second string variant', async () => {
      const result = await client.db.LiteralWithBoth.create({
        data: { data: 'empty' },
      });

      expect(result.data).toBe('empty');
    });

    test('should create with tuple variant', async () => {
      const result = await client.db.LiteralWithBoth.create({
        data: { data: [1.5, 2.5] },
      });

      expect(result.data).toEqual([1.5, 2.5]);
    });

    test('should create with object variant', async () => {
      const result = await client.db.LiteralWithBoth.create({
        data: { data: { label: 'mixed', value: 42 } },
      });

      expect(result.data).toEqual({ label: 'mixed', value: 42 });
    });

    test('should create with optional set to each variant', async () => {
      const r1 = await client.db.LiteralWithBoth.create({
        data: { data: 'none', optData: 'empty' },
      });
      expect(r1.optData).toBe('empty');

      const r2 = await client.db.LiteralWithBoth.create({
        data: { data: 'none', optData: [3, 4] },
      });
      expect(r2.optData).toEqual([3, 4]);

      const r3 = await client.db.LiteralWithBoth.create({
        data: { data: 'none', optData: { label: 'opt', value: 7 } },
      });
      expect(r3.optData).toEqual({ label: 'opt', value: 7 });
    });

    test('should create with optional omitted', async () => {
      const result = await client.db.LiteralWithBoth.create({
        data: { data: 'none' },
      });

      expect(result.optData).toBeUndefined();
    });
  });

  describe('read', () => {
    test('should roundtrip all variant types', async () => {
      const r1 = await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      const r2 = await client.db.LiteralWithBoth.create({ data: { data: 'empty' } });
      const r3 = await client.db.LiteralWithBoth.create({ data: { data: [10, 20] } });
      const r4 = await client.db.LiteralWithBoth.create({ data: { data: { label: 'obj', value: 5 } } });

      const f1 = await client.db.LiteralWithBoth.findUnique({ where: { id: r1.id } });
      const f2 = await client.db.LiteralWithBoth.findUnique({ where: { id: r2.id } });
      const f3 = await client.db.LiteralWithBoth.findUnique({ where: { id: r3.id } });
      const f4 = await client.db.LiteralWithBoth.findUnique({ where: { id: r4.id } });

      expect(f1!.data).toBe('none');
      expect(f2!.data).toBe('empty');
      expect(f3!.data).toEqual([10, 20]);
      expect(f4!.data).toEqual({ label: 'obj', value: 5 });
    });

    test('should findMany and return all variant types', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });
      await client.db.LiteralWithBoth.create({ data: { data: { label: 'a', value: 1 } } });

      const results = await client.db.LiteralWithBoth.findMany();

      expect(results.length).toBe(3);
      const values = results.map((r) => r.data);
      expect(values).toContainEqual('none');
      expect(values).toContainEqual([1, 2]);
      expect(values).toContainEqual({ label: 'a', value: 1 });
    });
  });

  describe('update across variant types', () => {
    test('should update from string to tuple', async () => {
      const created = await client.db.LiteralWithBoth.create({ data: { data: 'none' } });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { data: [5, 6] },
      });

      expect(updated!.data).toEqual([5, 6]);
    });

    test('should update from string to object', async () => {
      const created = await client.db.LiteralWithBoth.create({ data: { data: 'empty' } });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { data: { label: 'now-obj', value: 10 } },
      });

      expect(updated!.data).toEqual({ label: 'now-obj', value: 10 });
    });

    test('should update from tuple to object', async () => {
      const created = await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { data: { label: 'replaced', value: 99 } },
      });

      expect(updated!.data).toEqual({ label: 'replaced', value: 99 });
    });

    test('should update from object to tuple', async () => {
      const created = await client.db.LiteralWithBoth.create({
        data: { data: { label: 'obj', value: 1 } },
      });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { data: [7, 8] },
      });

      expect(updated!.data).toEqual([7, 8]);
    });

    test('should update from tuple to string', async () => {
      const created = await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { data: 'none' },
      });

      expect(updated!.data).toBe('none');
    });

    test('should update from object to string', async () => {
      const created = await client.db.LiteralWithBoth.create({
        data: { data: { label: 'obj', value: 1 } },
      });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { data: 'empty' },
      });

      expect(updated!.data).toBe('empty');
    });

    test('should cycle through all four variant types', async () => {
      const created = await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      const id = created.id;

      // none -> tuple
      await client.db.LiteralWithBoth.updateUnique({
        where: { id },
        data: { data: [1, 2] },
      });

      // tuple -> object
      await client.db.LiteralWithBoth.updateUnique({
        where: { id },
        data: { data: { label: 'obj', value: 3 } },
      });

      // object -> empty
      await client.db.LiteralWithBoth.updateUnique({
        where: { id },
        data: { data: 'empty' },
      });

      // empty -> none
      const final = await client.db.LiteralWithBoth.updateUnique({
        where: { id },
        data: { data: 'none' },
      });

      expect(final!.data).toBe('none');
    });
  });

  describe('optional field', () => {
    test('should set optional from undefined', async () => {
      const created = await client.db.LiteralWithBoth.create({ data: { data: 'none' } });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { optData: { label: 'set', value: 1 } },
      });

      expect(updated!.optData).toEqual({ label: 'set', value: 1 });
    });

    test('should clear optional with NONE', async () => {
      const created = await client.db.LiteralWithBoth.create({
        data: { data: 'none', optData: [1, 2] },
      });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: { optData: NONE },
      });

      expect(updated!.optData).toBeUndefined();
    });

    test('should clear optional with unset', async () => {
      const created = await client.db.LiteralWithBoth.create({
        data: { data: 'none', optData: 'empty' },
      });

      const updated = await client.db.LiteralWithBoth.updateUnique({
        where: { id: created.id },
        data: {},
        unset: { optData: true },
      });

      expect(updated!.optData).toBeUndefined();
    });
  });

  describe('filtering', () => {
    test('should filter by eq with string', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      await client.db.LiteralWithBoth.create({ data: { data: 'empty' } });
      await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });

      const results = await client.db.LiteralWithBoth.findMany({
        where: { data: { eq: 'none' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.data).toBe('none');
    });

    test('should filter by eq with tuple', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });

      const results = await client.db.LiteralWithBoth.findMany({
        where: { data: { eq: [1, 2] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.data).toEqual([1, 2]);
    });

    test('should filter by eq with object', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      await client.db.LiteralWithBoth.create({ data: { data: { label: 'target', value: 5 } } });

      const results = await client.db.LiteralWithBoth.findMany({
        where: { data: { eq: { label: 'target', value: 5 } } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.data).toEqual({ label: 'target', value: 5 });
    });

    test('should filter by neq', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });
      await client.db.LiteralWithBoth.create({ data: { data: { label: 'a', value: 1 } } });

      const results = await client.db.LiteralWithBoth.findMany({
        where: { data: { neq: 'none' } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by in with all variant types', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      await client.db.LiteralWithBoth.create({ data: { data: 'empty' } });
      await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });
      await client.db.LiteralWithBoth.create({ data: { data: { label: 'a', value: 1 } } });

      const results = await client.db.LiteralWithBoth.findMany({
        where: { data: { in: ['none', [1, 2]] } },
      });

      expect(results.length).toBe(2);
    });
  });

  describe('select', () => {
    test('should select specific fields', async () => {
      await client.db.LiteralWithBoth.create({
        data: { data: [1, 2], optData: 'empty' },
      });

      const results = await client.db.LiteralWithBoth.findMany({
        select: { data: true },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.data).toEqual([1, 2]);
      expect((results[0]! as Record<string, unknown>).optData).toBeUndefined();
    });
  });

  describe('upsert', () => {
    test('should create on upsert with tuple variant', async () => {
      const result = await client.db.LiteralWithBoth.upsert({
        where: { id: 'literal_with_both:upsert1' },
        create: { data: [1, 2] },
        update: { data: 'none' },
      });

      expect(result).not.toBeNull();
      expect(result!.data).toEqual([1, 2]);
    });

    test('should create on upsert with object variant', async () => {
      const result = await client.db.LiteralWithBoth.upsert({
        where: { id: 'literal_with_both:upsert2' },
        create: { data: { label: 'created', value: 1 } },
      });

      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ label: 'created', value: 1 });
    });

    test('should update on upsert from object to tuple', async () => {
      const created = await client.db.LiteralWithBoth.create({
        data: { data: { label: 'orig', value: 1 } },
      });

      const result = await client.db.LiteralWithBoth.upsert({
        where: { id: created.id },
        create: { data: 'none' },
        update: { data: [9, 10] },
      });

      expect(result).not.toBeNull();
      expect(result!.data).toEqual([9, 10]);
    });
  });

  describe('count and exists', () => {
    test('should count all records', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: 'none' } });
      await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });
      await client.db.LiteralWithBoth.create({ data: { data: { label: 'a', value: 1 } } });

      const count = await client.db.LiteralWithBoth.count();
      expect(count).toBe(3);
    });

    test('should check exists with different variant types', async () => {
      await client.db.LiteralWithBoth.create({ data: { data: [1, 2] } });

      expect(await client.db.LiteralWithBoth.exists({ data: { eq: [1, 2] } })).toBe(true);
      expect(await client.db.LiteralWithBoth.exists({ data: { eq: 'none' } })).toBe(false);
    });
  });

  describe('transaction', () => {
    test('should create records with different variant types in transaction', async () => {
      const [r1, r2, r3] = await client.$transaction([
        client.db.LiteralWithBoth.create({ data: { data: 'none' } }),
        client.db.LiteralWithBoth.create({ data: { data: [1, 2] } }),
        client.db.LiteralWithBoth.create({ data: { data: { label: 'tx', value: 1 } } }),
      ]);

      expect(r1.data).toBe('none');
      expect(r2.data).toEqual([1, 2]);
      expect(r3.data).toEqual({ label: 'tx', value: 1 });
    });
  });
});
