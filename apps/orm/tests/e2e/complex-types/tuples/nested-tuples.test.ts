/**
 * E2E Tests: Nested Tuples
 *
 * Tests tuple-in-tuple (Outer contains Inner) via the TupleNested model.
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

describe('E2E Tuples: Nested Tuples', () => {
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
    test('should create with nested tuple in array form', async () => {
      const result = await client.db.TupleNested.create({
        data: { payload: ['hello', [10, 20]] },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.payload).toEqual(['hello', [10, 20]]);
    });

    test('should create with nested tuple — outer in object form', async () => {
      const result = await client.db.TupleNested.create({
        data: { payload: { label: 'world', '1': [30, 40] } },
      });

      expect(result.payload).toEqual(['world', [30, 40]]);
    });

    test('should create with nested tuple — both in object form', async () => {
      const result = await client.db.TupleNested.create({
        data: { payload: { label: 'both', '1': { x: 50, y: 60 } } },
      });

      expect(result.payload).toEqual(['both', [50, 60]]);
    });
  });

  describe('read', () => {
    test('should read back nested tuple', async () => {
      const created = await client.db.TupleNested.create({
        data: { payload: ['read', [100, 200]] },
      });

      const found = await client.db.TupleNested.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.payload[0]).toBe('read');
      expect(found!.payload[1]).toEqual([100, 200]);
    });
  });

  describe('update', () => {
    test('should update nested tuple (full replace)', async () => {
      const created = await client.db.TupleNested.create({
        data: { payload: ['old', [1, 2]] },
      });

      const updated = await client.db.TupleNested.updateUnique({
        where: { id: created.id },
        data: { payload: ['new', [3, 4]] },
      });

      expect(updated).not.toBeNull();
      expect(updated!.payload).toEqual(['new', [3, 4]]);
    });
  });
});
