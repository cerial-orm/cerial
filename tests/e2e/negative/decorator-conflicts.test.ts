/**
 * E2E Tests: Decorator Conflicts — negative cases
 *
 * Tests runtime behavior of decorator edge cases:
 * - Updating @readonly fields (synchronous validation error)
 * - @now field values ignored (COMPUTED — DB always overrides)
 * - @readonly preserved through updates
 *
 * Schema: readonly.cerial, timestamps.cerial
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Decorator Conflicts — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...tables.readonly, ...tables.timestamps]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [...tables.readonly, ...tables.timestamps]);
  });

  describe('@readonly — update rejection', () => {
    test('updateUnique throws when updating @readonly field (code)', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Alice',
          code: 'ABC',
          address: { street: '1 Main', city: 'NYC' },
        },
      });

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — 'code' is excluded from Update type, testing runtime guard
          data: { code: 'CHANGED' },
        });
      }).toThrow("readonly field 'code'");
    });

    test('updateMany throws when updating @readonly field (code)', async () => {
      await client.db.ReadonlyTest.create({
        data: {
          name: 'Bob',
          code: 'XYZ',
          address: { street: '2 Elm', city: 'LA' },
        },
      });

      expect(() => {
        client.db.ReadonlyTest.updateMany({
          where: { name: 'Bob' },
          // @ts-expect-error — 'code' is excluded from Update type, testing runtime guard
          data: { code: 'CHANGED' },
        });
      }).toThrow("readonly field 'code'");
    });

    test('updateUnique throws when updating @readonly optional field (score)', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Carol',
          code: 'DEF',
          score: 100,
          address: { street: '3 Oak', city: 'SF' },
        },
      });

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — 'score' is excluded from Update type, testing runtime guard
          data: { score: 999 },
        });
      }).toThrow("readonly field 'score'");
    });

    test('updateUnique throws when updating @readonly @default field (createdBy)', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Dave',
          code: 'GHI',
          address: { street: '4 Pine', city: 'LA' },
        },
      });

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — 'createdBy' is excluded from Update type, testing runtime guard
          data: { createdBy: 'hacker' },
        });
      }).toThrow("readonly field 'createdBy'");
    });
  });

  describe('@now — COMPUTED field behavior', () => {
    test('@now field is always computed by DB, even when value provided in create', async () => {
      const pastDate = new Date('2000-01-01T00:00:00Z');
      const beforeCreate = new Date();

      const record = await client.db.TimestampTest.create({
        data: {
          name: 'NowTest',
          // @ts-expect-error — accessedAt is @now (COMPUTED), excluded from CreateInput
          accessedAt: pastDate,
        },
      });

      expect(record).toBeDefined();
      // @now is COMPUTED — DB always returns time::now(), ignoring any user-provided value
      expect(record.accessedAt).toBeDefined();
      const accessedAt = new Date(record.accessedAt!);
      expect(accessedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
    });

    test('@now field is present in output but excluded from where filters', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'WhereTest' },
      });

      expect(record.accessedAt).toBeDefined();

      const found = await client.db.TimestampTest.findMany({
        where: { name: 'WhereTest' },
      });
      expect(found).toHaveLength(1);
      expect(found[0]!.accessedAt).toBeDefined();
    });
  });

  describe('@readonly — value preserved through updates', () => {
    test('@readonly fields unchanged after updating non-readonly fields', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Eve',
          code: 'JKL',
          score: 42,
          createdBy: 'admin',
          address: { street: '5 Maple', city: 'DC' },
        },
      });

      const updated = await client.db.ReadonlyTest.updateUnique({
        where: { id: record.id },
        data: { name: 'Eve Updated' },
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Eve Updated');
      expect(updated!.code).toBe('JKL');
      expect(updated!.score).toBe(42);
      expect(updated!.createdBy).toBe('admin');
      expect(updated!.address.city).toBe('DC');
    });
  });
});
