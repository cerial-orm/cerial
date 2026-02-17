/**
 * E2E: Unset — Primitive Fields
 *
 * Tests unsetting flat optional primitive fields (String?, Int?) via
 * updateUnique and updateMany.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  testConfig,
  tables,
} from '../relations/test-helper';

const UNSET_TABLES = tables.unset;
const NESTED = { title: 'T', mid: { label: 'L', deep: { code: 'C' } } };

describe('Unset: Primitive Fields', () => {
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

  // ─── updateUnique ─────────────────────────────────────────────────────────

  test('unsets an optional string field', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'Alice',
        bio: 'Hello world',
        address: { street: '1 Main', city: 'NYC' },
        pos: [40.7, -74.0],
        nested: NESTED,
      },
    });
    expect(record.bio).toBe('Hello world');

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: { name: 'Alice Updated' },
      unset: { bio: true },
    });

    expect(updated!.name).toBe('Alice Updated');
    expect(updated!.bio).toBeUndefined();
  });

  test('unsets an optional int field', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'Bob', age: 30, address: { street: '2 Oak', city: 'LA' }, pos: [34.0, -118.0], nested: NESTED },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { age: true },
    });

    expect(updated!.age).toBeUndefined();
  });

  test('unsets multiple optional primitives at once', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'Charlie',
        bio: 'Bio',
        age: 25,
        address: { street: '3 Pine', city: 'Chicago' },
        pos: [41.8, -87.6],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { bio: true, age: true },
    });

    expect(updated!.bio).toBeUndefined();
    expect(updated!.age).toBeUndefined();
    expect(updated!.name).toBe('Charlie');
  });

  test('unset with empty data only unsets', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'Eve',
        bio: 'Some bio',
        address: { street: '5 Maple', city: 'Portland' },
        pos: [45.5, -122.6],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { bio: true },
    });

    expect(updated!.bio).toBeUndefined();
    expect(updated!.name).toBe('Eve');
  });

  test('unset already-absent field is a no-op', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'Frank', address: { street: '6 Cedar', city: 'Austin' }, pos: [30.2, -97.7], nested: NESTED },
    });
    expect(record.bio).toBeUndefined();

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { bio: true },
    });

    expect(updated!.bio).toBeUndefined();
  });

  // ─── updateMany ───────────────────────────────────────────────────────────

  test('updateMany: unsets field on multiple records', async () => {
    await client.db.UnsetTest.create({
      data: { name: 'U1', bio: 'Bio1', address: { street: 'A', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });
    await client.db.UnsetTest.create({
      data: { name: 'U2', bio: 'Bio2', address: { street: 'B', city: 'NYC' }, pos: [40.1, -74.1], nested: NESTED },
    });

    const updated = await client.db.UnsetTest.updateMany({
      where: { address: { city: { eq: 'NYC' } } },
      data: {},
      unset: { bio: true },
    });

    expect(updated).toHaveLength(2);
    for (const r of updated) {
      expect(r.bio).toBeUndefined();
    }
  });

  test('updateMany: combines data and unset', async () => {
    await client.db.UnsetTest.create({
      data: {
        name: 'U3',
        bio: 'Bio3',
        age: 40,
        address: { street: 'C', city: 'LA' },
        pos: [34.0, -118.0],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateMany({
      where: { name: { eq: 'U3' } },
      data: { name: 'U3 Updated' },
      unset: { bio: true, age: true },
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]!.name).toBe('U3 Updated');
    expect(updated[0]!.bio).toBeUndefined();
    expect(updated[0]!.age).toBeUndefined();
  });
});
