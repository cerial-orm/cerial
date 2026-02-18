/**
 * E2E Tests: Enum Defaults
 *
 * Schema: enums.cerial
 * Tests @default decorator on enum fields using the EnumDefaults model.
 * Covers: default applied when omitted, default overridden when provided, multiple defaults.
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
import { isCerialId } from 'cerial';

describe('E2E Enums: Defaults', () => {
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

  describe('create with defaults', () => {
    test('should apply default enum value when omitted', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'test' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.label).toBe('test');
      expect(result.role).toBe('ADMIN');
    });

    test('should apply default severity when omitted', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'test' },
      });

      expect(result.severity).toBe('LOW');
    });

    test('should apply both defaults when both omitted', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'both' },
      });

      expect(result.role).toBe('ADMIN');
      expect(result.severity).toBe('LOW');
    });

    test('should override default role when provided', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'override', role: 'MODERATOR' },
      });

      expect(result.role).toBe('MODERATOR');
    });

    test('should override default severity when provided', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'override', severity: 'CRITICAL' },
      });

      expect(result.severity).toBe('CRITICAL');
    });

    test('should override both defaults when both provided', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'both-override', role: 'USER', severity: 'HIGH' },
      });

      expect(result.role).toBe('USER');
      expect(result.severity).toBe('HIGH');
    });

    test('should override one default and keep other default', async () => {
      const result = await client.db.EnumDefaults.create({
        data: { label: 'partial', role: 'USER' },
      });

      expect(result.role).toBe('USER');
      expect(result.severity).toBe('LOW');
    });
  });

  describe('update with defaults', () => {
    test('should update an enum field that has a default', async () => {
      const created = await client.db.EnumDefaults.create({
        data: { label: 'upd' },
      });

      expect(created.role).toBe('ADMIN');

      const updated = await client.db.EnumDefaults.updateUnique({
        where: { id: created.id },
        data: { role: 'USER' },
      });

      expect(updated!.role).toBe('USER');
    });

    test('should preserve default value when updating other fields', async () => {
      const created = await client.db.EnumDefaults.create({
        data: { label: 'preserve' },
      });

      const updated = await client.db.EnumDefaults.updateUnique({
        where: { id: created.id },
        data: { label: 'changed' },
      });

      expect(updated!.label).toBe('changed');
      expect(updated!.role).toBe('ADMIN');
      expect(updated!.severity).toBe('LOW');
    });

    test('should update severity that had a default', async () => {
      const created = await client.db.EnumDefaults.create({
        data: { label: 'sev-upd' },
      });

      const updated = await client.db.EnumDefaults.updateUnique({
        where: { id: created.id },
        data: { severity: 'MEDIUM' },
      });

      expect(updated!.severity).toBe('MEDIUM');
      expect(updated!.role).toBe('ADMIN');
    });
  });

  describe('findMany with defaults', () => {
    test('should filter by default enum value', async () => {
      await client.db.EnumDefaults.create({ data: { label: 'a' } });
      await client.db.EnumDefaults.create({ data: { label: 'b', role: 'USER' } });
      await client.db.EnumDefaults.create({ data: { label: 'c' } });

      const adminResults = await client.db.EnumDefaults.findMany({
        where: { role: 'ADMIN' },
      });

      expect(adminResults.length).toBe(2);
      expect(adminResults.every((r) => r.role === 'ADMIN')).toBe(true);
    });

    test('should filter by default severity value', async () => {
      await client.db.EnumDefaults.create({ data: { label: 'x' } });
      await client.db.EnumDefaults.create({ data: { label: 'y', severity: 'HIGH' } });

      const lowResults = await client.db.EnumDefaults.findMany({
        where: { severity: 'LOW' },
      });

      expect(lowResults.length).toBe(1);
      expect(lowResults[0]!.label).toBe('x');
    });
  });

  describe('upsert with defaults', () => {
    test('should use default value on create path', async () => {
      const result = await client.db.EnumDefaults.upsert({
        where: { id: 'enum_defaults:upsert-test-1' },
        create: { label: 'upserted' },
      });

      expect(result).not.toBeNull();
      expect(result!.role).toBe('ADMIN');
      expect(result!.severity).toBe('LOW');
    });

    test('should update enum on update path', async () => {
      const created = await client.db.EnumDefaults.create({
        data: { label: 'upsert-upd' },
      });

      const result = await client.db.EnumDefaults.upsert({
        where: { id: created.id },
        create: { label: 'should-not-use' },
        update: { role: 'MODERATOR' },
      });

      expect(result).not.toBeNull();
      expect(result!.role).toBe('MODERATOR');
    });
  });
});
