/**
 * E2E Tests: Composite Unique (Objects) — deleteUnique
 *
 * Schema: composite-unique-objects.cerial
 * Model: Warehouse with @@unique(cityZip, [location.city, location.zip])
 *                    and @@unique(nameCity, [name, location.city])
 *
 * Tests deleting records by composite unique keys that use object dot-notation fields.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanAndPrepare, truncateIndexTables, createTestClient, CerialClient, testConfig } from '../../../test-helper';

describe('Composite Unique Objects: deleteUnique', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanAndPrepare(client);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateIndexTables(client);
  });

  test('delete by cityZip, verify record is gone', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001', street: '5th Ave' },
        capacity: 500,
      },
    });

    // Verify record exists
    const before = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '10001' } } },
    });
    expect(before).not.toBeNull();

    // Delete by composite key
    const result = await client.db.Warehouse.deleteUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '10001' } } },
    });

    expect(result).toBe(true);

    // Verify record is gone
    const after = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '10001' } } },
    });
    expect(after).toBeNull();
  });

  test("delete by nameCity with return: 'before' returns deleted record", async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Midtown',
        location: { city: 'Chicago', zip: '60601' },
        capacity: 300,
      },
    });

    const result = await client.db.Warehouse.deleteUnique({
      where: { nameCity: { name: 'Midtown', location: { city: 'Chicago' } } },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Midtown');
    expect(result!.location.city).toBe('Chicago');
    expect(result!.location.zip).toBe('60601');
    expect(result!.capacity).toBe(300);

    // Verify record is gone
    const after = await client.db.Warehouse.findUnique({
      where: { nameCity: { name: 'Midtown', location: { city: 'Chicago' } } },
    });
    expect(after).toBeNull();
  });

  test('return: true returns true when record exists, false when not', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Harbor',
        location: { city: 'LA', zip: '90001' },
        capacity: 1000,
      },
    });

    const resultExists = await client.db.Warehouse.deleteUnique({
      where: { cityZip: { location: { city: 'LA', zip: '90001' } } },
      return: true,
    });

    expect(resultExists).toBe(true);

    // Non-existent composite key
    const resultMissing = await client.db.Warehouse.deleteUnique({
      where: { cityZip: { location: { city: 'LA', zip: '90001' } } },
      return: true,
    });

    expect(resultMissing).toBe(false);
  });
});
