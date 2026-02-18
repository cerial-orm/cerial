/**
 * E2E Tests: Tuple Negative Cases
 *
 * Schema: tuples.cerial
 * Tests wrong element count, type mismatches, and invalid tuple inputs.
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

describe('E2E Tuples: Negative Cases', () => {
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

  test('should reject string value where tuple type expected', async () => {
    await expect(
      (async () => {
        await client.db.TupleBasic.create({
          // @ts-expect-error - intentionally passing string where Coordinate tuple expected
          data: { name: 'Test', location: 'not a tuple' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject null for required tuple field', async () => {
    await expect(
      (async () => {
        await client.db.TupleBasic.create({
          // @ts-expect-error - intentionally passing null for required Coordinate
          data: { name: 'Test', location: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject when required tuple field is omitted', async () => {
    await expect(
      (async () => {
        await client.db.TupleBasic.create({
          // @ts-expect-error - intentionally omitting required 'location' field
          data: { name: 'Test' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject too few elements in tuple', async () => {
    await expect(
      (async () => {
        await client.db.TupleBasic.create({
          data: { name: 'Test', location: [40.7] },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject number value where tuple type expected', async () => {
    await expect(
      (async () => {
        await client.db.TupleBasic.create({
          // @ts-expect-error - intentionally passing number where Coordinate tuple expected
          data: { name: 'Test', location: 42 },
        });
      })(),
    ).rejects.toThrow();
  });
});
