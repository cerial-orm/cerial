/**
 * E2E: Unset — Validation
 *
 * Tests runtime validation errors for unset:
 * - Unknown field
 * - Required field
 * - Leaf-level data/unset overlap
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  testConfig,
  tables,
} from '../test-helper';

const UNSET_TABLES = tables.unset;
const NESTED = { title: 'T', mid: { label: 'L', deep: { code: 'C' } } };

describe('Unset: Validation', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, UNSET_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, UNSET_TABLES);
  });

  test('rejects unset on unknown field', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'Val1', address: { street: 'G', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });

    await expect(
      (async () => {
        await client.db.UnsetTest.updateUnique({
          where: { id: record.id },
          data: {},
          unset: { nonExistent: true } as any,
        });
      })(),
    ).rejects.toThrow('Unknown field');
  });

  test('rejects unset on required field', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'Val2', address: { street: 'H', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });

    await expect(
      (async () => {
        await client.db.UnsetTest.updateUnique({
          where: { id: record.id },
          data: {},
          unset: { name: true } as any,
        });
      })(),
    ).rejects.toThrow('Cannot unset required field');
  });

  test('rejects leaf-level data/unset overlap', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'Val3', bio: 'test', address: { street: 'I', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });

    await expect(
      (async () => {
        await client.db.UnsetTest.updateUnique({
          where: { id: record.id },
          data: { bio: 'new' },
          // @ts-expect-error Type system correctly prevents leaf-level overlap; testing runtime validation
          unset: { bio: true },
        });
      })(),
    ).rejects.toThrow('appears in both data and unset');
  });

  test('rejects leaf-level overlap in updateMany', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'Val4', bio: 'test', address: { street: 'J', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });

    await expect(
      (async () => {
        await client.db.UnsetTest.updateMany({
          where: { name: { eq: 'Val4' } },
          data: { bio: 'new' },
          // @ts-expect-error Type system correctly prevents leaf-level overlap; testing runtime validation
          unset: { bio: true },
        });
      })(),
    ).rejects.toThrow('appears in both data and unset');
  });

  test('rejects leaf-level overlap in upsert', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'Val5', bio: 'test', address: { street: 'K', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });

    await expect(
      (async () => {
        await client.db.UnsetTest.upsert({
          where: { id: record.id },
          create: { name: 'New', address: { street: 'X', city: 'X' }, pos: [0, 0], nested: NESTED },
          update: { bio: 'new' },
          // @ts-expect-error Type system correctly prevents leaf-level overlap; testing runtime validation
          unset: { bio: true },
        });
      })(),
    ).rejects.toThrow('appears in both data and unset');
  });
});
