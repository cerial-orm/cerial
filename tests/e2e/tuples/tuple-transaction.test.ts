/**
 * E2E Tests: Tuple Transactions
 *
 * Tests $transaction with tuple-bearing models for atomic operations.
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

describe('E2E Tuples: Transactions', () => {
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

  describe('multiple creates in transaction', () => {
    test('should create multiple tuple records atomically', async () => {
      const [r1, r2] = await client.$transaction([
        client.db.TupleBasic.create({ data: { name: 'T1', location: [1, 2] } }),
        client.db.TupleBasic.create({ data: { name: 'T2', location: [3, 4] } }),
      ]);

      expect(isCerialId(r1.id)).toBe(true);
      expect(r1.location).toEqual([1, 2]);
      expect(isCerialId(r2.id)).toBe(true);
      expect(r2.location).toEqual([3, 4]);
    });

    test('should create records across different tuple models', async () => {
      const [basic, nested] = await client.$transaction([
        client.db.TupleBasic.create({ data: { name: 'Basic', location: [10, 20] } }),
        client.db.TupleNested.create({ data: { payload: ['hello', [30, 40]] } }),
      ]);

      expect(basic.location).toEqual([10, 20]);
      expect(nested.payload).toEqual(['hello', [30, 40]]);
    });
  });

  describe('mixed operations in transaction', () => {
    test('should create and query in same transaction', async () => {
      await client.db.TupleBasic.create({ data: { name: 'Pre', location: [1, 1] } });

      const [created, all] = await client.$transaction([
        client.db.TupleBasic.create({ data: { name: 'New', location: [2, 2] } }),
        client.db.TupleBasic.findMany(),
      ]);

      expect(created.location).toEqual([2, 2]);
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    test('should create and update in same transaction', async () => {
      const existing = await client.db.TupleBasic.create({
        data: { name: 'Existing', location: [1, 1] },
      });

      const [newRecord, updated] = await client.$transaction([
        client.db.TupleBasic.create({ data: { name: 'Another', location: [2, 2] } }),
        client.db.TupleBasic.updateUnique({
          where: { id: existing.id },
          data: { location: [99, 99] },
        }),
      ]);

      expect(newRecord.location).toEqual([2, 2]);
      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([99, 99]);
    });
  });

  describe('transaction with array tuples', () => {
    test('should handle push in transaction', async () => {
      const existing = await client.db.TupleBasic.create({
        data: { name: 'ArrayTx', location: [0, 0], history: [[1, 2]] },
      });

      const [pushed] = await client.$transaction([
        client.db.TupleBasic.updateUnique({
          where: { id: existing.id },
          data: { history: { push: [3, 4] } },
        }),
      ]);

      expect(pushed).not.toBeNull();
      expect(pushed!.history).toHaveLength(2);
    });
  });

  describe('transaction with delete', () => {
    test('should delete and count in transaction', async () => {
      await client.db.TupleBasic.create({ data: { name: 'Del1', location: [1, 1] } });
      await client.db.TupleBasic.create({ data: { name: 'Del2', location: [2, 2] } });

      const [count] = await client.$transaction([
        client.db.TupleBasic.deleteMany({ where: { name: { startsWith: 'Del' } } }),
      ]);

      expect(count).toBe(2);
    });
  });
});
