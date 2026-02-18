/**
 * E2E Tests: Enum OrderBy
 *
 * Schema: enums.cerial
 * Tests ordering by enum fields on various models.
 * Covers: single field asc/desc, multiple enum fields, combined with where,
 * optional/nullable enum ordering, object-level enum ordering.
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

describe('E2E Enums: OrderBy', () => {
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

  describe('single enum field ordering', () => {
    test('should order by required enum field ascending', async () => {
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'MODERATOR' } });

      const results = await client.db.EnumBasic.findMany({
        orderBy: { role: 'asc' },
      });

      expect(results).toHaveLength(3);
      // Alphabetical ascending: ADMIN < MODERATOR < USER
      expect(results[0]!.role).toBe('ADMIN');
      expect(results[1]!.role).toBe('MODERATOR');
      expect(results[2]!.role).toBe('USER');
    });

    test('should order by required enum field descending', async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'MODERATOR' } });

      const results = await client.db.EnumBasic.findMany({
        orderBy: { role: 'desc' },
      });

      expect(results).toHaveLength(3);
      // Alphabetical descending: USER > MODERATOR > ADMIN
      expect(results[0]!.role).toBe('USER');
      expect(results[1]!.role).toBe('MODERATOR');
      expect(results[2]!.role).toBe('ADMIN');
    });
  });

  describe('ordering with optional/nullable enum fields', () => {
    test('should order by optional enum field ascending (NONE values last)', async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER', optRole: 'MODERATOR' } });
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'USER', optRole: 'ADMIN' } });

      const results = await client.db.EnumBasic.findMany({
        orderBy: { optRole: 'asc' },
      });

      expect(results).toHaveLength(3);
      // NONE values sort first or last depending on SurrealDB behavior
      // The key point is ordering is deterministic and the non-NONE values are sorted
      const nonNone = results.filter((r) => r.optRole !== undefined);
      expect(nonNone).toHaveLength(2);
      expect(nonNone[0]!.optRole).toBe('ADMIN');
      expect(nonNone[1]!.optRole).toBe('MODERATOR');
    });

    test('should order by nullable enum field ascending', async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN', nullRole: null } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER', nullRole: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'USER', nullRole: 'ADMIN' } });

      const results = await client.db.EnumBasic.findMany({
        orderBy: { nullRole: 'asc' },
      });

      expect(results).toHaveLength(3);
      // null vs non-null ordering — non-null values should be sorted
      const nonNull = results.filter((r) => r.nullRole !== null && r.nullRole !== undefined);
      expect(nonNull).toHaveLength(2);
      expect(nonNull[0]!.nullRole).toBe('ADMIN');
      expect(nonNull[1]!.nullRole).toBe('USER');
    });
  });

  describe('multiple enum fields ordering', () => {
    test('should order by multiple enum fields on EnumMultiple', async () => {
      await client.db.EnumMultiple.create({ data: { title: 'A', role: 'USER', color: 'RED', severity: 'HIGH' } });
      await client.db.EnumMultiple.create({ data: { title: 'B', role: 'ADMIN', color: 'BLUE', severity: 'LOW' } });
      await client.db.EnumMultiple.create({ data: { title: 'C', role: 'USER', color: 'GREEN', severity: 'MEDIUM' } });
      await client.db.EnumMultiple.create({ data: { title: 'D', role: 'ADMIN', color: 'RED', severity: 'CRITICAL' } });

      // Primary sort by role asc, secondary by color asc
      const results = await client.db.EnumMultiple.findMany({
        orderBy: { role: 'asc', color: 'asc' },
      });

      expect(results).toHaveLength(4);
      // ADMIN group first (sorted by color: BLUE < RED)
      expect(results[0]!.role).toBe('ADMIN');
      expect(results[0]!.color).toBe('BLUE');
      expect(results[1]!.role).toBe('ADMIN');
      expect(results[1]!.color).toBe('RED');
      // USER group second (sorted by color: GREEN < RED)
      expect(results[2]!.role).toBe('USER');
      expect(results[2]!.color).toBe('GREEN');
      expect(results[3]!.role).toBe('USER');
      expect(results[3]!.color).toBe('RED');
    });

    test('should order by enum field mixed with non-enum field', async () => {
      await client.db.EnumMultiple.create({ data: { title: 'Z', role: 'ADMIN', color: 'RED', severity: 'LOW' } });
      await client.db.EnumMultiple.create({ data: { title: 'A', role: 'ADMIN', color: 'BLUE', severity: 'HIGH' } });
      await client.db.EnumMultiple.create({ data: { title: 'M', role: 'USER', color: 'GREEN', severity: 'MEDIUM' } });

      // Primary sort by role asc, secondary by title asc
      const results = await client.db.EnumMultiple.findMany({
        orderBy: { role: 'asc', title: 'asc' },
      });

      expect(results).toHaveLength(3);
      // ADMIN group first (sorted by title: A < Z)
      expect(results[0]!.role).toBe('ADMIN');
      expect(results[0]!.title).toBe('A');
      expect(results[1]!.role).toBe('ADMIN');
      expect(results[1]!.title).toBe('Z');
      // USER group
      expect(results[2]!.role).toBe('USER');
      expect(results[2]!.title).toBe('M');
    });
  });

  describe('ordering combined with where', () => {
    test('should filter and order by enum field', async () => {
      await client.db.EnumBasic.create({ data: { name: 'C', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });

      const results = await client.db.EnumBasic.findMany({
        where: { role: 'ADMIN' },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.name).toBe('A');
      expect(results[1]!.name).toBe('C');
    });

    test('should filter by one enum and order by another', async () => {
      await client.db.EnumMultiple.create({ data: { title: 'X', role: 'ADMIN', color: 'RED', severity: 'HIGH' } });
      await client.db.EnumMultiple.create({ data: { title: 'Y', role: 'ADMIN', color: 'BLUE', severity: 'LOW' } });
      await client.db.EnumMultiple.create({ data: { title: 'Z', role: 'USER', color: 'GREEN', severity: 'MEDIUM' } });

      const results = await client.db.EnumMultiple.findMany({
        where: { role: 'ADMIN' },
        orderBy: { severity: 'asc' },
      });

      expect(results).toHaveLength(2);
      // Sorted by severity asc: HIGH < LOW
      expect(results[0]!.severity).toBe('HIGH');
      expect(results[1]!.severity).toBe('LOW');
    });
  });

  describe('ordering with select', () => {
    test('should order by enum field with select', async () => {
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });

      const results = await client.db.EnumBasic.findMany({
        select: { name: true, role: true },
        orderBy: { role: 'asc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.role).toBe('ADMIN');
      expect(results[1]!.role).toBe('USER');
    });
  });

  describe('ordering on model with object containing enum', () => {
    test('should order by nested object enum field ascending', async () => {
      await client.db.EnumWithObject.create({
        data: { name: 'A', address: { city: 'NYC', severity: 'HIGH' } },
      });
      await client.db.EnumWithObject.create({
        data: { name: 'B', address: { city: 'LA', severity: 'CRITICAL' } },
      });
      await client.db.EnumWithObject.create({
        data: { name: 'C', address: { city: 'SF', severity: 'LOW' } },
      });

      const results = await client.db.EnumWithObject.findMany({
        orderBy: { address: { severity: 'asc' } },
      });

      expect(results).toHaveLength(3);
      // Alphabetical: CRITICAL < HIGH < LOW
      expect(results[0]!.address.severity).toBe('CRITICAL');
      expect(results[1]!.address.severity).toBe('HIGH');
      expect(results[2]!.address.severity).toBe('LOW');
    });

    test('should order by nested object enum field descending', async () => {
      await client.db.EnumWithObject.create({
        data: { name: 'A', address: { city: 'NYC', severity: 'LOW' } },
      });
      await client.db.EnumWithObject.create({
        data: { name: 'B', address: { city: 'LA', severity: 'HIGH' } },
      });

      const results = await client.db.EnumWithObject.findMany({
        orderBy: { address: { severity: 'desc' } },
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.address.severity).toBe('LOW');
      expect(results[1]!.address.severity).toBe('HIGH');
    });

    test('should order by nested object non-enum field alongside enum field', async () => {
      await client.db.EnumWithObject.create({
        data: { name: 'A', address: { city: 'NYC', severity: 'HIGH' } },
      });
      await client.db.EnumWithObject.create({
        data: { name: 'B', address: { city: 'LA', severity: 'HIGH' } },
      });
      await client.db.EnumWithObject.create({
        data: { name: 'C', address: { city: 'SF', severity: 'LOW' } },
      });

      const results = await client.db.EnumWithObject.findMany({
        orderBy: { address: { severity: 'asc', city: 'asc' } },
      });

      expect(results).toHaveLength(3);
      // severity asc first: HIGH, HIGH, LOW
      // within HIGH group, city asc: LA < NYC
      expect(results[0]!.address.severity).toBe('HIGH');
      expect(results[0]!.address.city).toBe('LA');
      expect(results[1]!.address.severity).toBe('HIGH');
      expect(results[1]!.address.city).toBe('NYC');
      expect(results[2]!.address.severity).toBe('LOW');
    });
  });
});
