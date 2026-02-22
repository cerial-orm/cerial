/**
 * E2E Tests: Enum Select
 *
 * Schema: enums.cerial
 * Tests field selection with enum fields.
 * Covers: selecting only enum fields, excluding enum fields, combined selects.
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

describe('E2E Enums: Select', () => {
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

  describe('single field select', () => {
    test('should select only enum field', async () => {
      const created = await client.db.EnumBasic.create({
        data: {
          name: 'Alice',
          role: 'ADMIN',
          optRole: 'USER',
          roles: ['MODERATOR'],
        },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { role: true },
      });

      expect(result).toBeDefined();
      expect(result!.role).toBe('ADMIN');
      // Other fields should not be in the result
      expect('name' in result!).toBe(false);
      expect('optRole' in result!).toBe(false);
      expect('roles' in result!).toBe(false);
    });

    test('should select only name without enum field', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Bob', role: 'USER' },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { name: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Bob');
      expect('role' in result!).toBe(false);
    });
  });

  describe('combined select', () => {
    test('should select enum + other fields', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Charlie', role: 'MODERATOR', roles: ['ADMIN', 'USER'] },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { name: true, role: true, roles: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Charlie');
      expect(result!.role).toBe('MODERATOR');
      expect(result!.roles).toEqual(['ADMIN', 'USER']);
    });

    test('should select id and enum', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Dave', role: 'ADMIN' },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { id: true, role: true },
      });

      expect(result).toBeDefined();
      expect(result!.id).toBeDefined();
      expect(result!.role).toBe('ADMIN');
      expect('name' in result!).toBe(false);
    });
  });

  describe('select with optional/nullable enum', () => {
    test('should select optional enum when present', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Eve', role: 'USER', optRole: 'ADMIN' },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { optRole: true },
      });

      expect(result).toBeDefined();
      expect(result!.optRole).toBe('ADMIN');
    });

    test('should select optional enum when absent', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Frank', role: 'USER' },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { optRole: true },
      });

      expect(result).toBeDefined();
      expect(result!.optRole).toBeUndefined();
    });

    test('should select nullable enum when null', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Grace', role: 'USER', nullRole: null },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { nullRole: true },
      });

      expect(result).toBeDefined();
      expect(result!.nullRole).toBeNull();
    });

    test('should select nullable enum when has value', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Hank', role: 'USER', nullRole: 'MODERATOR' },
      });

      const result = await client.db.EnumBasic.findUnique({
        where: { id: created.id },
        select: { nullRole: true },
      });

      expect(result).toBeDefined();
      expect(result!.nullRole).toBe('MODERATOR');
    });
  });

  describe('select with EnumMultiple model', () => {
    test('should select specific enum fields from multi-enum model', async () => {
      const created = await client.db.EnumMultiple.create({
        data: { title: 'Multi', role: 'ADMIN', color: 'RED', severity: 'HIGH' },
      });

      const result = await client.db.EnumMultiple.findUnique({
        where: { id: created.id },
        select: { role: true, color: true },
      });

      expect(result).toBeDefined();
      expect(result!.role).toBe('ADMIN');
      expect(result!.color).toBe('RED');
      expect('severity' in result!).toBe(false);
      expect('title' in result!).toBe(false);
    });

    test('should select all fields from multi-enum model', async () => {
      const created = await client.db.EnumMultiple.create({
        data: {
          title: 'AllFields',
          role: 'USER',
          color: 'GREEN',
          severity: 'LOW',
        },
      });

      const result = await client.db.EnumMultiple.findUnique({
        where: { id: created.id },
        select: { title: true, role: true, color: true, severity: true },
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe('AllFields');
      expect(result!.role).toBe('USER');
      expect(result!.color).toBe('GREEN');
      expect(result!.severity).toBe('LOW');
    });
  });

  describe('findMany with select', () => {
    test('should select specific fields on findMany', async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });

      const results = await client.db.EnumBasic.findMany({
        select: { name: true, role: true },
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      for (const r of results) {
        expect(r.name).toBeDefined();
        expect(r.role).toBeDefined();
        expect('optRole' in r).toBe(false);
      }
    });

    test('should select with where and select combined', async () => {
      await client.db.EnumBasic.create({
        data: { name: 'Admin1', role: 'ADMIN' },
      });
      await client.db.EnumBasic.create({
        data: { name: 'User1', role: 'USER' },
      });

      const results = await client.db.EnumBasic.findMany({
        where: { role: 'ADMIN' },
        select: { name: true },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('Admin1');
      expect('role' in results[0]!).toBe(false);
    });
  });
});
