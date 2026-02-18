/**
 * E2E Tests: Object Create Operations
 *
 * Schema: objects.cerial
 * Tests creating records with embedded object fields.
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
import { isCerialId } from 'cerial';

describe('E2E Objects: Create', () => {
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

  describe('required single object', () => {
    test('should create with all required sub-fields', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '123 Main St', city: 'NYC', state: 'NY' },
        },
      });

      expect(user).toBeDefined();
      expect(user.name).toBe('Alice');
      expect(user.address).toEqual({ street: '123 Main St', city: 'NYC', state: 'NY' });
      expect(isCerialId(user.id)).toBe(true);
    });

    test('should create with optional sub-field included', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '456 Oak Ave', city: 'LA', state: 'CA', zipCode: '90001' },
        },
      });

      expect(user.address.zipCode).toBe('90001');
      expect(user.address.city).toBe('LA');
    });

    test('should create with optional sub-field omitted (NONE)', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Charlie',
          address: { street: '789 Pine Rd', city: 'Chicago', state: 'IL' },
        },
      });

      // zipCode is optional and omitted - should be absent or undefined
      expect(user.address.street).toBe('789 Pine Rd');
      expect(user.address.zipCode).toBeUndefined();
    });

    test('should verify returned object structure matches input', async () => {
      const input = { street: '100 Broadway', city: 'NYC', state: 'NY', zipCode: '10001' };
      const user = await client.db.ObjectTestUser.create({
        data: { name: 'Dave', address: input },
      });

      expect(user.address.street).toBe(input.street);
      expect(user.address.city).toBe(input.city);
      expect(user.address.state).toBe(input.state);
      expect(user.address.zipCode).toBe(input.zipCode);
    });
  });

  describe('optional single object', () => {
    test('should create with optional object provided', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Eve',
          address: { street: '1 First St', city: 'NYC', state: 'NY' },
          shipping: { street: '2 Second St', city: 'LA', state: 'CA' },
        },
      });

      expect(user.shipping).toEqual({ street: '2 Second St', city: 'LA', state: 'CA' });
    });

    test('should create with optional object omitted (undefined)', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Frank',
          address: { street: '3 Third St', city: 'Chicago', state: 'IL' },
        },
      });

      // shipping omitted - should be NONE (undefined)
      expect(user.shipping).toBeUndefined();
    });

    test('should treat explicit undefined as NONE for object fields', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Grace',
          address: { street: '4 Fourth St', city: 'Miami', state: 'FL' },
          shipping: undefined,
        },
      });

      // Object fields: undefined means NONE (absent)
      expect(user.shipping).toBeUndefined();
    });
  });

  describe('array of objects', () => {
    test('should create with array of multiple objects', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Hank',
          address: { street: '10 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40.7128, lng: -74.006 },
            { lat: 34.0522, lng: -118.2437 },
          ],
        },
      });

      expect(user.locations).toHaveLength(2);
      expect(user.locations[0]!.lat).toBe(40.7128);
      expect(user.locations[1]!.lat).toBe(34.0522);
    });

    test('should create with single-element array', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Ivy',
          address: { street: '11 Main', city: 'NYC', state: 'NY' },
          locations: [{ lat: 51.5074, lng: -0.1278 }],
        },
      });

      expect(user.locations).toHaveLength(1);
      expect(user.locations[0]!.lat).toBe(51.5074);
    });

    test('should create with empty array', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Jack',
          address: { street: '12 Main', city: 'NYC', state: 'NY' },
          locations: [],
        },
      });

      expect(user.locations).toEqual([]);
    });

    test('should create with array omitted (defaults to empty)', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Kate',
          address: { street: '13 Main', city: 'NYC', state: 'NY' },
        },
      });

      expect(user.locations).toEqual([]);
    });

    test('should preserve element ordering', async () => {
      const locs = [
        { lat: 1, lng: 10 },
        { lat: 2, lng: 20 },
        { lat: 3, lng: 30 },
      ];
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Leo',
          address: { street: '14 Main', city: 'NYC', state: 'NY' },
          locations: locs,
        },
      });

      expect(user.locations[0]!.lat).toBe(1);
      expect(user.locations[1]!.lat).toBe(2);
      expect(user.locations[2]!.lat).toBe(3);
    });
  });

  describe('nested objects', () => {
    test('should create GeoPoint with nested Address label', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Mike',
          address: { street: '20 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '20 Main', city: 'NYC', state: 'NY' },
          },
        },
      });

      expect(user.primaryLocation).toBeDefined();
      expect(user.primaryLocation!.label).toBeDefined();
      expect(user.primaryLocation!.label!.city).toBe('NYC');
    });

    test('should create GeoPoint with label omitted (optional nested, no null)', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Nora',
          address: { street: '21 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 34.0522,
            lng: -118.2437,
          },
        },
      });

      // label is optional object — omitted means NONE (undefined)
      expect(user.primaryLocation!.label).toBeUndefined();
    });

    test('should create GeoPoint with label omitted (NONE)', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Owen',
          address: { street: '22 Main', city: 'NYC', state: 'NY' },
          primaryLocation: { lat: 51.5074, lng: -0.1278 },
        },
      });

      expect(user.primaryLocation!.label).toBeUndefined();
    });
  });

  describe('self-referencing (TreeNode)', () => {
    test('should create with empty children array', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '30 Main', city: 'NYC', state: 'NY' },
          metadata: { value: 1, children: [] },
        },
      });

      expect(order.metadata).toBeDefined();
      expect(order.metadata!.value).toBe(1);
      expect(order.metadata!.children).toEqual([]);
    });

    test('should create with one level of children', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '31 Main', city: 'NYC', state: 'NY' },
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
      expect(order.metadata!.children[1]!.value).toBe(3);
    });

    test('should create with two levels of children', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '32 Main', city: 'NYC', state: 'NY' },
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
            ],
          },
        },
      });

      expect(order.metadata!.children[0]!.children).toHaveLength(2);
      expect(order.metadata!.children[0]!.children[0]!.value).toBe(4);
    });

    test('should create with metadata omitted (optional self-ref)', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '33 Main', city: 'NYC', state: 'NY' },
        },
      });

      // metadata is optional object — omitted means NONE (undefined)
      expect(order.metadata).toBeUndefined();
    });
  });

  describe('reuse / cross-model', () => {
    test('same object type in multiple fields of same model', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Pat',
          address: { street: '40 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '41 Oak', city: 'LA', state: 'CA' },
        },
      });

      expect(user.address.city).toBe('NYC');
      expect(user.shipping!.city).toBe('LA');
    });

    test('same object type in different models', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Quinn',
          address: { street: '50 Main', city: 'NYC', state: 'NY' },
        },
      });

      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '50 Main', city: 'NYC', state: 'NY' },
        },
      });

      expect(user.address.city).toBe('NYC');
      expect(order.billingAddress.city).toBe('NYC');
    });
  });

  describe('array of objects with sub-fields (OrderItem)', () => {
    test('should create with items array', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '60 Main', city: 'NYC', state: 'NY' },
          items: [
            { productName: 'Widget', quantity: 2, price: 9.99, tags: ['sale'] },
            { productName: 'Gadget', quantity: 1, price: 19.99, tags: ['new', 'featured'] },
          ],
        },
      });

      expect(order.items).toHaveLength(2);
      expect(order.items[0]!.productName).toBe('Widget');
      expect(order.items[0]!.tags).toEqual(['sale']);
      expect(order.items[1]!.tags).toEqual(['new', 'featured']);
    });

    test('should create with items omitted (defaults to empty)', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '61 Main', city: 'NYC', state: 'NY' },
        },
      });

      expect(order.items).toEqual([]);
    });
  });
});
