/**
 * E2E Tests: Object Where/Filter Operations
 *
 * Schema: objects.cerial
 * Tests querying with object field conditions: dot notation, operators, some/every/none.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Objects: Where', () => {
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

  describe('single object sub-field queries', () => {
    test('should find by equality shorthand', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'LA', state: 'CA' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: 'NYC' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should find by equality operator', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: { eq: 'NYC' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should find by not equal', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'LA', state: 'CA' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: { neq: 'NYC' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });

    test('should find by contains', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'New York', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'LA', state: 'CA' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: { contains: 'New' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should find by in array', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'LA', state: 'CA' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Charlie', address: { street: '3 Pine', city: 'Chicago', state: 'IL' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: { in: ['NYC', 'LA'] } } },
      });

      expect(results).toHaveLength(2);
    });

    test('should find by multiple sub-fields (AND)', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'NYC', state: 'NJ' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: 'NYC', state: 'NY' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  describe('numeric sub-field queries', () => {
    test('should find by greater than', async () => {
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
        where: { primaryLocation: { lat: { gt: 35 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should find by between', async () => {
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
        where: { primaryLocation: { lat: { between: [39, 42] } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  describe('optional object queries', () => {
    test('should find records where optional object is absent (NONE)', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '2 Ship', city: 'LA', state: 'CA' },
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '3 Main', city: 'NYC', state: 'NY' },
          // shipping omitted — NONE
        },
      });

      // Use isNone to find absent object fields
      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: 'NYC' }, name: 'Bob' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.shipping).toBeUndefined();
    });

    test('should find records where optional object has matching sub-field', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '2 Ship', city: 'LA', state: 'CA' },
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '3 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '4 Ship', city: 'NYC', state: 'NY' },
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { shipping: { city: 'LA' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  describe('logical operators', () => {
    test('should handle OR with object fields', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'LA', state: 'CA' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Charlie', address: { street: '3 Pine', city: 'Chicago', state: 'IL' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: {
          OR: [{ address: { city: 'NYC' } }, { address: { city: 'LA' } }],
        },
      });

      expect(results).toHaveLength(2);
    });

    test('should handle NOT with object fields', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'LA', state: 'CA' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { NOT: { address: { city: 'NYC' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });

    test('should handle AND at model level with object fields', async () => {
      await client.db.ObjectTestUser.create({
        data: { name: 'Alice', address: { street: '1 Main', city: 'NYC', state: 'NY' } },
      });
      await client.db.ObjectTestUser.create({
        data: { name: 'Bob', address: { street: '2 Oak', city: 'NYC', state: 'NY' } },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: 'NYC' }, name: 'Alice' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  describe('array of objects (some/every/none)', () => {
    test('some: should find if at least one element matches', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74 },
            { lat: 34, lng: -118 },
          ],
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '2 Oak', city: 'LA', state: 'CA' },
          locations: [{ lat: 51, lng: 0 }],
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { locations: { some: { lat: { gt: 45 } } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });

    test('some: should find if any element matches equality', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74 },
            { lat: 34, lng: -118 },
          ],
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { locations: { some: { lat: 34 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('every: should match only if all elements satisfy', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74 },
            { lat: 42, lng: -71 },
          ],
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '2 Oak', city: 'LA', state: 'CA' },
          locations: [
            { lat: 34, lng: -118 },
            { lat: 51, lng: 0 },
          ],
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { locations: { every: { lat: { gte: 39 } } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('none: should match only if no elements satisfy', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74 },
            { lat: 42, lng: -71 },
          ],
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '2 Oak', city: 'LA', state: 'CA' },
          locations: [
            { lat: 34, lng: -118 },
            { lat: 33, lng: -117 },
          ],
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { locations: { none: { lat: { gt: 35 } } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });
  });

  describe('combined queries', () => {
    test('should combine primitive, single object, and array object in same where', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          locations: [{ lat: 40, lng: -74 }],
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '2 Oak', city: 'NYC', state: 'NY' },
          locations: [{ lat: 34, lng: -118 }],
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: {
          name: 'Alice',
          address: { city: 'NYC' },
          locations: { some: { lat: { gte: 40 } } },
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });
});
