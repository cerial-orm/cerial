/**
 * E2E: Unset — Select + Unset combination
 *
 * Tests that select works alongside unset on updateUnique and updateMany.
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

describe('Unset: Select Combination', () => {
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

  test('updateUnique: select works alongside unset', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'S1',
        bio: 'Bio to remove',
        address: { street: 'J', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: { name: 'S1 Updated' },
      unset: { bio: true },
      select: { id: true, name: true, bio: true },
    });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe('S1 Updated');
    expect(updated!.bio).toBeUndefined();
  });

  test('updateUnique: return true with unset', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'S2', bio: 'Bio', address: { street: 'K', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });

    const result = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { bio: true },
      return: true,
    });

    expect(result).toBe(true);

    // Verify bio was actually unset
    const fetched = await client.db.UnsetTest.findUnique({ where: { id: record.id } });
    expect(fetched!.bio).toBeUndefined();
  });

  test('updateMany: select narrows returned fields after unset', async () => {
    await client.db.UnsetTest.create({
      data: {
        name: 'S3',
        bio: 'Bio3',
        age: 30,
        address: { street: 'L', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateMany({
      where: { name: { eq: 'S3' } },
      data: {},
      unset: { bio: true, age: true },
      select: { id: true, name: true, bio: true, age: true },
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]!.name).toBe('S3');
    expect(updated[0]!.bio).toBeUndefined();
    expect(updated[0]!.age).toBeUndefined();
  });
});
