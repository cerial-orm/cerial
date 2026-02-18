/**
 * E2E Tests: Tuple in Object
 *
 * Tests object containing a tuple field via the TupleInObj model.
 * TupleHolder = { label String, coord Coordinate, optCoord Coordinate? }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Tuples: Tuple in Object', () => {
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
  });

  describe('create', () => {
    test('should create with tuple inside object (array form)', async () => {
      const result = await client.db.TupleInObj.create({
        data: { details: { label: 'home', coord: [40.7, -74.0] } },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.details.label).toBe('home');
      expect(result.details.coord).toEqual([40.7, -74.0]);
    });

    test('should create with tuple inside object (named key form)', async () => {
      const result = await client.db.TupleInObj.create({
        data: { details: { label: 'work', coord: { lat: 34.0, lng: -118.2 } } },
      });

      expect(result.details.coord).toEqual([34.0, -118.2]);
    });

    test('should create with optional tuple in object provided', async () => {
      const result = await client.db.TupleInObj.create({
        data: { details: { label: 'both', coord: [10, 20], optCoord: [30, 40] } },
      });

      expect(result.details.coord).toEqual([10, 20]);
      expect(result.details.optCoord).toEqual([30, 40]);
    });

    test('should create with optional tuple in object omitted', async () => {
      const result = await client.db.TupleInObj.create({
        data: { details: { label: 'noOpt', coord: [10, 20] } },
      });

      expect(result.details.coord).toEqual([10, 20]);
      expect(result.details.optCoord).toBeUndefined();
    });
  });

  describe('read', () => {
    test('should read back tuple inside object', async () => {
      const created = await client.db.TupleInObj.create({
        data: { details: { label: 'read', coord: [50, 60], optCoord: [70, 80] } },
      });

      const found = await client.db.TupleInObj.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.details.label).toBe('read');
      expect(found!.details.coord).toEqual([50, 60]);
      expect(found!.details.optCoord).toEqual([70, 80]);
    });
  });

  describe('update', () => {
    test('should update object containing tuple', async () => {
      const created = await client.db.TupleInObj.create({
        data: { details: { label: 'old', coord: [1, 2] } },
      });

      const updated = await client.db.TupleInObj.updateUnique({
        where: { id: created.id },
        data: { details: { label: 'new', coord: [3, 4] } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.details.label).toBe('new');
      expect(updated!.details.coord).toEqual([3, 4]);
    });
  });
});
