/**
 * E2E Tests: Literal with Object Variant having Optional/Nullable fields
 *
 * Tests CRUD operations for literal fields that include an object variant
 * with optional and nullable sub-fields.
 * literal WithObjectOpt { 'empty', LiteralPointOpt }
 * LiteralPointOpt = object { label String, count Int?, tag String? @nullable }
 *
 * DB-level enforcement via inline type:
 *   TYPE 'empty' | { label: string, count: option<int>, tag: option<string | null> }
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
import { NONE, isCerialId } from 'cerial';

describe('E2E Literals: Object Variant with Optional/Nullable Fields', () => {
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
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.payload).toBe('empty');
    });

    test('should create with full object variant (all fields)', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'full', count: 10, tag: 'yes' } },
      });

      expect(result.payload).toEqual({ label: 'full', count: 10, tag: 'yes' });
    });

    test('should create with object variant - only required field', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'required-only' } },
      });

      // count is optional (absent), tag is optional (absent)
      expect(result.payload).toEqual({ label: 'required-only' });
    });

    test('should create with object variant - optional count absent, tag present', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'with-tag', tag: 'hello' } },
      });

      expect(result.payload).toEqual({ label: 'with-tag', tag: 'hello' });
    });

    test('should create with object variant - count present, tag null', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'null-tag', count: 5, tag: null } },
      });

      expect(result.payload).toEqual({ label: 'null-tag', count: 5, tag: null });
    });

    test('should create with object variant - tag null, count absent', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'just-null-tag', tag: null } },
      });

      expect(result.payload).toEqual({ label: 'just-null-tag', tag: null });
    });

    test('should create with optPayload as string variant', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty', optPayload: 'empty' },
      });

      expect(result.payload).toBe('empty');
      expect(result.optPayload).toBe('empty');
    });

    test('should create with optPayload as full object', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: {
          payload: 'empty',
          optPayload: { label: 'opt-full', count: 3, tag: 'opt-tag' },
        },
      });

      expect(result.optPayload).toEqual({ label: 'opt-full', count: 3, tag: 'opt-tag' });
    });

    test('should create with optPayload absent', async () => {
      const result = await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty' },
      });

      expect(result.optPayload).toBeUndefined();
    });
  });

  describe('update', () => {
    test('should update from string to full object', async () => {
      const created = await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty' },
      });

      const results = await client.db.LiteralWithObjectOpt.updateMany({
        where: { id: created.id },
        data: { payload: { label: 'updated', count: 7, tag: 'new' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toEqual({ label: 'updated', count: 7, tag: 'new' });
    });

    test('should update from string to partial object (required only)', async () => {
      const created = await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty' },
      });

      const results = await client.db.LiteralWithObjectOpt.updateMany({
        where: { id: created.id },
        data: { payload: { label: 'minimal' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toEqual({ label: 'minimal' });
    });

    test('should update from object to string', async () => {
      const created = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'will-switch', count: 1 } },
      });

      const results = await client.db.LiteralWithObjectOpt.updateMany({
        where: { id: created.id },
        data: { payload: 'empty' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toBe('empty');
    });

    test('should update object to object with different fields', async () => {
      const created = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'original', count: 1, tag: 'old' } },
      });

      // Switch to object with only required field — full replacement
      const results = await client.db.LiteralWithObjectOpt.updateMany({
        where: { id: created.id },
        data: { payload: { label: 'replaced' } },
      });

      expect(results).toHaveLength(1);
      // Full replacement — count and tag should be gone
      expect(results[0]!.payload).toEqual({ label: 'replaced' });
    });

    test('should update object with null tag', async () => {
      const created = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'has-tag', tag: 'yes' } },
      });

      const results = await client.db.LiteralWithObjectOpt.updateMany({
        where: { id: created.id },
        data: { payload: { label: 'has-tag', tag: null } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toEqual({ label: 'has-tag', tag: null });
    });

    test('should unset optPayload via NONE', async () => {
      const created = await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty', optPayload: { label: 'opt', count: 1 } },
      });

      const results = await client.db.LiteralWithObjectOpt.updateMany({
        where: { id: created.id },
        data: { optPayload: NONE },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.optPayload).toBeUndefined();
    });
  });

  describe('findMany', () => {
    test('should filter by string variant with eq shorthand', async () => {
      await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty' },
      });
      await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'obj', count: 1 } },
      });

      const results = await client.db.LiteralWithObjectOpt.findMany({
        where: { payload: 'empty' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toBe('empty');
    });

    test('should filter by object variant with eq', async () => {
      await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'target', count: 42 } },
      });
      await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'other', count: 1 } },
      });

      const results = await client.db.LiteralWithObjectOpt.findMany({
        where: { payload: { eq: { label: 'target', count: 42 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toEqual({ label: 'target', count: 42 });
    });

    test('should filter by neq with string variant', async () => {
      await client.db.LiteralWithObjectOpt.create({
        data: { payload: 'empty' },
      });
      await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'keep', count: 1 } },
      });

      const results = await client.db.LiteralWithObjectOpt.findMany({
        where: { payload: { neq: 'empty' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toEqual({ label: 'keep', count: 1 });
    });
  });

  describe('findUnique', () => {
    test('should find by id and return object variant with optional/nullable fields', async () => {
      const created = await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'full', count: 10, tag: null } },
      });

      const result = await client.db.LiteralWithObjectOpt.findUnique({
        where: { id: created.id },
      });

      expect(result).not.toBeNull();
      expect(result!.payload).toEqual({ label: 'full', count: 10, tag: null });
    });

    test('should return null for non-existent id', async () => {
      const result = await client.db.LiteralWithObjectOpt.findUnique({
        where: { id: 'literal_with_object_opt:nonexistent' },
      });

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    test('should create via upsert with object variant', async () => {
      const result = await client.db.LiteralWithObjectOpt.upsert({
        where: { id: 'literal_with_object_opt:upsert1' },
        create: { payload: { label: 'created', count: 5, tag: 'new' } },
        update: { payload: 'empty' },
      });

      expect(result).not.toBeNull();
      expect(result!.payload).toEqual({ label: 'created', count: 5, tag: 'new' });
    });

    test('should update via upsert switching from object to string', async () => {
      await client.db.LiteralWithObjectOpt.create({
        data: {
          id: 'literal_with_object_opt:upsert2',
          payload: { label: 'original', count: 1 },
        },
      });

      const result = await client.db.LiteralWithObjectOpt.upsert({
        where: { id: 'literal_with_object_opt:upsert2' },
        create: { payload: 'empty' },
        update: { payload: 'empty' },
      });

      expect(result).not.toBeNull();
      expect(result!.payload).toBe('empty');
    });
  });

  describe('select', () => {
    test('should select only payload field', async () => {
      await client.db.LiteralWithObjectOpt.create({
        data: { payload: { label: 'selected', count: 3, tag: 'yes' } },
      });

      const results = await client.db.LiteralWithObjectOpt.findMany({
        select: { payload: true },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toEqual({ label: 'selected', count: 3, tag: 'yes' });
      // id and optPayload should not be present
      expect('id' in results[0]!).toBe(false);
      expect('optPayload' in results[0]!).toBe(false);
    });
  });
});
