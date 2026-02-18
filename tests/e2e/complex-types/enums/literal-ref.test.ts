/**
 * E2E Tests: Enum Literal Reference
 *
 * Schema: enums.cerial
 * Tests literal types that reference enums via literalRef (RoleOrCustom).
 * RoleOrCustom = Role | 'custom' = 'ADMIN' | 'USER' | 'MODERATOR' | 'custom'
 * Covers: create with enum value, create with literal-only value, filtering.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { RoleEnum } from '../../generated';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Enums: Literal Ref', () => {
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

  describe('create with literal referencing enum', () => {
    test('should create with enum value ADMIN', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { access: 'ADMIN' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.access).toBe('ADMIN');
    });

    test('should create with enum value USER', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { access: 'USER' },
      });

      expect(result.access).toBe('USER');
    });

    test('should create with enum value MODERATOR', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { access: 'MODERATOR' },
      });

      expect(result.access).toBe('MODERATOR');
    });

    test('should create with literal-only value custom', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { access: 'custom' },
      });

      expect(result.access).toBe('custom');
    });

    test('should create with enum const value', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { access: RoleEnum.ADMIN },
      });

      expect(result.access).toBe('ADMIN');
    });
  });

  describe('read back', () => {
    test('should read back enum-sourced value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { access: 'MODERATOR' },
      });

      const found = await client.db.EnumLiteralRef.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.access).toBe('MODERATOR');
    });

    test('should read back literal-only value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { access: 'custom' },
      });

      const found = await client.db.EnumLiteralRef.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.access).toBe('custom');
    });
  });

  describe('update', () => {
    test('should update from enum value to another enum value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { access: 'ADMIN' },
      });

      const updated = await client.db.EnumLiteralRef.updateUnique({
        where: { id: created.id },
        data: { access: 'USER' },
      });

      expect(updated!.access).toBe('USER');
    });

    test('should update from enum value to literal-only value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { access: 'ADMIN' },
      });

      const updated = await client.db.EnumLiteralRef.updateUnique({
        where: { id: created.id },
        data: { access: 'custom' },
      });

      expect(updated!.access).toBe('custom');
    });

    test('should update from literal-only value to enum value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { access: 'custom' },
      });

      const updated = await client.db.EnumLiteralRef.updateUnique({
        where: { id: created.id },
        data: { access: 'MODERATOR' },
      });

      expect(updated!.access).toBe('MODERATOR');
    });
  });

  describe('filter', () => {
    beforeEach(async () => {
      await client.db.EnumLiteralRef.create({ data: { access: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { access: 'USER' } });
      await client.db.EnumLiteralRef.create({ data: { access: 'custom' } });
    });

    test('should filter by enum value', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { access: 'ADMIN' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.access).toBe('ADMIN');
    });

    test('should filter by literal-only value', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { access: 'custom' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.access).toBe('custom');
    });

    test('should filter by eq operator', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { access: { eq: 'USER' } },
      });

      expect(results.length).toBe(1);
    });

    test('should filter by neq operator', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { access: { neq: 'custom' } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by in with mixed enum and literal values', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { access: { in: ['ADMIN', 'custom'] } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by notIn', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { access: { notIn: ['ADMIN', 'USER'] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.access).toBe('custom');
    });

    test('should filter with const enum value', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { access: RoleEnum.ADMIN },
      });

      expect(results.length).toBe(1);
    });
  });

  describe('delete', () => {
    test('should delete by literal ref value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { access: 'custom' },
      });

      await client.db.EnumLiteralRef.deleteUnique({
        where: { id: created.id },
      });

      const found = await client.db.EnumLiteralRef.findUnique({
        where: { id: created.id },
      });
      expect(found).toBeNull();
    });

    test('should deleteMany by literal ref filter', async () => {
      await client.db.EnumLiteralRef.create({ data: { access: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { access: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { access: 'custom' } });

      const count = await client.db.EnumLiteralRef.deleteMany({
        where: { access: 'ADMIN' },
      });

      expect(count).toBe(2);
    });
  });

  describe('count and exists', () => {
    beforeEach(async () => {
      await client.db.EnumLiteralRef.create({ data: { access: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { access: 'custom' } });
    });

    test('should count by enum-sourced value', async () => {
      const count = await client.db.EnumLiteralRef.count({ access: 'ADMIN' });

      expect(count).toBe(1);
    });

    test('should count by literal-only value', async () => {
      const count = await client.db.EnumLiteralRef.count({ access: 'custom' });

      expect(count).toBe(1);
    });

    test('should check exists with enum value', async () => {
      const exists = await client.db.EnumLiteralRef.exists({ access: 'ADMIN' });

      expect(exists).toBe(true);
    });

    test('should check exists with non-existent value', async () => {
      const exists = await client.db.EnumLiteralRef.exists({ access: 'MODERATOR' });

      expect(exists).toBe(false);
    });
  });
});
