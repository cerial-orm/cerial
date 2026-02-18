/**
 * E2E Tests: Object in Tuple
 *
 * Tests tuple containing an object element via the TupleObjInTuple model.
 * Located = [String, TupleAddress]
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Tuples: Object in Tuple', () => {
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
    test('should create with object element in tuple (array form)', async () => {
      const result = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '1 Main St', city: 'New York' }] },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.place[0]).toBe('NYC');
      expect(result.place[1]).toEqual({ street: '1 Main St', city: 'New York' });
    });

    test('should create with object-in-tuple using named key form', async () => {
      const result = await client.db.TupleObjInTuple.create({
        data: { place: { tag: 'LA', '1': { street: '2 Oak Ave', city: 'LA' } } },
      });

      expect(result.place).toEqual(['LA', { street: '2 Oak Ave', city: 'LA' }]);
    });
  });

  describe('read', () => {
    test('should read back object element in tuple', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['SF', { street: '3 Market', city: 'San Francisco' }] },
      });

      const found = await client.db.TupleObjInTuple.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.place[0]).toBe('SF');
      expect(found!.place[1]).toEqual({ street: '3 Market', city: 'San Francisco' });
    });
  });

  describe('update', () => {
    test('should update object-in-tuple (full replace)', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['Old', { street: 'Old St', city: 'OldCity' }] },
      });

      const updated = await client.db.TupleObjInTuple.updateUnique({
        where: { id: created.id },
        data: { place: ['New', { street: 'New St', city: 'NewCity' }] },
      });

      expect(updated).not.toBeNull();
      expect(updated!.place).toEqual(['New', { street: 'New St', city: 'NewCity' }]);
    });
  });
});
