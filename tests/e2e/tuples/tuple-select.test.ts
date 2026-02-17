/**
 * E2E Tests: Tuple Sub-Field Select
 *
 * Tests SELECT with tuple sub-field narrowing using the explicit object
 * construction strategy. Covers object narrowing within tuples, nested
 * tuple-in-tuple select, depth-5 nesting, findOne/findMany/findUnique,
 * and combined tuple+object+primitive select.
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
import type { DeepOuterTupleInput } from '../generated';

describe('E2E Tuples: Sub-Field Select', () => {
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

  describe('findUnique - object within tuple select', () => {
    test('should narrow object element sub-fields within tuple', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const result = await client.db.TupleObjInTuple.findUnique({
        where: { id: created.id },
        select: { place: { 1: { city: true } } },
      });

      expect(result).not.toBeNull();
      // Tuple structure preserved: [string, { city }]
      expect(result!.place[0]).toBe('NYC'); // primitive element always returned
      expect(result!.place[1]).toEqual({ city: 'New York' }); // only city selected
    });

    test('should return full object when select is true for element', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const result = await client.db.TupleObjInTuple.findUnique({
        where: { id: created.id },
        select: { place: { 1: true } },
      });

      expect(result).not.toBeNull();
      expect(result!.place[0]).toBe('NYC');
      expect(result!.place[1]).toEqual({ street: '123 Main', city: 'New York' });
    });

    test('should return full tuple when select is boolean true', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const result = await client.db.TupleObjInTuple.findUnique({
        where: { id: created.id },
        select: { place: true },
      });

      expect(result).not.toBeNull();
      expect(result!.place).toEqual(['NYC', { street: '123 Main', city: 'New York' }]);
    });

    test('should select multiple sub-fields from object element', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['Boston', { street: '456 Oak', city: 'Boston' }] },
      });

      const result = await client.db.TupleObjInTuple.findUnique({
        where: { id: created.id },
        select: { place: { 1: { street: true, city: true } } },
      });

      expect(result).not.toBeNull();
      expect(result!.place[1]).toEqual({ street: '456 Oak', city: 'Boston' });
    });
  });

  describe('findMany - tuple select', () => {
    test('should narrow tuple sub-fields across multiple records', async () => {
      await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });
      await client.db.TupleObjInTuple.create({
        data: { place: ['BOS', { street: '456 Oak', city: 'Boston' }] },
      });

      const results = await client.db.TupleObjInTuple.findMany({
        select: { place: { 1: { city: true } } },
      });

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.place[1]).toHaveProperty('city');
        expect(result.place[1]).not.toHaveProperty('street');
      }
    });
  });

  describe('findOne - tuple select', () => {
    test('should narrow tuple sub-fields in findOne', async () => {
      await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const result = await client.db.TupleObjInTuple.findOne({
        select: { place: { 1: { city: true } } },
      });

      expect(result).not.toBeNull();
      expect(result!.place[0]).toBe('NYC');
      expect(result!.place[1]).toEqual({ city: 'New York' });
    });
  });

  describe('depth-5 nested tuple select', () => {
    const deepData: DeepOuterTupleInput = [
      'outer-label',
      ['mid-label', { name: 'John', age: 30, pos: [1.5, { value: 'a', extra: 'b' }] }],
    ];

    test('should narrow deepest object through multiple nesting levels', async () => {
      const created = await client.db.TupleDeepNest.create({
        data: { deep: deepData },
      });

      // Select only value from DeepInnerObj through the full depth:
      // deep → DeepOuterTuple[1] → DeepMidTuple[1] → DeepMidObj.pos → DeepInnerTuple[1] → { value }
      const result = await client.db.TupleDeepNest.findUnique({
        where: { id: created.id },
        select: {
          deep: {
            1: {
              1: {
                pos: {
                  1: { value: true },
                },
              },
            },
          },
        },
      });

      expect(result).not.toBeNull();
      // Outer tuple structure preserved
      expect(result!.deep[0]).toBe('outer-label');
      // Mid tuple structure preserved
      expect(result!.deep[1][0]).toBe('mid-label');
      // Mid object narrowed to just pos
      expect(result!.deep[1][1]).toHaveProperty('pos');
      // Inner tuple structure preserved
      expect(result!.deep[1][1].pos[0]).toBe(1.5);
      // Deepest object narrowed to just value
      expect(result!.deep[1][1].pos[1]).toEqual({ value: 'a' });
    });

    test('should select mid-level object field only', async () => {
      const created = await client.db.TupleDeepNest.create({
        data: { deep: deepData },
      });

      const result = await client.db.TupleDeepNest.findUnique({
        where: { id: created.id },
        select: {
          deep: {
            1: {
              1: { name: true },
            },
          },
        },
      });

      expect(result).not.toBeNull();
      expect(result!.deep[0]).toBe('outer-label');
      expect(result!.deep[1][0]).toBe('mid-label');
      expect(result!.deep[1][1]).toEqual({ name: 'John' });
    });
  });

  describe('combined select with other field types', () => {
    test('should combine tuple select with primitive field select', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const result = await client.db.TupleObjInTuple.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          place: { 1: { city: true } },
        },
      });

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('id');
      expect(result!.place[1]).toEqual({ city: 'New York' });
    });
  });

  describe('create with select - tuple sub-field narrowing', () => {
    test('should narrow tuple sub-fields in create response', async () => {
      const result = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
        select: { place: { 1: { city: true } } },
      });

      expect(result.place[0]).toBe('NYC');
      expect(result.place[1]).toEqual({ city: 'New York' });
    });
  });

  describe('updateUnique with select - tuple sub-field narrowing', () => {
    test('should narrow tuple sub-fields in update response', async () => {
      const created = await client.db.TupleObjInTuple.create({
        data: { place: ['NYC', { street: '123 Main', city: 'New York' }] },
      });

      const result = await client.db.TupleObjInTuple.updateUnique({
        where: { id: created.id },
        data: { place: ['BOS', { street: '456 Oak', city: 'Boston' }] },
        select: { place: { 1: { city: true } } },
      });

      expect(result).not.toBeNull();
      expect(result!.place[0]).toBe('BOS');
      expect(result!.place[1]).toEqual({ city: 'Boston' });
    });
  });
});
