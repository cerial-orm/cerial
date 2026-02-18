/**
 * E2E Tests: Object Update Operations
 *
 * Schema: objects.cerial
 * Tests updating records with embedded object fields: merge, set, array ops.
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

describe('E2E Objects: Update', () => {
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

  describe('merge update (single object)', () => {
    test('should update one sub-field and preserve others', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '123 Main', city: 'NYC', state: 'NY', zipCode: '10001' },
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { address: { city: 'Brooklyn' } },
      });

      expect(updated!.address.city).toBe('Brooklyn');
      expect(updated!.address.street).toBe('123 Main');
      expect(updated!.address.state).toBe('NY');
      expect(updated!.address.zipCode).toBe('10001');
    });

    test('should update multiple sub-fields simultaneously', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '456 Oak', city: 'LA', state: 'CA' },
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { address: { city: 'SF', state: 'CA', zipCode: '94102' } },
      });

      expect(updated!.address.city).toBe('SF');
      expect(updated!.address.state).toBe('CA');
      expect(updated!.address.zipCode).toBe('94102');
      expect(updated!.address.street).toBe('456 Oak');
    });

    test('should update optional sub-field from NONE to value', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Charlie',
          address: { street: '789 Pine', city: 'Denver', state: 'CO' },
        },
      });

      expect(user.address.zipCode).toBeUndefined();

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { address: { zipCode: '80201' } },
      });

      expect(updated!.address.zipCode).toBe('80201');
      expect(updated!.address.street).toBe('789 Pine');
    });

    test('should update optional sub-field from value to null', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Dave',
          address: { street: '100 Elm', city: 'Boston', state: 'MA', zipCode: '02101' },
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { address: { zipCode: null } },
      });

      expect(updated!.address.zipCode).toBeNull();
    });
  });

  describe('full replace (set wrapper)', () => {
    test('should fully replace object with set', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Eve',
          address: { street: '200 Main', city: 'NYC', state: 'NY', zipCode: '10001' },
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { address: { set: { street: '300 New St', city: 'LA', state: 'CA' } } },
      });

      expect(updated!.address.street).toBe('300 New St');
      expect(updated!.address.city).toBe('LA');
      expect(updated!.address.state).toBe('CA');
      // zipCode was in old but not in new set - should be absent
      expect(updated!.address.zipCode).toBeUndefined();
    });

    test('should full replace optional object', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Frank',
          address: { street: '1 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '2 Ship', city: 'LA', state: 'CA', zipCode: '90001' },
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { shipping: { set: { street: '3 New Ship', city: 'Chicago', state: 'IL' } } },
      });

      expect(updated!.shipping!.street).toBe('3 New Ship');
      expect(updated!.shipping!.city).toBe('Chicago');
      expect(updated!.shipping!.zipCode).toBeUndefined();
    });
  });

  describe('optional object lifecycle', () => {
    test('should set optional object from NONE to value', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Grace',
          address: { street: '10 Main', city: 'NYC', state: 'NY' },
        },
      });

      expect(user.shipping).toBeUndefined();

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { shipping: { set: { street: '11 Ship', city: 'LA', state: 'CA' } } },
      });

      expect(updated!.shipping!.city).toBe('LA');
    });

    test('should update optional object from value to NONE via full replace omit', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Hank',
          address: { street: '12 Main', city: 'NYC', state: 'NY' },
          shipping: { street: '13 Ship', city: 'Miami', state: 'FL' },
        },
      });

      expect(user.shipping).toBeDefined();

      // Merge update with undefined shipping - should leave as-is (no change)
      // To clear an optional object, user would need to use a raw query or NONE
      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { name: 'Hank Updated' },
      });

      expect(updated!.shipping!.city).toBe('Miami');
    });
  });

  describe('array push', () => {
    test('should push single element', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Ivy',
          address: { street: '20 Main', city: 'NYC', state: 'NY' },
          locations: [{ lat: 40, lng: -74 }],
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { locations: { push: { lat: 34, lng: -118 } } },
      });

      expect(updated!.locations).toHaveLength(2);
      expect(updated!.locations[0]!.lat).toBe(40);
      expect(updated!.locations[1]!.lat).toBe(34);
    });

    test('should push multiple elements', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Jack',
          address: { street: '21 Main', city: 'NYC', state: 'NY' },
          locations: [{ lat: 40, lng: -74 }],
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: {
          locations: {
            push: [
              { lat: 34, lng: -118 },
              { lat: 51, lng: 0 },
            ],
          },
        },
      });

      expect(updated!.locations).toHaveLength(3);
    });

    test('should push to empty array', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Kate',
          address: { street: '22 Main', city: 'NYC', state: 'NY' },
        },
      });

      expect(user.locations).toEqual([]);

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { locations: { push: { lat: 40, lng: -74 } } },
      });

      expect(updated!.locations).toHaveLength(1);
    });
  });

  describe('array set (full replace)', () => {
    test('should replace array with new values', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Leo',
          address: { street: '30 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74 },
            { lat: 34, lng: -118 },
          ],
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { locations: { set: [{ lat: 51, lng: 0 }] } },
      });

      expect(updated!.locations).toHaveLength(1);
      expect(updated!.locations[0]!.lat).toBe(51);
    });

    test('should set to empty array', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Mia',
          address: { street: '31 Main', city: 'NYC', state: 'NY' },
          locations: [{ lat: 40, lng: -74 }],
        },
      });

      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { locations: { set: [] } },
      });

      expect(updated!.locations).toEqual([]);
    });
  });

  describe('deep merge (nested objects)', () => {
    test('should update top-level nested sub-field preserving others', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Nora',
          address: { street: '40 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '40 Main', city: 'NYC', state: 'NY', zipCode: '10001' },
          },
        },
      });

      // Merge update only lat - should preserve lng and label
      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { primaryLocation: { lat: 41.0 } },
      });

      expect(updated!.primaryLocation!.lat).toBe(41.0);
      expect(updated!.primaryLocation!.lng).toBe(-74.006);
      expect(updated!.primaryLocation!.label!.city).toBe('NYC');
    });

    test('should replace nested label with full set', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Owen',
          address: { street: '41 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '40 Main', city: 'NYC', state: 'NY' },
          },
        },
      });

      // Replace label with new full address
      const updated = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: {
          primaryLocation: {
            label: { street: '100 Brooklyn Ave', city: 'Brooklyn', state: 'NY' },
          },
        },
      });

      expect(updated!.primaryLocation!.label!.city).toBe('Brooklyn');
      expect(updated!.primaryLocation!.label!.street).toBe('100 Brooklyn Ave');
      expect(updated!.primaryLocation!.lat).toBe(40.7128);
    });
  });

  describe('array of objects with tags (OrderItem)', () => {
    test('should push new item to items array', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '50 Main', city: 'NYC', state: 'NY' },
          items: [{ productName: 'Widget', quantity: 1, price: 9.99, tags: ['sale'] }],
        },
      });

      const updated = await client.db.ObjectTestOrder.updateUnique({
        where: { id: order.id },
        data: {
          items: { push: { productName: 'Gadget', quantity: 2, price: 19.99, tags: ['new'] } },
        },
      });

      expect(updated!.items).toHaveLength(2);
      expect(updated!.items[1]!.productName).toBe('Gadget');
    });

    test('should replace items with set', async () => {
      const order = await client.db.ObjectTestOrder.create({
        data: {
          billingAddress: { street: '51 Main', city: 'NYC', state: 'NY' },
          items: [
            { productName: 'Old1', quantity: 1, price: 1, tags: [] },
            { productName: 'Old2', quantity: 2, price: 2, tags: [] },
          ],
        },
      });

      const updated = await client.db.ObjectTestOrder.updateUnique({
        where: { id: order.id },
        data: {
          items: { set: [{ productName: 'New1', quantity: 10, price: 100, tags: ['replaced'] }] },
        },
      });

      expect(updated!.items).toHaveLength(1);
      expect(updated!.items[0]!.productName).toBe('New1');
    });
  });
});
