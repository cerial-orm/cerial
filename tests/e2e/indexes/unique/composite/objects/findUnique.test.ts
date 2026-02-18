/**
 * E2E Tests: Composite Unique (Objects) — findUnique
 *
 * Schema: composite-unique-objects.cerial
 * Model: Warehouse with @@unique(cityZip, [location.city, location.zip])
 *                    and @@unique(nameCity, [name, location.city])
 *
 * Tests finding records by composite unique keys that use object dot-notation fields.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  INDEX_TABLES,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('Composite Unique Objects: findUnique', () => {
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

  test('find by cityZip composite (both dot-notation fields) returns correct record', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001', street: '5th Ave' },
        capacity: 500,
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '10001' } } },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Downtown');
    expect(result!.location.city).toBe('NYC');
    expect(result!.location.zip).toBe('10001');
    expect(result!.location.street).toBe('5th Ave');
    expect(result!.capacity).toBe(500);
    expect(result!.id).toBeDefined();
    expect(result!.id).toBeInstanceOf(CerialId);
  });

  test('return null when cityZip not found (wrong zip)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
        capacity: 500,
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'NYC', zip: '99999' } } },
    });

    expect(result).toBeNull();
  });

  test('find by nameCity composite (mixed primitive + dot-notation) returns correct record', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Midtown',
        location: { city: 'Chicago', zip: '60601' },
        capacity: 300,
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: { nameCity: { name: 'Midtown', location: { city: 'Chicago' } } },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Midtown');
    expect(result!.location.city).toBe('Chicago');
    expect(result!.location.zip).toBe('60601');
    expect(result!.capacity).toBe(300);
    expect(result!.id).toBeDefined();
    expect(result!.id).toBeInstanceOf(CerialId);
  });

  test('return null when nameCity not found (wrong city)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Midtown',
        location: { city: 'Chicago', zip: '60601' },
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: { nameCity: { name: 'Midtown', location: { city: 'Boston' } } },
    });

    expect(result).toBeNull();
  });

  test('find with select + cityZip composite returns only selected fields', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Harbor',
        location: { city: 'LA', zip: '90001', street: 'Harbor Blvd' },
        capacity: 1000,
      },
    });

    const result = await client.db.Warehouse.findUnique({
      where: { cityZip: { location: { city: 'LA', zip: '90001' } } },
      select: { id: true, name: true, location: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeDefined();
    expect(result!.name).toBe('Harbor');
    expect(result!.location.city).toBe('LA');
    expect(result!.location.zip).toBe('90001');
    expect(result!.location.street).toBe('Harbor Blvd');
    expect((result as Record<string, unknown>).capacity).toBeUndefined();
  });
});
