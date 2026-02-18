/**
 * E2E Tests: @flexible decorator
 *
 * Tests the @flexible decorator on object type fields, which allows
 * arbitrary extra fields alongside defined typed fields.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E @flexible decorator', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.flexible);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.flexible);
  });

  // ─── CREATE ─────────────────────────────────────────────────────────

  describe('create', () => {
    test('should create with known fields only', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: '123 Main', city: 'NYC' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'test' } },
          strictAddress: { street: '456 Oak', city: 'LA' },
        },
      });

      expect(result.name).toBe('Alice');
      expect(result.address.street).toBe('123 Main');
      expect(result.address.city).toBe('NYC');
    });

    test('should create with known + extra fields on flexible object', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: '789 Elm', city: 'SF', zip: '94102', rating: 4.5, active: true },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'meta' } },
          strictAddress: { street: '321 Pine', city: 'LA' },
        },
      });

      expect(result.address.street).toBe('789 Elm');
      expect(result.address.city).toBe('SF');
      expect(result.address.zip).toBe('94102');
      expect(result.address.rating).toBe(4.5);
      expect(result.address.active).toBe(true);
    });

    test('should create with only extra fields (optional known fields)', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Carol',
          address: { street: 'Main', city: 'NYC', customField: 'hello', count: 42 },
          tags: [],
          profile: { bio: 'Hey', metadata: { label: 'x' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      expect(result.address.customField).toBe('hello');
      expect(result.address.count).toBe(42);
    });

    test('should create with nested extra fields in flexible object', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Dan',
          address: {
            street: 'Elm',
            city: 'NYC',
            nested: { deep: { value: 123 } },
            list: [1, 2, 3],
          },
          tags: [],
          profile: { bio: 'Yo', metadata: { label: 'y' } },
          strictAddress: { street: 'Pine', city: 'LA' },
        },
      });

      expect(result.address.nested).toEqual({ deep: { value: 123 } });
      expect(result.address.list).toEqual([1, 2, 3]);
    });

    test('should create optional flexible object with extra fields', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Eve',
          address: { street: 'Main', city: 'NYC' },
          shipping: { street: 'Ship', city: 'LA', priority: 'express', weight: 2.5 },
          tags: [],
          profile: { bio: 'Sup', metadata: { label: 'z' } },
          strictAddress: { street: 'Oak', city: 'SF' },
        },
      });

      expect(result.shipping!.street).toBe('Ship');
      expect(result.shipping!.priority).toBe('express');
      expect(result.shipping!.weight).toBe(2.5);
    });

    test('should create optional flexible object omitted', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Frank',
          address: { street: 'Main', city: 'NYC' },
          tags: [],
          profile: { bio: 'Yo', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      expect(result.shipping).toBeUndefined();
    });

    test('should create array of flexible objects with extra fields', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Grace',
          address: { street: 'Main', city: 'NYC' },
          tags: [
            { street: 'Tag1', city: 'A', category: 'work' },
            { street: 'Tag2', city: 'B', priority: 1, active: true },
          ],
          profile: { bio: 'Hey', metadata: { label: 'b' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      expect(result.tags).toHaveLength(2);
      expect(result.tags[0]!.street).toBe('Tag1');
      expect(result.tags[0]!.category).toBe('work');
      expect(result.tags[1]!.priority).toBe(1);
      expect(result.tags[1]!.active).toBe(true);
    });

    test('should create with nested flexible (metadata in profile)', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Hank',
          address: { street: 'Main', city: 'NYC' },
          tags: [],
          profile: {
            bio: 'Test',
            metadata: { label: 'nested-flex', extraKey: 'extraValue', score: 99 },
          },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      expect(result.profile.metadata.label).toBe('nested-flex');
      expect(result.profile.metadata.extraKey).toBe('extraValue');
      expect(result.profile.metadata.score).toBe(99);
    });
  });

  // ─── WHERE (known fields) ──────────────────────────────────────────

  describe('where - known fields', () => {
    beforeEach(async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: '123 Main', city: 'NYC', zip: '10001', rating: 4.5 },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: '456 Elm', city: 'LA', zip: '90001', rating: 2.0 },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });
    });

    test('should filter by known string field (eq)', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { city: 'NYC' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter by known string field (neq)', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { city: { neq: 'NYC' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });

    test('should filter by known optional field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { zip: '10001' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter by known field with contains', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { street: { contains: 'Main' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  // ─── WHERE (extra/unknown fields) ─────────────────────────────────

  describe('where - extra fields', () => {
    beforeEach(async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', rating: 4.5, active: true, priority: 'high' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA', rating: 2.0, active: false, priority: 'low' },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });
    });

    test('should filter by extra string field (eq)', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { priority: 'high' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter by extra numeric field (gt)', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { rating: { gt: 3.0 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter by extra boolean field (eq)', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { active: true } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter by extra field with neq', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { priority: { neq: 'high' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });

    test('should filter combining known and extra fields', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { address: { city: 'NYC', rating: { gt: 3.0 } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  // ─── WHERE (nested flexible) ──────────────────────────────────────

  describe('where - nested flexible', () => {
    beforeEach(async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a', score: 100 } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA' },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b', score: 50 } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });
    });

    test('should filter by nested flexible known field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { profile: { metadata: { label: 'a' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter by nested flexible extra field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { profile: { metadata: { score: { gt: 75 } } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  // ─── WHERE (array of flexible objects) ─────────────────────────────

  describe('where - array of flexible objects', () => {
    beforeEach(async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC' },
          tags: [
            { street: 'Tag1', city: 'A', category: 'work' },
            { street: 'Tag2', city: 'B', category: 'home' },
          ],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA' },
          tags: [{ street: 'Tag3', city: 'C', category: 'work' }],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });
    });

    test('should filter array with some on known field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { tags: { some: { city: 'A' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter array with some on extra field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { tags: { some: { category: 'home' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    test('should filter array with every on known field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { tags: { every: { category: 'work' } } },
      });

      // Bob has only 'work', Alice has 'work' and 'home'
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });

    test('should filter array with none on extra field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: { tags: { none: { category: 'home' } } },
      });

      // Bob has no 'home' category
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });
  });

  // ─── UPDATE ────────────────────────────────────────────────────────

  describe('update', () => {
    test('should merge update with extra fields preserved', async () => {
      const created = await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', rating: 4.5, custom: 'keep' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      const updated = await client.db.FlexUser.updateUnique({
        where: { id: created.id },
        data: { address: { city: 'SF' } },
      });

      expect(updated!.address.city).toBe('SF');
      // Extra fields should be preserved in merge
      expect(updated!.address.rating).toBe(4.5);
      expect(updated!.address.custom).toBe('keep');
      // Known fields not in update should be preserved
      expect(updated!.address.street).toBe('Main');
    });

    test('should add new extra fields via update', async () => {
      const created = await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA' },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });

      const updated = await client.db.FlexUser.updateUnique({
        where: { id: created.id },
        data: { address: { newField: 'added', score: 42 } },
      });

      expect(updated!.address.newField).toBe('added');
      expect(updated!.address.score).toBe(42);
      expect(updated!.address.street).toBe('Elm');
    });

    test('should replace flexible object with set', async () => {
      const created = await client.db.FlexUser.create({
        data: {
          name: 'Carol',
          address: { street: 'Oak', city: 'SF', oldExtra: 'gone' },
          tags: [],
          profile: { bio: 'Hey', metadata: { label: 'c' } },
          strictAddress: { street: 'Pine', city: 'LA' },
        },
      });

      const updated = await client.db.FlexUser.updateUnique({
        where: { id: created.id },
        data: { address: { set: { street: 'New', city: 'NYC', newExtra: 'here' } } },
      });

      expect(updated!.address.street).toBe('New');
      expect(updated!.address.city).toBe('NYC');
      expect(updated!.address.newExtra).toBe('here');
      // Old extra field should be gone after full replace
      expect(updated!.address.oldExtra).toBeUndefined();
    });

    test('should push to array of flexible objects', async () => {
      const created = await client.db.FlexUser.create({
        data: {
          name: 'Dan',
          address: { street: 'Main', city: 'NYC' },
          tags: [{ street: 'Tag1', city: 'A' }],
          profile: { bio: 'Yo', metadata: { label: 'd' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      const updated = await client.db.FlexUser.updateUnique({
        where: { id: created.id },
        data: { tags: { push: { street: 'Tag2', city: 'B', extra: 'pushed' } } },
      });

      expect(updated!.tags).toHaveLength(2);
      expect(updated!.tags[1]!.street).toBe('Tag2');
      expect(updated!.tags[1]!.extra).toBe('pushed');
    });

    test('should update nested flexible extra fields', async () => {
      const created = await client.db.FlexUser.create({
        data: {
          name: 'Eve',
          address: { street: 'Main', city: 'NYC' },
          tags: [],
          profile: { bio: 'Sup', metadata: { label: 'e', initialExtra: 'present' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      const updated = await client.db.FlexUser.updateUnique({
        where: { id: created.id },
        data: { profile: { metadata: { label: 'e', initialExtra: 'present', newMeta: 'added' } } },
      });

      expect(updated!.profile.metadata.label).toBe('e');
      expect(updated!.profile.metadata.initialExtra).toBe('present');
      expect(updated!.profile.metadata.newMeta).toBe('added');
    });
  });

  // ─── SELECT ────────────────────────────────────────────────────────

  describe('select', () => {
    test('should select flexible field (returns extra fields too)', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', extra: 'included' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      const result = await client.db.FlexUser.findOne({
        select: { address: true },
      });

      expect(result!.address.street).toBe('Main');
      expect(result!.address.extra).toBe('included');
    });

    test('should select sub-fields of flexible object', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA', rating: 4.5 },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });

      const result = await client.db.FlexUser.findOne({
        select: { address: { city: true } },
      });

      expect(result!.address.city).toBe('LA');
      // Sub-field select should only return selected fields — verify via keys
      expect(Object.keys(result!.address)).toEqual(['city']);
    });
  });

  // ─── STRICT vs FLEXIBLE (same object type) ────────────────────────

  describe('strict vs flexible - same object type', () => {
    test('strict field should NOT store extra fields', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', extra: 'kept' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      // Flexible field keeps extra
      expect(result.address.extra).toBe('kept');
      // Strict field should NOT have any extra field keys
      const strictKeys = Object.keys(result.strictAddress);
      expect(strictKeys.sort()).toEqual(['city', 'street'].sort());
    });

    test('should create both flexible and strict fields correctly', async () => {
      const result = await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Main', city: 'NYC', zip: '10001', bonus: true },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Oak', city: 'LA', zip: '90001' },
        },
      });

      expect(result.address.zip).toBe('10001');
      expect(result.address.bonus).toBe(true);
      expect(result.strictAddress.zip).toBe('90001');
    });
  });

  // ─── RETURN TYPE includes extras ───────────────────────────────────

  describe('return type', () => {
    test('should return extra fields in findMany', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', temperature: 72, unit: 'F' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      const results = await client.db.FlexUser.findMany();

      expect(results).toHaveLength(1);
      expect(results[0]!.address.temperature).toBe(72);
      expect(results[0]!.address.unit).toBe('F');
    });

    test('should return extra fields in findUnique', async () => {
      const created = await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA', custom: [1, 2, 3] },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });

      const found = await client.db.FlexUser.findUnique({
        where: { id: created.id },
      });

      expect(found!.address.custom).toEqual([1, 2, 3]);
    });
  });

  // ─── LOGICAL OPERATORS ─────────────────────────────────────────────

  describe('where - logical operators', () => {
    beforeEach(async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', rating: 5 },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA', rating: 3 },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Carol',
          address: { street: 'Oak', city: 'SF', rating: 1 },
          tags: [],
          profile: { bio: 'Hey', metadata: { label: 'c' } },
          strictAddress: { street: 'Birch', city: 'LA' },
        },
      });
    });

    test('should filter with OR on extra fields', async () => {
      const results = await client.db.FlexUser.findMany({
        where: {
          OR: [{ address: { rating: 5 } }, { address: { rating: 1 } }],
        },
      });

      expect(results).toHaveLength(2);
      const names = results.map((r) => r.name).sort();
      expect(names).toEqual(['Alice', 'Carol']);
    });

    test('should filter with NOT on extra field', async () => {
      const results = await client.db.FlexUser.findMany({
        where: {
          NOT: { address: { rating: 5 } },
        },
      });

      expect(results).toHaveLength(2);
      const names = results.map((r) => r.name).sort();
      expect(names).toEqual(['Bob', 'Carol']);
    });
  });

  // ─── ORDERBY ───────────────────────────────────────────────────────

  describe('orderBy', () => {
    test('should order by known field of flexible object', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA' },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      const results = await client.db.FlexUser.findMany({
        orderBy: { address: { city: 'asc' } },
      });

      expect(results[0]!.name).toBe('Bob');
      expect(results[1]!.name).toBe('Alice');
    });
  });

  // ─── COUNT / EXISTS ────────────────────────────────────────────────

  describe('count and exists', () => {
    test('should count with where on extra field', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', tier: 'gold' },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA', tier: 'silver' },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });

      const count = await client.db.FlexUser.count({ address: { tier: 'gold' } });
      expect(count).toBe(1);
    });

    test('should check exists with where on extra field', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', verified: true },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });

      const exists = await client.db.FlexUser.exists({ address: { verified: true } });
      expect(exists).toBe(true);

      const notExists = await client.db.FlexUser.exists({ address: { verified: false } });
      expect(notExists).toBe(false);
    });
  });

  // ─── DELETE ────────────────────────────────────────────────────────

  describe('delete', () => {
    test('should delete with where on extra field', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'Alice',
          address: { street: 'Main', city: 'NYC', toDelete: true },
          tags: [],
          profile: { bio: 'Hello', metadata: { label: 'a' } },
          strictAddress: { street: 'Oak', city: 'LA' },
        },
      });
      await client.db.FlexUser.create({
        data: {
          name: 'Bob',
          address: { street: 'Elm', city: 'LA', toDelete: false },
          tags: [],
          profile: { bio: 'Hi', metadata: { label: 'b' } },
          strictAddress: { street: 'Pine', city: 'SF' },
        },
      });

      const deleted = await client.db.FlexUser.deleteMany({
        where: { address: { toDelete: true } },
      });
      expect(deleted).toBe(1);

      const remaining = await client.db.FlexUser.findMany();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.name).toBe('Bob');
    });
  });
});
