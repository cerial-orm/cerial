/**
 * E2E Tests: Enum Fields Inside Objects
 *
 * Schema: enums.cerial
 * Tests enum fields within embedded object types (EnumAddress).
 * Covers: create, update, filter by object's enum sub-field, optional objects with enums.
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
import { isCerialId } from 'cerial';
import { SeverityEnum } from '../generated';

describe('E2E Enums: Object With Enum', () => {
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

  describe('create with object containing enum', () => {
    test('should create with required object containing enum field', async () => {
      const result = await client.db.EnumWithObject.create({
        data: {
          name: 'Alice',
          address: { city: 'NYC', severity: 'HIGH' },
        },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.name).toBe('Alice');
      expect(result.address.city).toBe('NYC');
      expect(result.address.severity).toBe('HIGH');
    });

    test('should create with each enum variant in object', async () => {
      const r1 = await client.db.EnumWithObject.create({
        data: { name: 'A', address: { city: 'NYC', severity: 'LOW' } },
      });
      const r2 = await client.db.EnumWithObject.create({
        data: { name: 'B', address: { city: 'LA', severity: 'MEDIUM' } },
      });
      const r3 = await client.db.EnumWithObject.create({
        data: { name: 'C', address: { city: 'SF', severity: 'HIGH' } },
      });
      const r4 = await client.db.EnumWithObject.create({
        data: { name: 'D', address: { city: 'CHI', severity: 'CRITICAL' } },
      });

      expect(r1.address.severity).toBe('LOW');
      expect(r2.address.severity).toBe('MEDIUM');
      expect(r3.address.severity).toBe('HIGH');
      expect(r4.address.severity).toBe('CRITICAL');
    });

    test('should create with const enum value in object', async () => {
      const result = await client.db.EnumWithObject.create({
        data: {
          name: 'Const',
          address: { city: 'NYC', severity: SeverityEnum.CRITICAL },
        },
      });

      expect(result.address.severity).toBe(SeverityEnum.CRITICAL);
    });

    test('should create with optional object containing enum provided', async () => {
      const result = await client.db.EnumWithObject.create({
        data: {
          name: 'WithOpt',
          address: { city: 'NYC', severity: 'HIGH' },
          optAddress: { city: 'LA', severity: 'LOW' },
        },
      });

      expect(result.optAddress).toBeDefined();
      expect(result.optAddress!.city).toBe('LA');
      expect(result.optAddress!.severity).toBe('LOW');
    });

    test('should create with optional object omitted', async () => {
      const result = await client.db.EnumWithObject.create({
        data: {
          name: 'NoOpt',
          address: { city: 'NYC', severity: 'HIGH' },
        },
      });

      expect(result.optAddress).toBeUndefined();
    });
  });

  describe('read back object with enum', () => {
    test('should read back full object with enum after create', async () => {
      const created = await client.db.EnumWithObject.create({
        data: {
          name: 'ReadTest',
          address: { city: 'Boston', severity: 'MEDIUM' },
        },
      });

      const found = await client.db.EnumWithObject.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.address.city).toBe('Boston');
      expect(found!.address.severity).toBe('MEDIUM');
    });

    test('should read back optional object with enum', async () => {
      const created = await client.db.EnumWithObject.create({
        data: {
          name: 'ReadOpt',
          address: { city: 'Denver', severity: 'LOW' },
          optAddress: { city: 'Miami', severity: 'HIGH' },
        },
      });

      const found = await client.db.EnumWithObject.findUnique({
        where: { id: created.id },
      });

      expect(found!.optAddress).toBeDefined();
      expect(found!.optAddress!.severity).toBe('HIGH');
    });
  });

  describe('update object enum field', () => {
    test('should update object enum via merge', async () => {
      const created = await client.db.EnumWithObject.create({
        data: {
          name: 'UpdMerge',
          address: { city: 'NYC', severity: 'LOW' },
        },
      });

      const updated = await client.db.EnumWithObject.updateUnique({
        where: { id: created.id },
        data: { address: { severity: 'CRITICAL' } },
      });

      expect(updated!.address.severity).toBe('CRITICAL');
      // city should be preserved via merge
      expect(updated!.address.city).toBe('NYC');
    });

    test('should update object city and preserve enum', async () => {
      const created = await client.db.EnumWithObject.create({
        data: {
          name: 'UpdCity',
          address: { city: 'NYC', severity: 'HIGH' },
        },
      });

      const updated = await client.db.EnumWithObject.updateUnique({
        where: { id: created.id },
        data: { address: { city: 'LA' } },
      });

      expect(updated!.address.city).toBe('LA');
      expect(updated!.address.severity).toBe('HIGH');
    });

    test('should full replace object with set containing enum', async () => {
      const created = await client.db.EnumWithObject.create({
        data: {
          name: 'FullReplace',
          address: { city: 'NYC', severity: 'LOW' },
        },
      });

      const updated = await client.db.EnumWithObject.updateUnique({
        where: { id: created.id },
        data: { address: { set: { city: 'Chicago', severity: 'HIGH' } } },
      });

      expect(updated!.address.city).toBe('Chicago');
      expect(updated!.address.severity).toBe('HIGH');
    });

    test('should set optional object with enum from NONE to value', async () => {
      const created = await client.db.EnumWithObject.create({
        data: {
          name: 'SetOpt',
          address: { city: 'NYC', severity: 'LOW' },
        },
      });

      expect(created.optAddress).toBeUndefined();

      const updated = await client.db.EnumWithObject.updateUnique({
        where: { id: created.id },
        data: { optAddress: { set: { city: 'LA', severity: 'MEDIUM' } } },
      });

      expect(updated!.optAddress).toBeDefined();
      expect(updated!.optAddress!.city).toBe('LA');
      expect(updated!.optAddress!.severity).toBe('MEDIUM');
    });

    test('should update optional object enum via merge', async () => {
      const created = await client.db.EnumWithObject.create({
        data: {
          name: 'UpdOptMerge',
          address: { city: 'NYC', severity: 'LOW' },
          optAddress: { city: 'LA', severity: 'LOW' },
        },
      });

      const updated = await client.db.EnumWithObject.updateUnique({
        where: { id: created.id },
        data: { optAddress: { severity: 'HIGH' } },
      });

      expect(updated!.optAddress!.severity).toBe('HIGH');
      expect(updated!.optAddress!.city).toBe('LA');
    });
  });

  describe('filter by object enum sub-field', () => {
    beforeEach(async () => {
      await client.db.EnumWithObject.create({
        data: { name: 'A', address: { city: 'NYC', severity: 'HIGH' } },
      });
      await client.db.EnumWithObject.create({
        data: { name: 'B', address: { city: 'LA', severity: 'LOW' } },
      });
      await client.db.EnumWithObject.create({
        data: { name: 'C', address: { city: 'SF', severity: 'HIGH' } },
      });
    });

    test('should filter by object enum equality shorthand', async () => {
      const results = await client.db.EnumWithObject.findMany({
        where: { address: { severity: 'HIGH' } },
      });

      expect(results.length).toBe(2);
      expect(results.some((r) => r.name === 'A')).toBe(true);
      expect(results.some((r) => r.name === 'C')).toBe(true);
    });

    test('should filter by object enum with eq operator', async () => {
      const results = await client.db.EnumWithObject.findMany({
        where: { address: { severity: { eq: 'LOW' } } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('B');
    });

    test('should filter by object enum with neq operator', async () => {
      const results = await client.db.EnumWithObject.findMany({
        where: { address: { severity: { neq: 'HIGH' } } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('B');
    });

    test('should filter by object enum with in operator', async () => {
      const results = await client.db.EnumWithObject.findMany({
        where: { address: { severity: { in: ['HIGH', 'CRITICAL'] } } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by combined object fields including enum', async () => {
      const results = await client.db.EnumWithObject.findMany({
        where: { address: { city: 'NYC', severity: 'HIGH' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('A');
    });

    test('should filter by object enum using const', async () => {
      const results = await client.db.EnumWithObject.findMany({
        where: { address: { severity: SeverityEnum.HIGH } },
      });

      expect(results.length).toBe(2);
    });
  });

  describe('select object with enum sub-fields', () => {
    test('should select full object with boolean true', async () => {
      const created = await client.db.EnumWithObject.create({
        data: { name: 'Sel', address: { city: 'NYC', severity: 'HIGH' } },
      });

      const result = await client.db.EnumWithObject.findUnique({
        where: { id: created.id },
        select: { address: true },
      });

      expect(result).toBeDefined();
      expect(result!.address.city).toBe('NYC');
      expect(result!.address.severity).toBe('HIGH');
    });

    test('should select object sub-field (severity only)', async () => {
      const created = await client.db.EnumWithObject.create({
        data: { name: 'SubSel', address: { city: 'LA', severity: 'MEDIUM' } },
      });

      const result = await client.db.EnumWithObject.findUnique({
        where: { id: created.id },
        select: { address: { severity: true } },
      });

      expect(result).toBeDefined();
      expect(result!.address.severity).toBe('MEDIUM');
      expect((result!.address as any).city).toBeUndefined();
    });
  });
});
