/**
 * E2E: Unset — Object Fields (1 level)
 *
 * Tests unsetting optional objects entirely, unsetting optional sub-fields
 * within required/optional objects, and combining data + unset on same object.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const UNSET_TABLES = tables.unset;
const NESTED = { title: 'T', mid: { label: 'L', deep: { code: 'C' } } };

describe('Unset: Object Fields', () => {
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

  test('unsets an entire optional object', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'Grace',
        address: { street: '7 Birch', city: 'Seattle' },
        shipping: { street: '8 Ship', city: 'Portland' },
        pos: [47.6, -122.3],
        nested: NESTED,
      },
    });
    expect(record.shipping).toBeDefined();

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { shipping: true },
    });

    expect(updated!.shipping).toBeUndefined();
    expect(updated!.address.street).toBe('7 Birch');
  });

  test('unsets an optional sub-field of a required object', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'Hank',
        address: { street: '9 Willow', city: 'Boston', zip: '02101' },
        pos: [42.3, -71.0],
        nested: NESTED,
      },
    });
    expect(record.address.zip).toBe('02101');

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { address: { zip: true } },
    });

    expect(updated!.address.zip).toBeUndefined();
    expect(updated!.address.street).toBe('9 Willow');
    expect(updated!.address.city).toBe('Boston');
  });

  test('combines data and unset on same object (different sub-fields)', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'Ivy',
        address: { street: '10 Ash', city: 'Miami', zip: '33101' },
        pos: [25.7, -80.1],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: { address: { city: 'Fort Lauderdale' } },
      unset: { address: { zip: true } },
    });

    expect(updated!.address.city).toBe('Fort Lauderdale');
    expect(updated!.address.zip).toBeUndefined();
    expect(updated!.address.street).toBe('10 Ash');
  });

  test('unsets sub-field of optional object (without unsetting parent)', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'Jack',
        address: { street: '11 Oak', city: 'NYC' },
        shipping: { street: '12 Ship', city: 'LA', zip: '90001' },
        pos: [40.7, -74.0],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { shipping: { zip: true } },
    });

    expect(updated!.shipping).toBeDefined();
    expect(updated!.shipping!.zip).toBeUndefined();
    expect(updated!.shipping!.street).toBe('12 Ship');
    expect(updated!.shipping!.city).toBe('LA');
  });

  test('updateMany: deep nested unset on multiple records', async () => {
    await client.db.UnsetTest.create({
      data: { name: 'U4', address: { street: 'D', city: 'SF', zip: '94101' }, pos: [37.0, -122.0], nested: NESTED },
    });
    await client.db.UnsetTest.create({
      data: { name: 'U5', address: { street: 'E', city: 'SF', zip: '94102' }, pos: [37.1, -122.1], nested: NESTED },
    });

    const updated = await client.db.UnsetTest.updateMany({
      where: { address: { city: { eq: 'SF' } } },
      data: {},
      unset: { address: { zip: true } },
    });

    expect(updated).toHaveLength(2);
    for (const r of updated) {
      expect(r.address.zip).toBeUndefined();
      expect(r.address.city).toBe('SF');
    }
  });
});
