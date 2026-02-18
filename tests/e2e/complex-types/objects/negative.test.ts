/**
 * E2E Tests: Object Negative Cases
 *
 * Schema: objects.cerial
 * Tests invalid object shapes, wrong types, missing required sub-fields,
 * extra fields on non-flexible objects.
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

describe('E2E Objects: Negative Cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.objects);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.objects);
  });

  test('should reject string value where object type expected', async () => {
    await expect(
      (async () => {
        await client.db.ObjectTestUser.create({
          // @ts-expect-error - intentionally passing string where Address object expected
          data: { name: 'Test', address: 'not an object' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject array value where object type expected', async () => {
    await expect(
      (async () => {
        await client.db.ObjectTestUser.create({
          // @ts-expect-error - intentionally passing array where Address object expected
          data: { name: 'Test', address: ['123 Main', 'NYC', 'NY'] },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject when required object field is omitted', async () => {
    await expect(
      (async () => {
        await client.db.ObjectTestUser.create({
          // @ts-expect-error - intentionally omitting required 'address' field
          data: { name: 'Test' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject null for required non-nullable object field', async () => {
    await expect(
      (async () => {
        await client.db.ObjectTestUser.create({
          // @ts-expect-error - intentionally passing null for required non-nullable Address
          data: { name: 'Test', address: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('should reject extra fields on non-flexible object', async () => {
    await expect(
      (async () => {
        await client.db.ObjectTestUser.create({
          data: {
            name: 'Test',
            address: {
              street: '123 Main',
              city: 'NYC',
              state: 'NY',
              // @ts-expect-error - intentionally passing extra field on non-flexible object
              extra: 'should be rejected',
            },
          },
        });
      })(),
    ).rejects.toThrow();
  });
});
