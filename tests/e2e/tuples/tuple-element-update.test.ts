/**
 * E2E Tests: Per-Element Tuple Update
 *
 * Tests per-element tuple updates via array/object disambiguation.
 * Object form = per-element update, array form = full replace.
 * Covers primitive element updates, object partial merge, object full replace,
 * nested tuple recursion, NONE/null handling, depth-5 nesting, and
 * updateMany/return options.
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
} from '../test-helper';
import type { DeepOuterTupleInput } from '../generated';

describe('E2E Tuples: Per-Element Update', () => {
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

  describe('updateUnique - primitive element via object form', () => {
    test('should update single named element preserving others', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Alice', location: [10, 20] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: { lat: 99 } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([99, 20]); // lat changed, lng preserved
    });

    test('should update element by index key', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Bob', location: [10, 20] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: { 1: 99 } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([10, 99]); // lng changed by index
    });

    test('should update both elements', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Carol', location: [10, 20] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: { lat: 50, lng: 60 } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([50, 60]);
    });

    test('should preserve other model fields', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Dave', location: [10, 20], backup: [30, 40] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: { lat: 99 } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Dave');
      expect(updated!.backup).toEqual([30, 40]);
      expect(updated!.location).toEqual([99, 20]);
    });
  });

  describe('updateUnique - per-element with NONE/null', () => {
    test('should clear optional tuple field with NONE alongside per-element update', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Eve', location: [10, 20], backup: [30, 40] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: { lat: 99 }, backup: NONE },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([99, 20]);
      expect(updated!.backup).toBeUndefined();
    });
  });

  describe('updateUnique - object element in tuple', () => {
    test('should partial merge object element preserving other object fields', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const updated = await client.db.TupleObjInTuple.updateUnique({
        where: { id: created.id },
        data: { place: { 1: { city: 'Brooklyn' } } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.place[0]).toBe('NYC'); // string element preserved
      expect(updated!.place[1].city).toBe('Brooklyn'); // city updated
      expect(updated!.place[1].street).toBe('123 Main'); // street preserved
    });

    test('should full replace object element with { set }', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const updated = await client.db.TupleObjInTuple.updateUnique({
        where: { id: created.id },
        data: { place: { 1: { set: { street: '456 Oak', city: 'Boston' } } } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.place[0]).toBe('NYC');
      expect(updated!.place[1].street).toBe('456 Oak');
      expect(updated!.place[1].city).toBe('Boston');
    });

    test('should update string element while preserving object element', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const updated = await client.db.TupleObjInTuple.updateUnique({
        where: { id: created.id },
        data: { place: { tag: 'Boston' } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.place[0]).toBe('Boston');
      expect(updated!.place[1].street).toBe('123 Main');
      expect(updated!.place[1].city).toBe('New York');
    });
  });

  describe('updateUnique - depth-5 nested tuple', () => {
    const deepData: DeepOuterTupleInput = [
      'outer-label',
      ['mid-label', { name: 'John', age: 30, pos: [1.5, { value: 'a', extra: 'b' }] }],
    ];

    test('should update primitive at outermost level', async () => {
      const created = await client.db.TupleDeepNest.create({
        data: { deep: deepData },
      });

      const updated = await client.db.TupleDeepNest.updateUnique({
        where: { id: created.id },
        data: { deep: { 0: 'new-outer' } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.deep[0]).toBe('new-outer');
      // Mid tuple preserved
      expect(updated!.deep[1][0]).toBe('mid-label');
    });

    test('should update nested tuple element recursively', async () => {
      const created = await client.db.TupleDeepNest.create({
        data: { deep: deepData },
      });

      const updated = await client.db.TupleDeepNest.updateUnique({
        where: { id: created.id },
        data: { deep: { 1: { 0: 'new-mid' } } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.deep[0]).toBe('outer-label'); // outer preserved
      expect(updated!.deep[1][0]).toBe('new-mid'); // mid string updated
      expect(updated!.deep[1][1].name).toBe('John'); // mid obj preserved
    });

    test('should partial merge object inside nested tuple', async () => {
      const created = await client.db.TupleDeepNest.create({
        data: { deep: deepData },
      });

      const updated = await client.db.TupleDeepNest.updateUnique({
        where: { id: created.id },
        data: { deep: { 1: { 1: { name: 'Jane' } } } },
      });

      expect(updated).not.toBeNull();
      expect(updated!.deep[1][1].name).toBe('Jane');
      expect(updated!.deep[1][1].age).toBe(30); // preserved
      expect(updated!.deep[1][1].pos).toEqual([1.5, { value: 'a', extra: 'b' }]); // preserved
    });

    test('should update deepest object via recursive updates', async () => {
      const created = await client.db.TupleDeepNest.create({
        data: { deep: deepData },
      });

      // Update the DeepInnerObj's value field:
      // deep = [string, [string, { name, age, pos: [float, { value, extra }] }]]
      // Object form = per-element update, array form = full replace.
      // Element 1 of outer tuple is DeepMidTuple (object = per-element update).
      // Element 1 of mid tuple is DeepMidObj (object = partial merge).
      // pos is a tuple field inside the object — array = full replace.

      const updated = await client.db.TupleDeepNest.updateUnique({
        where: { id: created.id },
        data: {
          deep: {
            1: {
              1: { pos: [2.5, { value: 'z', extra: 'w' }] },
            },
          },
        },
      });

      expect(updated).not.toBeNull();
      expect(updated!.deep[1][1].name).toBe('John'); // preserved
      expect(updated!.deep[1][1].pos).toEqual([2.5, { value: 'z', extra: 'w' }]);
    });
  });

  describe('updateMany - per-element update', () => {
    test('should update element across multiple records', async () => {
      await client.db.TupleBasic.create({ data: { name: 'BatchA', location: [10, 20] } });
      await client.db.TupleBasic.create({ data: { name: 'BatchB', location: [30, 40] } });

      const updated = await client.db.TupleBasic.updateMany({
        where: { name: { startsWith: 'Batch' } },
        data: { location: { lat: 99 } },
      });

      expect(updated).toHaveLength(2);
      for (const record of updated) {
        expect(record.location[0]).toBe(99); // lat updated
      }
      // lng preserved from original values
      const lngs = updated.map((r) => r.location[1]);
      expect(lngs.sort()).toEqual([20, 40]);
    });
  });

  describe('updateUnique - return options with per-element', () => {
    test('should return before state', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Ivan', location: [10, 20] },
      });

      const before = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: { location: { lat: 99 } },
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
        data: { location: { lat: 99 } },
        return: true,
      });

      expect(result).toBe(true);
    });
  });

  describe('updateUnique - combined per-element with full replace', () => {
    test('should per-element update one field and full replace another', async () => {
      const created = await client.db.TupleBasic.create({
        data: { name: 'Mixed', location: [10, 20], backup: [30, 40] },
      });

      const updated = await client.db.TupleBasic.updateUnique({
        where: { id: created.id },
        data: {
          location: { lat: 99 },
          backup: [50, 60], // full replace
        },
      });

      expect(updated).not.toBeNull();
      expect(updated!.location).toEqual([99, 20]); // per-element
      expect(updated!.backup).toEqual([50, 60]); // full replace
    });
  });
});
