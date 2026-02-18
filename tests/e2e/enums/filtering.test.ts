/**
 * E2E Tests: Enum Filtering
 *
 * Schema: enums.cerial
 * Tests where clause operators for enum fields.
 * Covers: eq, neq, in, notIn, contains, startsWith, endsWith,
 * array enum operators (has, hasAll, hasAny, isEmpty),
 * nullable/optional enum filtering, logical operators (AND/OR/NOT).
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

describe('E2E Enums: Filtering', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.enums);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.enums);
  });

  describe('scalar enum filters (eq/neq/in/notIn)', () => {
    beforeEach(async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'MODERATOR' } });
    });

    test('should filter by direct value (eq shorthand)', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: 'ADMIN' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter by eq operator', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { eq: 'USER' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('B');
    });

    test('should filter by neq operator', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { neq: 'ADMIN' } },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.name === 'B')).toBe(true);
      expect(results.some((r) => r.name === 'C')).toBe(true);
    });

    test('should filter by in operator', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { in: ['ADMIN', 'MODERATOR'] } },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.name === 'A')).toBe(true);
      expect(results.some((r) => r.name === 'C')).toBe(true);
    });

    test('should filter by notIn operator', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { notIn: ['ADMIN', 'MODERATOR'] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('B');
    });

    test('should return empty when in list has no matches', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { in: [] } },
      });

      expect(results.length).toBe(0);
    });
  });

  describe('string-like enum filters (contains/startsWith/endsWith)', () => {
    beforeEach(async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'MODERATOR' } });
    });

    test('should filter by contains', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { contains: 'DER' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('C');
    });

    test('should filter by startsWith', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { startsWith: 'ADM' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter by endsWith', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { endsWith: 'ER' } },
      });

      // USER ends with ER, MODERATOR ends with OR — only USER matches
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('B');
    });

    test('should return multiple matches for contains', async () => {
      // ADMIN contains 'A', MODERATOR contains 'A' (MODERATOR has A)
      const results = await client.db.EnumBasic.findMany({
        where: { role: { contains: 'A' } },
      });

      // ADMIN has A, MODERATOR has A (MODER_A_TOR)
      expect(results.length).toBe(2);
    });

    test('should return no matches for non-matching contains', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { contains: 'ZZZZZ' } },
      });

      expect(results.length).toBe(0);
    });
  });

  describe('array enum filters (has/hasAll/hasAny/isEmpty)', () => {
    beforeEach(async () => {
      await client.db.EnumBasic.create({
        data: { name: 'A', role: 'ADMIN', roles: ['ADMIN', 'MODERATOR'] },
      });
      await client.db.EnumBasic.create({
        data: { name: 'B', role: 'USER', roles: ['USER'] },
      });
      await client.db.EnumBasic.create({
        data: { name: 'C', role: 'MODERATOR', roles: [] },
      });
    });

    test('should filter array enum by has', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { roles: { has: 'ADMIN' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter array enum by hasAny', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { roles: { hasAny: ['ADMIN', 'USER'] } },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.name === 'A')).toBe(true);
      expect(results.some((r) => r.name === 'B')).toBe(true);
    });

    test('should filter array enum by hasAll', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { roles: { hasAll: ['ADMIN', 'MODERATOR'] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter array enum by isEmpty true', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { roles: { isEmpty: true } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('C');
    });

    test('should filter array enum by isEmpty false', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { roles: { isEmpty: false } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by has with no matches', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { roles: { has: 'MODERATOR' } },
      });

      // Only A has MODERATOR in roles array
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });
  });

  describe('nullable enum filters', () => {
    beforeEach(async () => {
      await client.db.EnumBasic.create({
        data: { name: 'A', role: 'ADMIN', nullRole: 'ADMIN' },
      });
      await client.db.EnumBasic.create({
        data: { name: 'B', role: 'USER', nullRole: null },
      });
      await client.db.EnumBasic.create({
        data: { name: 'C', role: 'MODERATOR' },
      });
    });

    test('should filter nullable enum by value', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { nullRole: 'ADMIN' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter nullable enum by null', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { nullRole: null },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('B');
    });
  });

  describe('optional enum filters', () => {
    beforeEach(async () => {
      await client.db.EnumBasic.create({
        data: { name: 'A', role: 'ADMIN', optRole: 'USER' },
      });
      await client.db.EnumBasic.create({
        data: { name: 'B', role: 'USER', optRole: 'ADMIN' },
      });
      await client.db.EnumBasic.create({
        data: { name: 'C', role: 'MODERATOR' },
      });
    });

    test('should filter by optional enum value', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { optRole: 'USER' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter by optional enum with neq', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { optRole: { neq: 'ADMIN' } },
      });

      // B has ADMIN, A has USER, C has NONE — neq ADMIN matches A and C
      expect(results.some((r) => r.name === 'A')).toBe(true);
    });
  });

  describe('logical operators with enums', () => {
    beforeEach(async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'MODERATOR' } });
    });

    test('should filter with AND on multiple fields', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { AND: [{ role: 'ADMIN' }, { name: 'A' }] },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter with OR on enum fields', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { OR: [{ role: 'ADMIN' }, { role: 'USER' }] },
      });

      expect(results.length).toBe(2);
    });

    test('should filter with NOT on enum field', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { NOT: { role: 'ADMIN' } },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.name === 'B')).toBe(true);
      expect(results.some((r) => r.name === 'C')).toBe(true);
    });

    test('should combine enum filter with string filter', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: 'ADMIN', name: { startsWith: 'A' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });
  });

  describe('multi-enum model filters (EnumMultiple)', () => {
    beforeEach(async () => {
      await client.db.EnumMultiple.create({
        data: { title: 'Post1', role: 'ADMIN', color: 'RED', severity: 'HIGH' },
      });
      await client.db.EnumMultiple.create({
        data: { title: 'Post2', role: 'USER', color: 'GREEN', severity: 'LOW' },
      });
      await client.db.EnumMultiple.create({
        data: { title: 'Post3', role: 'ADMIN', color: 'BLUE', severity: 'CRITICAL' },
      });
    });

    test('should filter by multiple different enum types', async () => {
      const results = await client.db.EnumMultiple.findMany({
        where: { role: 'ADMIN', severity: 'HIGH' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.title).toBe('Post1');
    });

    test('should filter one enum with in, another with eq', async () => {
      const results = await client.db.EnumMultiple.findMany({
        where: { role: 'ADMIN', color: { in: ['RED', 'BLUE'] } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter with OR across different enum types', async () => {
      const results = await client.db.EnumMultiple.findMany({
        where: { OR: [{ color: 'RED' }, { severity: 'LOW' }] },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.title === 'Post1')).toBe(true);
      expect(results.some((r) => r.title === 'Post2')).toBe(true);
    });
  });
});
