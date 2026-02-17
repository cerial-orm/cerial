import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../src/utils/cerial-id';
import { createTestClient, testConfig, TYPED_ID_TABLES, CerialClient, cleanupTables, truncateTables } from './helpers';

describe('E2E Typed IDs: WHERE Operators', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TYPED_ID_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TYPED_ID_TABLES);
  });

  // ─── IntIdModel: eq ────────────────────────────────────────────────────────

  describe('IntIdModel WHERE operators', () => {
    test('eq operator on int id', async () => {
      await client.db.IntIdModel.create({ data: { id: 42, name: 'target' } });
      await client.db.IntIdModel.create({ data: { id: 99, name: 'other' } });

      const results = await client.db.IntIdModel.findMany({
        where: { id: { eq: 42 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id.id).toBe(42);
      expect(results[0]!.name).toBe('target');
    });

    test('neq operator on int id', async () => {
      await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
      await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
      await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

      const results = await client.db.IntIdModel.findMany({
        where: { id: { neq: 2 } },
      });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id.id).sort();
      expect(ids).toEqual([1, 3]);
    });

    test('in operator on int id', async () => {
      await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
      await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
      await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

      const results = await client.db.IntIdModel.findMany({
        where: { id: { in: [1, 3] } },
      });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id.id).sort();
      expect(ids).toEqual([1, 3]);
    });

    test('notIn operator on int id', async () => {
      await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
      await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
      await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

      const results = await client.db.IntIdModel.findMany({
        where: { id: { notIn: [1] } },
      });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id.id).sort();
      expect(ids).toEqual([2, 3]);
    });

    test('direct value on int id', async () => {
      await client.db.IntIdModel.create({ data: { id: 42, name: 'direct' } });
      await client.db.IntIdModel.create({ data: { id: 99, name: 'other' } });

      const results = await client.db.IntIdModel.findMany({
        where: { id: 42 },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id.id).toBe(42);
    });

    test('combined id operator with name filter', async () => {
      await client.db.IntIdModel.create({ data: { id: 1, name: 'test-a' } });
      await client.db.IntIdModel.create({ data: { id: 2, name: 'test-b' } });
      await client.db.IntIdModel.create({ data: { id: 3, name: 'other' } });

      const results = await client.db.IntIdModel.findMany({
        where: { id: { neq: 1 }, name: { contains: 'test' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id.id).toBe(2);
      expect(results[0]!.name).toBe('test-b');
    });

    test('in with empty match returns empty', async () => {
      await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });

      const results = await client.db.IntIdModel.findMany({
        where: { id: { in: [999, 888] } },
      });

      expect(results).toHaveLength(0);
    });
  });

  // ─── StringIdModel: string operators ───────────────────────────────────────

  describe('StringIdModel WHERE operators', () => {
    test('eq operator on string id', async () => {
      await client.db.StringIdModel.create({ data: { id: 'abc', value: 'found' } });
      await client.db.StringIdModel.create({ data: { id: 'xyz', value: 'other' } });

      const results = await client.db.StringIdModel.findMany({
        where: { id: { eq: 'abc' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id.id).toBe('abc');
    });

    test('in operator on string id', async () => {
      await client.db.StringIdModel.create({ data: { id: 'a', value: 'v1' } });
      await client.db.StringIdModel.create({ data: { id: 'b', value: 'v2' } });
      await client.db.StringIdModel.create({ data: { id: 'c', value: 'v3' } });

      const results = await client.db.StringIdModel.findMany({
        where: { id: { in: ['a', 'b'] } },
      });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id.id).sort();
      expect(ids).toEqual(['a', 'b']);
    });

    test('neq operator on string id', async () => {
      await client.db.StringIdModel.create({ data: { id: 'keep', value: 'v1' } });
      await client.db.StringIdModel.create({ data: { id: 'remove', value: 'v2' } });

      const results = await client.db.StringIdModel.findMany({
        where: { id: { neq: 'remove' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id.id).toBe('keep');
    });
  });
});
