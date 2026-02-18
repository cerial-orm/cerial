/**
 * E2E Tests: Nested Objects, Self-Referencing, and Object Reuse
 *
 * Schema: objects.cerial
 * Tests multi-level nesting, TreeNode self-referencing, and same object type reuse.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

describe('E2E Objects: Nested & Self-Referencing', () => {
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

  describe('two-level nesting (GeoPoint → Address)', () => {
    test('should create and read back nested structure', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '1 Main', city: 'NYC', state: 'NY', zipCode: '10001' },
          },
        },
      });

      // Read back
      const read = await client.db.ObjectTestUser.findUnique({ where: { id: user.id } });
      expect(read).toBeDefined();
      expect(read!.primaryLocation!.lat).toBe(40.7128);
      expect(read!.primaryLocation!.label!.city).toBe('NYC');
      expect(read!.primaryLocation!.label!.zipCode).toBe('10001');
    });

    test('should update nested label sub-field via merge', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '2 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '2 Main', city: 'NYC', state: 'NY' },
          },
        },
      });

      // Update only lat - preserves rest including nested label
      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { primaryLocation: { lat: 41.0 } },
      });

      expect(updated!.primaryLocation!.lat).toBe(41.0);
      expect(updated!.primaryLocation!.lng).toBe(-74.006);
      expect(updated!.primaryLocation!.label!.city).toBe('NYC');
    });

    test('should query by nested field', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Charlie',
          address: { street: '3 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '3 Main', city: 'NYC', state: 'NY' },
          },
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Dave',
          address: { street: '4 Main', city: 'LA', state: 'CA' },
          primaryLocation: {
            lat: 34.0522,
            lng: -118.2437,
            label: { street: '4 Main', city: 'LA', state: 'CA' },
          },
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { primaryLocation: { label: { city: 'NYC' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Charlie');
    });
  });

  describe('self-referencing (TreeNode)', () => {
    test('should create TreeNode with empty children', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '10 Main', city: 'NYC', state: 'NY' },
          metadata: { value: 1, children: [] },
        },
      });

      expect(order.metadata!.value).toBe(1);
      expect(order.metadata!.children).toEqual([]);
    });

    test('should create TreeNode with 1 level of children', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '11 Main', city: 'NYC', state: 'NY' },
          metadata: {
            value: 1,
            children: [
              { value: 2, children: [] },
              { value: 3, children: [] },
            ],
          },
        },
      });

      expect(order.metadata!.children).toHaveLength(2);
      expect(order.metadata!.children[0]!.value).toBe(2);
    });

    test('should create TreeNode with 2 levels of children', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '12 Main', city: 'NYC', state: 'NY' },
          metadata: {
            value: 1,
            children: [
              {
                value: 2,
                children: [
                  { value: 4, children: [] },
                  { value: 5, children: [] },
                ],
              },
              { value: 3, children: [] },
            ],
          },
        },
      });

      expect(order.metadata!.children[0]!.children).toHaveLength(2);
      expect(order.metadata!.children[0]!.children[0]!.value).toBe(4);
    });

    test('should create TreeNode with 3+ levels', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '13 Main', city: 'NYC', state: 'NY' },
          metadata: {
            value: 1,
            children: [
              {
                value: 2,
                children: [
                  {
                    value: 4,
                    children: [{ value: 8, children: [] }],
                  },
                ],
              },
            ],
          },
        },
      });

      expect(order.metadata!.children[0]!.children[0]!.children[0]!.value).toBe(8);
    });

    test('should read back self-referencing structure', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '14 Main', city: 'NYC', state: 'NY' },
          metadata: {
            value: 10,
            children: [{ value: 20, children: [{ value: 30, children: [] }] }],
          },
        },
      });

      const read = await client.db.ObjectTestOrder.findUnique({ where: { id: order.id } });
      expect(read!.metadata!.value).toBe(10);
      expect(read!.metadata!.children[0]!.value).toBe(20);
      expect(read!.metadata!.children[0]!.children[0]!.value).toBe(30);
    });

    test('should handle metadata omitted (optional self-ref)', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '15 Main', city: 'NYC', state: 'NY' },
        },
      });

      // metadata is optional object — omitted means NONE (undefined)
      expect(order.metadata).toBeUndefined();
    });
  });

  describe('object reuse (same type, multiple locations)', () => {
    test('same object type in multiple fields should be independent', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Eve',
          address: { street: '20 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '21 Ship', city: 'LA', state: 'CA' },
        },
      });

      expect(user.address.city).toBe('NYC');
      expect(user.shipping!.city).toBe('LA');
    });

    test('should update address without affecting shipping', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Frank',
          address: { street: '22 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '23 Ship', city: 'LA', state: 'CA' },
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { address: { city: 'Brooklyn' } },
      });

      expect(updated!.address.city).toBe('Brooklyn');
      expect(updated!.shipping!.city).toBe('LA');
    });

    test('should query address without matching shipping', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Grace',
          address: { street: '24 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '25 Ship', city: 'LA', state: 'CA' },
        },
      });

      // Query by address city - should not match shipping city
      const results = await client.db.ObjectTestUser.findMany({
        where: { address: { city: 'LA' } },
      });

      expect(results).toHaveLength(0);
    });

    test('same object type across different models', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Hank',
          address: { street: '26 Main', city: 'NYC', state: 'NY' },
        },
      });

      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '26 Main', city: 'NYC', state: 'NY' },
        },
      });

      // Both models store address independently
      expect(user.address.city).toBe('NYC');
      expect(order.billingAddress.city).toBe('NYC');

      // Updating one doesn't affect the other
      await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { address: { city: 'Brooklyn' } },
      });

      const readOrder = await client.db.ObjectTestOrder.findUnique({ where: { id: order.id } });
      expect(readOrder!.billingAddress.city).toBe('NYC');
    });
  });

  describe('optional nested objects', () => {
    test('GeoPoint with label omitted (no null for object fields)', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Ivy',
          address: { street: '30 Main', city: 'NYC', state: 'NY' },
          primaryLocation: { lat: 40, lng: -74 },
        },
      });

      // label is optional object — omitted means NONE (undefined)
      expect(user.primaryLocation!.label).toBeUndefined();
    });

    test('GeoPoint with label omitted (NONE)', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Jack',
          address: { street: '31 Main', city: 'NYC', state: 'NY' },
          primaryLocation: { lat: 40, lng: -74 },
        },
      });

      expect(user.primaryLocation!.label).toBeUndefined();
    });

    test('GeoPoint with label as full address', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Kate',
          address: { street: '32 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40,
            lng: -74,
            label: { street: '32 Main', city: 'NYC', state: 'NY' },
          },
        },
      });

      expect(user.primaryLocation!.label!.city).toBe('NYC');
    });
  });

  describe('array of objects with nested objects', () => {
    test('locations with nested Address labels', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Leo',
          address: { street: '40 Main', city: 'NYC', state: 'NY' },
          locations: [
            {
              lat: 40,
              lng: -74,
              label: { street: '40 Main', city: 'NYC', state: 'NY' },
            },
            {
              lat: 34,
              lng: -118,
              label: { street: '41 Oak', city: 'LA', state: 'CA' },
            },
          ],
        },
      });

      expect(user.locations[0]!.label!.city).toBe('NYC');
      expect(user.locations[1]!.label!.city).toBe('LA');
    });

    test('mixed: some elements have label, some do not', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Mia',
          address: { street: '42 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74, label: { street: '42 Main', city: 'NYC', state: 'NY' } },
            { lat: 34, lng: -118 },
            { lat: 51, lng: 0 },
          ],
        },
      });

      expect(user.locations[0]!.label!.city).toBe('NYC');
      expect(user.locations[1]!.label).toBeUndefined();
      expect(user.locations[2]!.label).toBeUndefined();
    });

    test('should query by nested field within array (some)', async () => {
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Nora',
          address: { street: '43 Main', city: 'NYC', state: 'NY' },
          locations: [{ lat: 40, lng: -74, label: { street: '43 Main', city: 'NYC', state: 'NY' } }],
        },
      });
      await client.db.ObjectTestUser.create({
        data: {
          name: 'Owen',
          address: { street: '44 Oak', city: 'LA', state: 'CA' },
          locations: [{ lat: 34, lng: -118, label: { street: '44 Oak', city: 'LA', state: 'CA' } }],
        },
      });

      const results = await client.db.ObjectTestUser.findMany({
        where: { locations: { some: { label: { city: 'NYC' } } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Nora');
    });
  });
});
