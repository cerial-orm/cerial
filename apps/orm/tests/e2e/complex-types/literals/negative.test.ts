/**
 * E2E Tests: Literal Negative Cases
 *
 * Schema: literals.cerial
 * Tests values outside literal union, wrong variant types, and null for required literals.
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

describe('E2E Literals: Negative Cases', () => {
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

  test('should reject string value outside literal union', async () => {
    await expect(
      (async () => {
        await client.db.LiteralBasic.create({
          data: {
            name: 'Test',
            // @ts-expect-error - intentionally passing invalid string for Status literal
            status: 'invalid',
            priority: 1,
            mixed: 'low',
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject number where string-only literal expected', async () => {
    await expect(
      (async () => {
        await client.db.LiteralBasic.create({
          data: {
            name: 'Test',
            // @ts-expect-error - intentionally passing number for Status (string-only literal)
            status: 42,
            priority: 1,
            mixed: 'low',
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject int outside defined literal range', async () => {
    await expect(
      (async () => {
        await client.db.LiteralBasic.create({
          data: {
            name: 'Test',
            status: 'active',
            // @ts-expect-error - intentionally passing 99 for Priority literal (only 1|2|3)
            priority: 99,
            mixed: 'low',
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject null for required non-nullable literal field', async () => {
    await expect(
      (async () => {
        await client.db.LiteralBasic.create({
          data: {
            name: 'Test',
            // @ts-expect-error - intentionally passing null for required Status literal
            status: null,
            priority: 1,
            mixed: 'low',
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject when required literal field is omitted', async () => {
    await expect(
      (async () => {
        await client.db.LiteralBasic.create({
          // @ts-expect-error - intentionally omitting required 'status' field
          data: {
            name: 'Test',
            priority: 1,
            mixed: 'low',
          },
        });
      })(),
    ).rejects.toThrow();
  });
});
