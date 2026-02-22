/**
 * E2E Tests: Composite Unique (Mixed) — error handling
 *
 * Schema: composite-unique-objects.cerial
 * Model: Warehouse with @@unique(nameCity, [name, location.city])
 *                    and @@unique(cityZip, [location.city, location.zip])
 *
 * Tests that duplicate mixed composite key violations are rejected by the database,
 * partial matches are allowed, and both composites are enforced independently.
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

describe('Composite Unique Mixed: errors', () => {
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

  test('DB rejects duplicate nameCity (same name+city, different zip)', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
      },
    });

    // Same name + same city but different zip = nameCity composite violation
    let threw = false;
    try {
      await client.db.Warehouse.create({
        data: {
          name: 'Downtown',
          location: { city: 'NYC', zip: '10002' },
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('allows same name with different city', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'NYC', zip: '10001' },
      },
    });

    // Same name but different city — should succeed
    const result = await client.db.Warehouse.create({
      data: {
        name: 'Downtown',
        location: { city: 'Chicago', zip: '60601' },
      },
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Downtown');
    expect(result.location.city).toBe('Chicago');

    // Verify both records exist
    const count = await client.db.Warehouse.count();
    expect(count).toBe(2);
  });

  test('Both composites (cityZip, nameCity) enforced independently', async () => {
    await client.db.Warehouse.create({
      data: {
        name: 'Alpha',
        location: { city: 'Boston', zip: '02101' },
      },
    });

    // Different name, same city+zip → violates cityZip but not nameCity
    let threw1 = false;
    try {
      await client.db.Warehouse.create({
        data: {
          name: 'Beta',
          location: { city: 'Boston', zip: '02101' },
        },
      });
    } catch {
      threw1 = true;
    }
    expect(threw1).toBe(true);

    // Same name, same city, different zip → violates nameCity but not cityZip
    let threw2 = false;
    try {
      await client.db.Warehouse.create({
        data: {
          name: 'Alpha',
          location: { city: 'Boston', zip: '02102' },
        },
      });
    } catch {
      threw2 = true;
    }
    expect(threw2).toBe(true);

    // Different name, different city, same zip → violates neither
    const result = await client.db.Warehouse.create({
      data: {
        name: 'Gamma',
        location: { city: 'Denver', zip: '02101' },
      },
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Gamma');
    expect(result.location.city).toBe('Denver');

    // Verify we have exactly 2 records (original + Gamma)
    const count = await client.db.Warehouse.count();
    expect(count).toBe(2);
  });
});
