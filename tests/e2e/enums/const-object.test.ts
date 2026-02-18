/**
 * E2E Tests: Enum Const Object
 *
 * Schema: enums.cerial
 * Tests using the generated const objects (RoleEnum, ColorEnum, SeverityEnum) at runtime.
 * Ensures const values match DB values and can be used in queries.
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
import { RoleEnum, ColorEnum, SeverityEnum } from '../generated';

describe('E2E Enums: Const Object', () => {
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

  describe('const object structure', () => {
    test('RoleEnum should have ADMIN, USER, MODERATOR', () => {
      expect(RoleEnum.ADMIN).toBe('ADMIN');
      expect(RoleEnum.USER).toBe('USER');
      expect(RoleEnum.MODERATOR).toBe('MODERATOR');
    });

    test('ColorEnum should have RED, GREEN, BLUE', () => {
      expect(ColorEnum.RED).toBe('RED');
      expect(ColorEnum.GREEN).toBe('GREEN');
      expect(ColorEnum.BLUE).toBe('BLUE');
    });

    test('SeverityEnum should have LOW, MEDIUM, HIGH, CRITICAL', () => {
      expect(SeverityEnum.LOW).toBe('LOW');
      expect(SeverityEnum.MEDIUM).toBe('MEDIUM');
      expect(SeverityEnum.HIGH).toBe('HIGH');
      expect(SeverityEnum.CRITICAL).toBe('CRITICAL');
    });

    test('RoleEnum should have exactly 3 keys', () => {
      expect(Object.keys(RoleEnum)).toHaveLength(3);
    });

    test('ColorEnum should have exactly 3 keys', () => {
      expect(Object.keys(ColorEnum)).toHaveLength(3);
    });

    test('SeverityEnum should have exactly 4 keys', () => {
      expect(Object.keys(SeverityEnum)).toHaveLength(4);
    });
  });

  describe('using const in create', () => {
    test('should create with RoleEnum.ADMIN', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Alice', role: RoleEnum.ADMIN },
      });

      expect(result.role).toBe('ADMIN');
      expect(result.role).toBe(RoleEnum.ADMIN);
    });

    test('should create with RoleEnum.USER', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Bob', role: RoleEnum.USER },
      });

      expect(result.role).toBe('USER');
    });

    test('should create with RoleEnum.MODERATOR', async () => {
      const result = await client.db.EnumBasic.create({
        data: { name: 'Charlie', role: RoleEnum.MODERATOR },
      });

      expect(result.role).toBe('MODERATOR');
    });

    test('should create with multiple enum consts', async () => {
      const result = await client.db.EnumMultiple.create({
        data: {
          title: 'Post1',
          role: RoleEnum.ADMIN,
          color: ColorEnum.RED,
          severity: SeverityEnum.HIGH,
        },
      });

      expect(result.role).toBe(RoleEnum.ADMIN);
      expect(result.color).toBe(ColorEnum.RED);
      expect(result.severity).toBe(SeverityEnum.HIGH);
    });

    test('should create enum array with const values', async () => {
      const result = await client.db.EnumBasic.create({
        data: {
          name: 'Multi',
          role: RoleEnum.ADMIN,
          roles: [RoleEnum.ADMIN, RoleEnum.USER, RoleEnum.MODERATOR],
        },
      });

      expect(result.roles).toEqual([RoleEnum.ADMIN, RoleEnum.USER, RoleEnum.MODERATOR]);
    });
  });

  describe('using const in queries', () => {
    beforeEach(async () => {
      await client.db.EnumBasic.create({ data: { name: 'Admin1', role: RoleEnum.ADMIN } });
      await client.db.EnumBasic.create({ data: { name: 'User1', role: RoleEnum.USER } });
      await client.db.EnumBasic.create({ data: { name: 'Mod1', role: RoleEnum.MODERATOR } });
    });

    test('should findMany with RoleEnum const in where', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: RoleEnum.ADMIN },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('Admin1');
    });

    test('should findMany with in filter using consts', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { in: [RoleEnum.ADMIN, RoleEnum.MODERATOR] } },
      });

      expect(results.length).toBe(2);
    });

    test('should findMany with neq using const', async () => {
      const results = await client.db.EnumBasic.findMany({
        where: { role: { neq: RoleEnum.ADMIN } },
      });

      expect(results.length).toBe(2);
    });

    test('should count with const filter', async () => {
      const count = await client.db.EnumBasic.count({ role: RoleEnum.USER });

      expect(count).toBe(1);
    });

    test('should check exists with const filter', async () => {
      const exists = await client.db.EnumBasic.exists({ role: RoleEnum.MODERATOR });

      expect(exists).toBe(true);
    });
  });

  describe('using const in update', () => {
    test('should update with const value', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'UpdConst', role: RoleEnum.ADMIN },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { role: RoleEnum.USER },
      });

      expect(updated!.role).toBe(RoleEnum.USER);
    });

    test('should push const value to array', async () => {
      const created = await client.db.EnumBasic.create({
        data: { name: 'PushConst', role: RoleEnum.ADMIN, roles: [RoleEnum.ADMIN] },
      });

      const updated = await client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        data: { roles: { push: RoleEnum.MODERATOR } },
      });

      expect(updated!.roles).toContain(RoleEnum.MODERATOR);
    });
  });

  describe('using SeverityEnum in defaults model', () => {
    test('should create with SeverityEnum override', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'SevTest', severity: SeverityEnum.CRITICAL },
      });

      expect(result.severity).toBe(SeverityEnum.CRITICAL);
    });

    test('should verify default matches enum const', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'DefCheck' },
      });

      // Default severity is 'LOW' which should match SeverityEnum.LOW
      expect(result.severity).toBe(SeverityEnum.LOW);
    });

    test('should verify default role matches enum const', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'RoleDefCheck' },
      });

      // Default role is 'ADMIN' which should match RoleEnum.ADMIN
      expect(result.role).toBe(RoleEnum.ADMIN);
    });
  });
});
