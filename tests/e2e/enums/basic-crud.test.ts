/**
 * E2E Tests: Enum Basic CRUD
 *
 * Schema: enums.cerial
 * Tests create, read, update, delete for enum fields on the EnumBasic model.
 * Covers: required, optional, nullable, array enum fields, NONE vs null semantics.
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
import { isCerialId, NONE } from 'cerial';

describe('E2E Enums: Basic CRUD', () => {
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

  describe('create', () => {
    test('should create with required enum field', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Alice', role: 'ADMIN' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.name).toBe('Alice');
      expect(result.role).toBe('ADMIN');
    });

    test('should create with each enum variant', async () => {
      const r1 = await client.db.EnumBasic.create({
        data: { name: 'A', role: 'ADMIN' },
      });
      const r2 = await client.db.EnumBasic.create({
        data: { name: 'B', role: 'USER' },
      });
      const r3 = await client.db.EnumBasic.create({
        data: { name: 'C', role: 'MODERATOR' },
      });

      expect(r1.role).toBe('ADMIN');
      expect(r2.role).toBe('USER');
      expect(r3.role).toBe('MODERATOR');
    });

    test('should create with optional enum field omitted (undefined)', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Dave', role: 'USER' },
      });

      expect(result.optRole).toBeUndefined();
    });

    test('should create with optional enum field provided', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Eve', role: 'USER', optRole: 'MODERATOR' },
      });

      expect(result.optRole).toBe('MODERATOR');
    });

    test('should create with nullable enum field as null', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Frank', role: 'ADMIN', nullRole: null },
      });

      expect(result.nullRole).toBeNull();
    });

    test('should create with nullable enum field as value', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Grace', role: 'ADMIN', nullRole: 'USER' },
      });

      expect(result.nullRole).toBe('USER');
    });

    test('should create with nullable enum field omitted (undefined/NONE)', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Hank', role: 'ADMIN' },
      });

      // nullable + optional = undefined when omitted (NONE)
      expect(result.nullRole).toBeUndefined();
    });

    test('should create with enum array field', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Ivy', role: 'USER', roles: ['ADMIN', 'MODERATOR'] },
      });

      expect(result.roles).toEqual(['ADMIN', 'MODERATOR']);
    });

    test('should create with empty enum array', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Jack', role: 'USER', roles: [] },
      });

      expect(result.roles).toEqual([]);
    });

    test('should default enum array to empty when omitted', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Kate', role: 'USER' },
      });

      expect(result.roles).toEqual([]);
    });

    test('should create with single-element enum array', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Leo', role: 'ADMIN', roles: ['USER'] },
      });

      expect(result.roles).toEqual(['USER']);
    });

    test('should create with all enum fields populated', async () => {
      const result = await client.db.EnumBasic.create({
        data: {
          name: 'Full',
          role: 'ADMIN',
          optRole: 'USER',
          nullRole: 'MODERATOR',
          roles: ['ADMIN', 'USER', 'MODERATOR'],
        },
      });

      expect(result.name).toBe('Full');
      expect(result.role).toBe('ADMIN');
      expect(result.optRole).toBe('USER');
      expect(result.nullRole).toBe('MODERATOR');
      expect(result.roles).toEqual(['ADMIN', 'USER', 'MODERATOR']);
    });
  });

  describe('findUnique', () => {
    test('should read back enum fields after create', async () => {
      const created = await client.db.EnumBasic.create({
        data: {
          name: 'ReadTest',
          role: 'MODERATOR',
          optRole: 'ADMIN',
          nullRole: 'USER',
          roles: ['ADMIN', 'USER'],
        },
      });

      const found = await client.db.EnumBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.role).toBe('MODERATOR');
      expect(found!.optRole).toBe('ADMIN');
      expect(found!.nullRole).toBe('USER');
      expect(found!.roles).toEqual(['ADMIN', 'USER']);
    });

    test('should return undefined for optional enum when absent', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'NoOpt', role: 'USER' },
      });

      const found = await client.db.EnumBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.optRole).toBeUndefined();
    });

    test('should return null for nullable enum set to null', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'NullVal', role: 'USER', nullRole: null },
      });

      const found = await client.db.EnumBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.nullRole).toBeNull();
    });

    test('should return null for non-existent record', async () => {
      const found = await client.db.EnumBasic.findUnique({
        where: { id: 'enum_basic:nonexistent' },
      });

      expect(found).toBeNull();
    });
  });

  describe('findMany', () => {
    test('should find all records with enum fields', async () => {
      await client.db.EnumBasic.create({ data: { name: 'A', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'B', role: 'USER' } });

      const results = await client.db.EnumBasic.findMany();

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    test('should find by enum value filter', async () => {
      await client.db.EnumBasic.create({ data: { name: 'Admin1', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'User1', role: 'USER' } });
      await client.db.EnumBasic.create({ data: { name: 'Admin2', role: 'ADMIN' } });

      const results = await client.db.EnumBasic.findMany({
        where: { role: 'ADMIN' },
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.role === 'ADMIN')).toBe(true);
    });
  });

  describe('updateUnique', () => {
    test('should update enum field value', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Upd', role: 'ADMIN' },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { role: 'MODERATOR' },
      });

      expect(updated).not.toBeNull();
      expect(updated!.role).toBe('MODERATOR');
    });

    test('should update optional enum to a value', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'UpdOpt', role: 'USER' },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { optRole: 'ADMIN' },
      });

      expect(updated!.optRole).toBe('ADMIN');
    });

    test('should clear optional enum with NONE', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'ClearOpt', role: 'USER', optRole: 'ADMIN' },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { optRole: NONE },
      });

      expect(updated!.optRole).toBeUndefined();
    });

    test('should update nullable enum to null', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'NullUpd', role: 'USER', nullRole: 'ADMIN' },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { nullRole: null },
      });

      expect(updated!.nullRole).toBeNull();
    });

    test('should update nullable enum from null to value', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'NullToVal', role: 'USER', nullRole: null },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { nullRole: 'MODERATOR' },
      });

      expect(updated!.nullRole).toBe('MODERATOR');
    });

    test('should clear nullable enum with NONE (back to undefined)', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'ClearNull', role: 'USER', nullRole: 'ADMIN' },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { nullRole: NONE },
      });

      expect(updated!.nullRole).toBeUndefined();
    });

    test('should update enum array with set', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'ArrSet', role: 'USER', roles: ['ADMIN'] },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { roles: ['USER', 'MODERATOR'] },
      });

      expect(updated!.roles).toEqual(['USER', 'MODERATOR']);
    });

    test('should push to enum array', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'ArrPush', role: 'USER', roles: ['ADMIN'] },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { roles: { push: 'MODERATOR' } },
      });

      expect(updated!.roles).toContain('ADMIN');
      expect(updated!.roles).toContain('MODERATOR');
    });

    test('should push multiple to enum array', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'ArrPushMulti', role: 'USER', roles: [] },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { roles: { push: ['ADMIN', 'MODERATOR'] } },
      });

      expect(updated!.roles).toContain('ADMIN');
      expect(updated!.roles).toContain('MODERATOR');
    });

    test('should return before state on update', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Before', role: 'ADMIN' },
      });

      const before = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { role: 'USER' },
        return: 'before',
      });

      expect(before).not.toBeNull();
      expect(before!.role).toBe('ADMIN');
    });

    test('should preserve other fields when updating enum', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'Preserve', role: 'ADMIN', optRole: 'USER', roles: ['MODERATOR'] },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { role: 'MODERATOR' },
      });

      expect(updated!.role).toBe('MODERATOR');
      expect(updated!.name).toBe('Preserve');
      expect(updated!.optRole).toBe('USER');
      expect(updated!.roles).toEqual(['MODERATOR']);
    });
  });

  describe('updateMany', () => {
    test('should update multiple records filtered by enum', async () => {
      await client.db.EnumBasic.create({ data: { name: 'M1', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'M2', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'M3', role: 'USER' } });

      const results = await client.db.EnumBasic.updateMany({
        where: { role: 'ADMIN' },
        data: { role: 'MODERATOR' },
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.role === 'MODERATOR')).toBe(true);
    });
  });

  describe('deleteUnique', () => {
    test('should delete a record with enum fields', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'DelMe', role: 'ADMIN' },
      });

      await client.db.EnumBasic.deleteUnique({ where: { id: created.id } });

      const found = await client.db.EnumBasic.findUnique({ where: { id: created.id } });
      expect(found).toBeNull();
    });

    test('should delete and return before state', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'DelBefore', role: 'MODERATOR', roles: ['ADMIN', 'USER'] },
      });

      const deleted = await client.db.EnumBasic.deleteUnique({
        where: { id: created.id },
        return: 'before',
      });

      expect(deleted).not.toBeNull();
      expect(deleted!.role).toBe('MODERATOR');
      expect(deleted!.roles).toEqual(['ADMIN', 'USER']);
    });
  });

  describe('deleteMany', () => {
    test('should delete multiple records filtered by enum', async () => {
      await client.db.EnumBasic.create({ data: { name: 'D1', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'D2', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'D3', role: 'USER' } });

      const count = await client.db.EnumBasic.deleteMany({ where: { role: 'ADMIN' } });

      expect(count).toBe(2);
    });
  });

  describe('count and exists', () => {
    test('should count records filtered by enum', async () => {
      await client.db.EnumBasic.create({ data: { name: 'C1', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'C2', role: 'ADMIN' } });
      await client.db.EnumBasic.create({ data: { name: 'C3', role: 'USER' } });

      const count = await client.db.EnumBasic.count({ role: 'ADMIN' });

      expect(count).toBe(2);
    });

    test('should check existence with enum filter', async () => {
      await client.db.EnumBasic.create({ data: { name: 'E1', role: 'MODERATOR' } });

      const exists = await client.db.EnumBasic.exists({ role: 'MODERATOR' });
      const notExists = await client.db.EnumBasic.exists({ role: 'ADMIN' });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });
});
