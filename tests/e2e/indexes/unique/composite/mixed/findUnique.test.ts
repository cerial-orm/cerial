/**
 * E2E Tests: Composite Unique (Mixed) — findUnique
 *
 * Schema: composite-unique-objects.cerial
 * Model: Warehouse with @@unique(nameCity, [name, location.city])
 *
 * Tests finding records by a mixed composite unique key
 * that combines a primitive field (name) with a dot-notation object subfield (location.city).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import { cleanupTables, truncateTables, INDEX_TABLES, createTestClient, CerialClient, testConfig } from '../../../../test-helper';

describe('Composite Unique Mixed: findUnique', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, INDEX_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, INDEX_TABLES);
  });

  test('find by mixed composite (nameCity) returns correct record', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: { nameCity: { name: 'Downtown', location: { city: 'NYC' } } },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Downtown');
    expect(result!.location.city).toBe('NYC');
    expect(result!.location.zip).toBe('10001');
    expect(result!.id).toBeDefined();
    expect(result!.id).toBeInstanceOf(CerialId);
  });

  test('return null when mixed composite not found', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: { nameCity: { name: 'Downtown', location: { city: 'Chicago' } } },
    });

    expect(result).toBeNull();
  });

  test('find with additional filters alongside mixed composite', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Central',
        location: { city: 'Boston', zip: '02101' },
        capacity: 500,
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: {
        nameCity: { name: 'Central', location: { city: 'Boston' } },
        capacity: 500,
      },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Central');
    expect(result!.location.city).toBe('Boston');
    expect(result!.capacity).toBe(500);
  });

  test('return null when mixed composite matches but additional filter fails', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Central',
        location: { city: 'Boston', zip: '02101' },
        capacity: 500,
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: {
        nameCity: { name: 'Central', location: { city: 'Boston' } },
        capacity: 999,
      },
    });

    expect(result).toBeNull();
  });

  test('works alongside the other composite (cityZip) on same model', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Uptown',
        location: { city: 'LA', zip: '90001' },
        capacity: 300,
      },
    });

    // Find by nameCity composite
    const byNameCity = await client.db.Warehouse.findUnique({
      where: { nameCity: { name: 'Uptown', location: { city: 'LA' } } },
    });

    expect(byNameCity).toBeDefined();
    expect(byNameCity).not.toBeNull();
    expect(byNameCity!.name).toBe('Uptown');
    expect(byNameCity!.location.city).toBe('LA');

    // Find the same record by cityZip composite
    const byCityZip = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'LA', zip: '90001' } } },
    });

    expect(byCityZip).toBeDefined();
    expect(byCityZip).not.toBeNull();
    expect(byCityZip!.name).toBe('Uptown');
    expect(byCityZip!.location.zip).toBe('90001');

    // Both should return the same record
    expect(byNameCity!.id.equals(byCityZip!.id)).toBe(true);
  });
});
