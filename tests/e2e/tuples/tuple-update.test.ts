/**
 * E2E Tests: Tuple Update Operations
 *
 * Tests updateUnique and updateMany for tuple fields including
 * full replace, null→NONE, array push/set, and return options.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { NONE } from '../../../src/utils/none';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';

describe('E2E Tuples: Update', () => {
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

  describe('updateUnique - single tuple replace', () => {
    test('should replace required tuple', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Alice', location: [10, 20] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: [30, 40] },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([30, 40]);
      expect(updated!.name).toBe('Alice'); // other fields preserved
    });

    test('should replace optional tuple from NONE to value', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Bob', location: [0, 0] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { backup: [50, 60] },
      });

      expect(updated).not.toBeNull();
      expect(updated!.backup).toEqual([50, 60]);
    });

    test('should clear optional tuple with NONE', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Carol', location: [0, 0], backup: [10, 20] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { backup: NONE },
      });

      expect(updated).not.toBeNull();
      expect(updated!.backup).toBeUndefined();
    });

    test('should replace tuple using object form input', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Dave', location: [0, 0] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: { lat: 40.7, lng: -74.0 } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([40.7, -74.0]);
    });
  });

  describe('updateUnique - array tuple operations', () => {
    test('should replace entire tuple array', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Eve', location: [0, 0], history: [[1, 2]] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: {
          history: [
            [3, 4],
            [5, 6],
          ],
        },
      });

      expect(updated).not.toBeNull();
      expect(updated!.history).toEqual([
        [3, 4],
        [5, 6],
      ]);
    });

    test('should push single tuple to array', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Frank', location: [0, 0], history: [[1, 2]] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { history: { push: [3, 4] } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.history).toHaveLength(2);
      expect(updated!.history[1]).toEqual([3, 4]);
    });

    test('should set tuple array (replace all)', async () => {
      const created = await client.db.TupleBasic.create({
        data: {
          name: 'Grace',
          location: [0, 0],
          history: [
            [1, 2],
            [3, 4],
          ],
        },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { history: { set: [[10, 20]] } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.history).toEqual([[10, 20]]);
    });

    test('should clear tuple array with empty set', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Heidi', location: [0, 0], history: [[1, 2]] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { history: { set: [] } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.history).toEqual([]);
    });
  });

  describe('updateUnique - return options', () => {
    test('should return before state', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Ivan', location: [10, 20] },
      });

      const before = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: [30, 40] },
        return: 'before',
      });

      expect(before).not.toBeNull();
      expect(before!.location).toEqual([10, 20]); // before state
    });

    test('should return boolean when return: true', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Judy', location: [10, 20] },
      });

      const result = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: [30, 40] },
        return: true,
      });

      expect(result).toBe(true);
    });
  });

  describe('updateMany', () => {
    test('should update tuple on multiple records', async () => {
      await client.db.TupleBasic.create({ data: { name: 'BatchA', location: [1, 1] } });
      await client.db.TupleBasic.create({ data: { name: 'BatchB', location: [2, 2] } });

      const updated = await client.db.TupleBasic.updateMany({
        where: { name: { startsWith: 'Batch' } },
        data: { location: [99, 99] },
      });

      expect(updated).toHaveLength(2);
      for (const record of updated) {
        expect(record.location).toEqual([99, 99]);
      }
    });
  });

  describe('multiple field updates', () => {
    test('should update tuple and primitive together', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'OldName', location: [1, 2] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { name: 'NewName', location: [3, 4] },
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('NewName');
      expect(updated!.location).toEqual([3, 4]);
    });

    test('should update multiple tuple fields simultaneously', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Multi', location: [1, 2], backup: [3, 4] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: [10, 20], backup: [30, 40] },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([10, 20]);
      expect(updated!.backup).toEqual([30, 40]);
    });
  });
});
