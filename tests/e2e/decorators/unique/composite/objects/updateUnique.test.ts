/**
 * E2E Tests: Composite Unique (Objects) — updateUnique
 *
 * Schema: composite-unique-objects.cerial
 * Model: Warehouse with @@unique(cityZip, [location.city, location.zip])
 *                    and @@unique(nameCity, [name, location.city])
 *
 * Tests updating records by composite unique keys that use object dot-notation fields.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('Composite Unique Objects: updateUnique', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.indexes);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.indexes);
  });

  test('update by cityZip composite (change capacity)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001', street: '5th Ave' },
        capacity: 500,
      },
    });

    const result = await client.db.Warehouse.updateUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '10001' } } },
      data: { capacity: 750 },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Downtown');
    expect(result!.location.city).toBe('NYC');
    expect(result!.location.zip).toBe('10001');
    expect(result!.location.street).toBe('5th Ave');
    expect(result!.capacity).toBe(750);
  });

  test('update by nameCity composite (change capacity)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Midtown',
        location: { city: 'Chicago', zip: '60601' },
        capacity: 300,
      },
    });

    const result = await client.db.Warehouse.updateUnique({
      where: { nameCity: { name: 'Midtown', location: { city: 'Chicago' } } },
      data: { capacity: 400 },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Midtown');
    expect(result!.location.city).toBe('Chicago');
    expect(result!.location.zip).toBe('60601');
    expect(result!.capacity).toBe(400);
  });

  test('return null when composite not found', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
        capacity: 500,
      },
    });

    const result = await client.db.Warehouse.updateUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '99999' } } },
      data: { capacity: 999 },
    });

    expect(result).toBeNull();

    // Verify original record unchanged
    const original = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '10001' } } },
    });
    expect(original).not.toBeNull();
    expect(original!.capacity).toBe(500);
  });

  test("return: 'before' on cityZip returns pre-update state", async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Harbor',
        location: { city: 'LA', zip: '90001', street: 'Harbor Blvd' },
        capacity: 1000,
      },
    });

    const result = await client.db.Warehouse.updateUnique({
      where: { cityZip: { location: { city: 'LA', zip: '90001' } } },
      data: { capacity: 1200 },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Harbor');
    expect(result!.location.city).toBe('LA');
    expect(result!.location.zip).toBe('90001');
    expect(result!.location.street).toBe('Harbor Blvd');
    expect(result!.capacity).toBe(1000);

    // Verify the update actually happened
    const after = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'LA', zip: '90001' } } },
    });
    expect(after!.capacity).toBe(1200);
  });
});
