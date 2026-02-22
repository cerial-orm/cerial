/**
 * E2E Tests: Composite Unique (Objects) — error handling
 *
 * Schema: composite-unique-objects.cerial
 * Model: Warehouse with @@unique(cityZip, [location.city, location.zip])
 *                    and @@unique(nameCity, [name, location.city])
 *
 * Tests that duplicate composite key violations on object dot-notation fields
 * are rejected by the database, and that partial matches do not violate the constraint.
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

describe('Composite Unique Objects: errors', () => {
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

  test('DB rejects duplicate cityZip (same city + zip, different name)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
        capacity: 500,
      },
    });

    // Same city + zip = composite unique violation
    let threw = false;
    try {
      await client.db.Warehouse.create({
        data: {
          name: 'Uptown',
          location: { city: 'NYC', zip: '10001' },
          capacity: 200,
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('allows same city with different zip (not a violation)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
        capacity: 500,
      },
    });

    // Same city but different zip — should succeed
    const result = await client.db.Warehouse.create({
      data: {
        name: 'Uptown',
        location: { city: 'NYC', zip: '10002' },
        capacity: 200,
      },
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Uptown');
    expect(result.location.city).toBe('NYC');
    expect(result.location.zip).toBe('10002');

    // Verify both records exist
    const count = await client.db.Warehouse.count();
    expect(count).toBe(2);
  });

  test('DB rejects duplicate nameCity (same name + city, different zip)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Central',
        location: { city: 'Boston', zip: '02101' },
        capacity: 400,
      },
    });

    // Same name + city = composite unique violation
    let threw = false;
    try {
      await client.db.Warehouse.create({
        data: {
          name: 'Central',
          location: { city: 'Boston', zip: '02102' },
          capacity: 600,
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('allows same name with different city (not a violation)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Central',
        location: { city: 'Boston', zip: '02101' },
        capacity: 400,
      },
    });

    // Same name but different city — should succeed
    const result = await client.db.Warehouse.create({
      data: {
        name: 'Central',
        location: { city: 'Denver', zip: '80201' },
        capacity: 350,
      },
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Central');
    expect(result.location.city).toBe('Denver');
    expect(result.location.zip).toBe('80201');

    // Verify both records exist
    const count = await client.db.Warehouse.count();
    expect(count).toBe(2);
  });
});
