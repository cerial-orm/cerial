/**
 * E2E Tests: Object OrderBy Operations
 *
 * Schema: objects.cerial
 * Tests ordering by object sub-fields.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Objects: OrderBy', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.objects);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.objects);
  });

  describe('single object orderBy', () => {
    test('should order ascending by object sub-field', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Zara', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '2 Oak', city: 'Austin', state: 'TX' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '3 Pine', city: 'Chicago', state: 'IL' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        orderBy: { address: { city: 'asc' } },
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.address.city).toBe('Austin');
      expect(results[1]!.address.city).toBe('Chicago');
      expect(results[2]!.address.city).toBe('NYC');
    });

    test('should order descending by object sub-field', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'Austin', state: 'TX' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'NYC', state: 'NY' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        orderBy: { address: { city: 'desc' } },
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.address.city).toBe('NYC');
      expect(results[1]!.address.city).toBe('Austin');
    });

    test('should order by numeric sub-field', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          primaryLocation: { lat: 40.7, lng: -74 },
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '2 Oak', city: 'LA', state: 'CA' },
          primaryLocation: { lat: 34.0, lng: -118 },
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        orderBy: { primaryLocation: { lat: 'asc' } },
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.name).toBe('Bob');
      expect(results[1]!.name).toBe('Alice');
    });
  });

  describe('combined orderBy', () => {
    test('should combine orderBy on object field with where', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'Austin', state: 'TX' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Charlie', address: { street: '3 Pine', city: 'NYC', state: 'NY' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { state: 'NY' } },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.name).toBe('Alice');
      expect(results[1]!.name).toBe('Charlie');
    });

    test('should combine orderBy with limit and offset', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'A', address: { street: '1 Main', city: 'Austin', state: 'TX' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'B', address: { street: '2 Oak', city: 'Boston', state: 'MA' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'C', address: { street: '3 Pine', city: 'Chicago', state: 'IL' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        orderBy: { address: { city: 'asc' } },
        limit: 2,
        offset: 1,
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.address.city).toBe('Boston');
      expect(results[1]!.address.city).toBe('Chicago');
    });
  });
});
