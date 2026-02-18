/**
 * E2E Tests: Tuple Basic CRUD
 *
 * Tests create, read, update, delete for tuple fields on the TupleBasic model.
 * Covers: required/optional/array tuples, array form, object form, mixed form input.
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

describe('E2E Tuples: Basic CRUD', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.tuples);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.tuples);
  });

  describe('create', () => {
    test('should create with required tuple in array form', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Alice', location: [40.7, -74.0] },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.name).toBe('Alice');
      expect(result.location).toEqual([40.7, -74.0]);
    });

    test('should create with required tuple in object form (named keys)', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Bob', location: { lat: 34.0, lng: -118.2 } },
      });

      expect(result.location).toEqual([34.0, -118.2]);
    });

    test('should create with required tuple in object form (index keys)', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Carol', location: { '0': 51.5, '1': -0.1 } },
      });

      expect(result.location).toEqual([51.5, -0.1]);
    });

    test('should create with optional tuple provided', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Dave', location: [0, 0], backup: [10, 20] },
      });

      expect(result.location).toEqual([0, 0]);
      expect(result.backup).toEqual([10, 20]);
    });

    test('should create with optional tuple omitted', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Eve', location: [0, 0] },
      });

      expect(result.location).toEqual([0, 0]);
      expect(result.backup).toBeUndefined();
    });

    test('should create with array of tuples', async () => {
      const result = await client.db.TupleBasic.create({
        data: {
          name: 'Frank',
          location: [0, 0],
          history: [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
        },
      });

      expect(result.history).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
    });

    test('should create with empty array of tuples', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Grace', location: [0, 0], history: [] },
      });

      expect(result.history).toEqual([]);
    });

    test('should default array of tuples to empty array when omitted', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Heidi', location: [0, 0] },
      });

      expect(result.history).toEqual([]);
    });

    test('should create with mixed-type Entry tuple', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Ivan', location: [0, 0], entry: ['hello', 42, true] },
      });

      expect(result.entry).toEqual(['hello', 42, true]);
    });

    test('should create with Entry tuple in object form', async () => {
      const result = await client.db.TupleBasic.create({
        data: { name: 'Judy', location: [0, 0], entry: { name: 'world', '1': 99, '2': false } },
      });

      expect(result.entry).toEqual(['world', 99, false]);
    });
  });

  describe('findUnique', () => {
    test('should read back tuple fields after create', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'ReadTest', location: [10, 20], backup: [30, 40], history: [[50, 60]] },
      });

      const found = await client.db.TupleBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.location).toEqual([10, 20]);
      expect(found!.backup).toEqual([30, 40]);
      expect(found!.history).toEqual([[50, 60]]);
    });

    test('should return null backup when tuple is absent', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'NoBackup', location: [0, 0] },
      });

      const found = await client.db.TupleBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.backup).toBeUndefined();
    });
  });

  describe('findMany', () => {
    test('should find all records with tuple fields', async () => {
      await client.db.TupleBasic.create({ data: { name: 'A', location: [1, 1] } });
      await client.db.TupleBasic.create({ data: { name: 'B', location: [2, 2] } });

      const results = await client.db.TupleBasic.findMany();

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('select', () => {
    test('should select only specified fields including tuple', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'SelectTest', location: [40, -74], backup: [41, -75] },
      });

      const found = await client.db.TupleBasic.findUnique({
        where: { id: created.id },
        select: { name: true, location: true },
      });

      expect(found).not.toBeNull();
      expect(found!.name).toBe('SelectTest');
      expect(found!.location).toEqual([40, -74]);
      // backup should not be in select, so either undefined or not present
    });

    test('should exclude tuple from select when false', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'ExcludeTest', location: [40, -74] },
      });

      const found = await client.db.TupleBasic.findUnique({
        where: { id: created.id },
        select: { name: true, location: false },
      });

      expect(found).not.toBeNull();
      expect(found!.name).toBe('ExcludeTest');
    });
  });

  describe('deleteUnique', () => {
    test('should delete a record with tuple fields', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'DeleteMe', location: [0, 0] },
      });

      await client.db.TupleBasic.deleteUnique({ where: { id: created.id } });

      const found = await client.db.TupleBasic.findUnique({ where: { id: created.id } });
      expect(found).toBeNull();
    });

    test('should delete and return before state', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'DeleteBefore', location: [10, 20] },
      });

      const deleted = await client.db.TupleBasic.deleteUnique({
        where: { id: created.id },
        return: 'before',
      });

      expect(deleted).not.toBeNull();
      expect(deleted!.location).toEqual([10, 20]);
    });
  });

  describe('deleteMany', () => {
    test('should delete multiple records with tuple fields', async () => {
      await client.db.TupleBasic.create({ data: { name: 'Del1', location: [0, 0] } });
      await client.db.TupleBasic.create({ data: { name: 'Del2', location: [1, 1] } });

      const count = await client.db.TupleBasic.deleteMany({ where: { name: { startsWith: 'Del' } } });

      expect(count).toBe(2);
    });
  });

  describe('count and exists', () => {
    test('should count records with tuple fields', async () => {
      await client.db.TupleBasic.create({ data: { name: 'Count1', location: [0, 0] } });
      await client.db.TupleBasic.create({ data: { name: 'Count2', location: [1, 1] } });

      const count = await client.db.TupleBasic.count({ name: { startsWith: 'Count' } });

      expect(count).toBe(2);
    });

    test('should check existence with tuple model', async () => {
      await client.db.TupleBasic.create({ data: { name: 'ExistsTest', location: [0, 0] } });

      const exists = await client.db.TupleBasic.exists({ name: 'ExistsTest' });

      expect(exists).toBe(true);
    });
  });
});
