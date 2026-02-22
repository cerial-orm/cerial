/**
 * E2E Tests: Enum Negative Cases
 *
 * Schema: enums.cerial
 * Tests invalid enum values, wrong types for enum fields, and null for required enums.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Enums: Negative Cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.enums);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.enums);
  });

  test('should reject invalid enum value', async () => {
    await expect(
      (async () => {
        await client.db.EnumBasic.create({
          // @ts-expect-error - intentionally passing invalid value for Role enum
          data: { name: 'Test', role: 'INVALID_ROLE' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject number for string enum field', async () => {
    await expect(
      (async () => {
        await client.db.EnumBasic.create({
          // @ts-expect-error - intentionally passing number where Role enum (string) expected
          data: { name: 'Test', role: 42 },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject empty string for enum field', async () => {
    await expect(
      (async () => {
        await client.db.EnumBasic.create({
          // @ts-expect-error - intentionally passing empty string for Role enum
          data: { name: 'Test', role: '' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject null for required non-nullable enum field', async () => {
    await expect(
      (async () => {
        await client.db.EnumBasic.create({
          // @ts-expect-error - intentionally passing null for required Role enum
          data: { name: 'Test', role: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject boolean for enum field', async () => {
    await expect(
      (async () => {
        await client.db.EnumBasic.create({
          // @ts-expect-error - intentionally passing boolean where Role enum expected
          data: { name: 'Test', role: true },
        });
      })(),
    ).rejects.toThrow();
  });
});
