/**
 * E2E Tests: Tuple Where Filtering
 *
 * Tests WHERE clause filtering on tuple fields: named keys, index keys,
 * operators, array quantifiers (some/every/none).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';

describe('E2E Tuples: Where Filtering', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.tuples);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.tuples);

    // Seed test data
    await client.db.TupleBasic.create({ data: { name: 'NYC', location: [40.7, -74.0] } });
    await client.db.TupleBasic.create({ data: { name: 'LA', location: [34.0, -118.2] } });
    await client.db.TupleBasic.create({ data: { name: 'London', location: [51.5, -0.1] } });
    await client.db.TupleBasic.create({ data: { name: 'Tokyo', location: [35.7, 139.7] } });
  });

  describe('named key equality (shorthand)', () => {
    test('should filter by named key equality', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lat: 40.7 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('NYC');
    });

    test('should filter by second named key', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lng: 139.7 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Tokyo');
    });

    test('should filter by both named keys', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lat: 34.0, lng: -118.2 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('LA');
    });
  });

  describe('index key equality', () => {
    test('should filter by index key 0', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { '0': 51.5 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('London');
    });

    test('should filter by index key 1', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { '1': -74.0 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('NYC');
    });
  });

  describe('operators', () => {
    test('should filter with gt operator', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lat: { gt: 40 } } },
      });

      // NYC (40.7) and London (51.5) have lat > 40
      expect(results).toHaveLength(2);
      const names = results.map((r) => r.name).sort();
      expect(names).toEqual(['London', 'NYC']);
    });

    test('should filter with gte operator', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lat: { gte: 40.7 } } },
      });

      expect(results).toHaveLength(2); // NYC (40.7) + London (51.5)
    });

    test('should filter with lt operator', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lat: { lt: 35 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('LA');
    });

    test('should filter with between operator', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lat: { between: [35, 41] } } },
      });

      // LA (34) excluded, NYC (40.7) included, Tokyo (35.7) included, London (51.5) excluded
      expect(results).toHaveLength(2);
    });

    test('should filter with neq operator', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { location: { lat: { neq: 40.7 } } },
      });

      expect(results).toHaveLength(3); // All except NYC
    });
  });

  describe('combined with primitive filters', () => {
    test('should combine tuple filter with primitive filter', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { name: { startsWith: 'L' }, location: { lat: { gt: 50 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('London');
    });

    test('should return empty when filters conflict', async () => {
      const results = await client.db.TupleBasic.findMany({
        where: { name: 'NYC', location: { lat: { lt: 30 } } },
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('array tuple quantifiers', () => {
    test('should filter with some quantifier', async () => {
      await client.db.TupleBasic.create({
        data: {
          name: 'Traveler',
          location: [0, 0],
          history: [
            [40.7, -74.0],
            [34.0, -118.2],
          ],
        },
      });

      const results = await client.db.TupleBasic.findMany({
        where: { history: { some: { lat: { gt: 40 } } } },
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const traveler = results.find((r) => r.name === 'Traveler');
      expect(traveler).toBeDefined();
    });

    test('should filter with every quantifier', async () => {
      await client.db.TupleBasic.create({
        data: {
          name: 'NorthernTraveler',
          location: [0, 0],
          history: [
            [60, 10],
            [70, 20],
          ],
        },
      });

      const results = await client.db.TupleBasic.findMany({
        where: { history: { every: { lat: { gt: 50 } } } },
      });

      const northerner = results.find((r) => r.name === 'NorthernTraveler');
      expect(northerner).toBeDefined();
    });

    test('should filter with none quantifier', async () => {
      await client.db.TupleBasic.create({
        data: {
          name: 'NeverSouth',
          location: [0, 0],
          history: [
            [60, 10],
            [70, 20],
          ],
        },
      });

      const results = await client.db.TupleBasic.findMany({
        where: { history: { none: { lat: { lt: 0 } } } },
      });

      const neverSouth = results.find((r) => r.name === 'NeverSouth');
      expect(neverSouth).toBeDefined();
    });
  });
});
