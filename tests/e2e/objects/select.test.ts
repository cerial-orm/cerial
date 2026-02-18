/**
 * E2E Tests: Object Select Operations
 *
 * Schema: objects.cerial
 * Tests sub-field selection with object fields.
 * GetPayload type inference supports both boolean `true` and object sub-field selects.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Objects: Select', () => {
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

  describe('boolean select (all-or-nothing)', () => {
    test('should return full object with address: true', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Alice',
          address: { street: '1 Main', city: 'NYC', state: 'NY', zipCode: '10001' },
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { address: true },
      });

      expect(result).toBeDefined();
      expect(result!.address).toBeDefined();
      expect(result!.address.street).toBe('1 Main');
      expect(result!.address.city).toBe('NYC');
      expect(result!.address.zipCode).toBe('10001');
    });

    test('should return name and address with both selected', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Bob',
          address: { street: '2 Oak', city: 'LA', state: 'CA' },
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { name: true, address: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Bob');
      expect(result!.address.city).toBe('LA');
    });

    test('should return only id when only id selected', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Charlie',
          address: { street: '3 Pine', city: 'Chicago', state: 'IL' },
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { id: true },
      });

      expect(result).toBeDefined();
      expect(result!.id).toBeDefined();
      // Address should not be in the result
      expect((result as any).address).toBeUndefined();
    });
  });

  describe('sub-field select', () => {
    test('should return only selected sub-fields', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Dave',
          address: { street: '4 Elm', city: 'NYC', state: 'NY', zipCode: '10001' },
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { address: { city: true } },
      });

      expect(result).toBeDefined();
      expect(result!.address).toBeDefined();
      expect(result!.address.city).toBe('NYC');
      // Other sub-fields should be absent
      expect((result!.address as any).street).toBeUndefined();
      expect((result!.address as any).state).toBeUndefined();
    });

    test('should return multiple selected sub-fields', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Eve',
          address: { street: '5 Oak', city: 'LA', state: 'CA', zipCode: '90001' },
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { address: { city: true, zipCode: true } },
      });

      expect(result).toBeDefined();
      expect(result!.address.city).toBe('LA');
      expect(result!.address.zipCode).toBe('90001');
      expect((result!.address as any).street).toBeUndefined();
    });
  });

  describe('nested object select', () => {
    test('should return only selected nested sub-fields', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Frank',
          address: { street: '6 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '6 Main', city: 'NYC', state: 'NY' },
          },
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { primaryLocation: { lat: true } },
      });

      expect(result).toBeDefined();
      expect(result!.primaryLocation!.lat).toBe(40.7128);
      expect((result!.primaryLocation as any).lng).toBeUndefined();
    });

    test('should return full nested object with boolean true for nested field', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Grace',
          address: { street: '7 Main', city: 'NYC', state: 'NY' },
          primaryLocation: {
            lat: 40.7128,
            lng: -74.006,
            label: { street: '7 Main', city: 'NYC', state: 'NY' },
          },
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { primaryLocation: { label: true } },
      });

      expect(result).toBeDefined();
      expect(result!.primaryLocation!.label).toBeDefined();
      expect(result!.primaryLocation!.label!.city).toBe('NYC');
      expect(result!.primaryLocation!.label!.street).toBe('7 Main');
    });
  });

  describe('array of objects select', () => {
    test('should return full array with boolean true', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Hank',
          address: { street: '8 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74 },
            { lat: 34, lng: -118 },
          ],
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { locations: true },
      });

      expect(result).toBeDefined();
      expect(result!.locations).toHaveLength(2);
      expect(result!.locations[0]!.lat).toBe(40);
      expect(result!.locations[0]!.lng).toBe(-74);
    });

    test('should return array with only selected sub-fields per element', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Ivy',
          address: { street: '9 Main', city: 'NYC', state: 'NY' },
          locations: [
            { lat: 40, lng: -74 },
            { lat: 34, lng: -118 },
          ],
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { locations: { lat: true } },
      });

      expect(result).toBeDefined();
      expect(result!.locations).toHaveLength(2);
      expect(result!.locations[0]!.lat).toBe(40);
      expect((result!.locations[0] as any).lng).toBeUndefined();
    });
  });

  describe('combined select', () => {
    test('should mix primitive and object sub-selects', async () => {
      const user = await client.db.ObjectTestUser.create({
        data: {
          name: 'Jack',
          address: { street: '10 Main', city: 'NYC', state: 'NY' },
          locations: [{ lat: 40, lng: -74 }],
        },
      });

      const result = await client.db.ObjectTestUser.findUnique({
        where: { id: user.id },
        select: { name: true, address: { city: true }, locations: { lat: true } },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Jack');
      expect(result!.address.city).toBe('NYC');
      expect((result!.address as any).street).toBeUndefined();
      expect(result!.locations[0]!.lat).toBe(40);
    });
  });
});
