/**
 * E2E Tests: @index (Single Field) — migration
 *
 * Schema: composite-unique-objects.cerial
 * Model: Warehouse with `name String @index`
 *
 * Tests that @index generates a DEFINE INDEX statement in the DB
 * and that it does NOT enforce uniqueness.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  INDEX_TABLES,
  testConfig,
  truncateTables,
} from '../../../test-helper';

describe('@index Single Field: migration', () => {
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

  test('after migration, the name index exists in the DB', async () => {
    const surreal = client.getSurreal();
    expect(surreal).toBeDefined();

    const [info] = await surreal!.query<[Record<string, unknown>]>('INFO FOR TABLE warehouse;');
    const indexes = info.indexes as Record<string, string>;

    // The single-field @index generates: DEFINE INDEX warehouse_name_index ON warehouse COLUMNS name
    const nameIndex = indexes.warehouse_name_index;
    expect(nameIndex).toBeDefined();
    expect(nameIndex).toContain('name');
    // Should NOT contain UNIQUE
    expect(nameIndex).not.toContain('UNIQUE');
  });

  test('index does NOT enforce uniqueness — can create two warehouses with same name', async () => {
    const first = await client.db.Warehouse.create({
      data: {
        name: 'Central Hub',
        location: { city: 'NYC', zip: '10001' },
      },
    });

    // Same name but different location — should succeed since @index is not @unique
    const second = await client.db.Warehouse.create({
      data: {
        name: 'Central Hub',
        location: { city: 'Chicago', zip: '60601' },
      },
    });

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first.name).toBe('Central Hub');
    expect(second.name).toBe('Central Hub');
    expect(first.location.city).toBe('NYC');
    expect(second.location.city).toBe('Chicago');

    // Both records exist
    const count = await client.db.Warehouse.count({ name: 'Central Hub' });
    expect(count).toBe(2);
  });
});
