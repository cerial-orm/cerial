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
        data: { visibility: 'ADMIN' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.visibility).toBe('ADMIN');
    });

    test('should create with enum value USER', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { visibility: 'USER' },
      });

      expect(result.visibility).toBe('USER');
    });

    test('should create with enum value MODERATOR', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { visibility: 'MODERATOR' },
      });

      expect(result.visibility).toBe('MODERATOR');
    });

    test('should create with literal-only value custom', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { visibility: 'custom' },
      });

      expect(result.visibility).toBe('custom');
    });

    test('should create with enum const value', async () => {
      const result = await client.db.EnumLiteralRef.create({
        data: { visibility: RoleEnum.ADMIN },
      });

      expect(result.visibility).toBe('ADMIN');
    });
  });

  describe('read back', () => {
    test('should read back enum-sourced value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { visibility: 'MODERATOR' },
      });

      const found = await client.db.EnumLiteralRef.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.visibility).toBe('MODERATOR');
    });

    test('should read back literal-only value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { visibility: 'custom' },
      });

      const found = await client.db.EnumLiteralRef.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.visibility).toBe('custom');
    });
  });

  describe('update', () => {
    test('should update from enum value to another enum value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { visibility: 'ADMIN' },
      });

      const updated = await client.db.EnumLiteralRef.updateUnique({
        where: { id: created.id },
        data: { visibility: 'USER' },
      });

      expect(updated!.visibility).toBe('USER');
    });

    test('should update from enum value to literal-only value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { visibility: 'ADMIN' },
      });

      const updated = await client.db.EnumLiteralRef.updateUnique({
        where: { id: created.id },
        data: { visibility: 'custom' },
      });

      expect(updated!.visibility).toBe('custom');
    });

    test('should update from literal-only value to enum value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { visibility: 'custom' },
      });

      const updated = await client.db.EnumLiteralRef.updateUnique({
        where: { id: created.id },
        data: { visibility: 'MODERATOR' },
      });

      expect(updated!.visibility).toBe('MODERATOR');
    });
  });

  describe('filter', () => {
    beforeEach(async () => {
      await client.db.EnumLiteralRef.create({ data: { visibility: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { visibility: 'USER' } });
      await client.db.EnumLiteralRef.create({ data: { visibility: 'custom' } });
    });

    test('should filter by enum value', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { visibility: 'ADMIN' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.visibility).toBe('ADMIN');
    });

    test('should filter by literal-only value', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { visibility: 'custom' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.visibility).toBe('custom');
    });

    test('should filter by eq operator', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { visibility: { eq: 'USER' } },
      });

      expect(results.length).toBe(1);
    });

    test('should filter by neq operator', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { visibility: { neq: 'custom' } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by in with mixed enum and literal values', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { visibility: { in: ['ADMIN', 'custom'] } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter by notIn', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { visibility: { notIn: ['ADMIN', 'USER'] } },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.visibility).toBe('custom');
    });

    test('should filter with const enum value', async () => {
      const results = await client.db.EnumLiteralRef.findMany({
        where: { visibility: RoleEnum.ADMIN },
      });

      expect(results.length).toBe(1);
    });
  });

  describe('delete', () => {
    test('should delete by literal ref value', async () => {
      const created = await client.db.EnumLiteralRef.create({
        data: { visibility: 'custom' },
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
      await client.db.EnumLiteralRef.create({ data: { visibility: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { visibility: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { visibility: 'custom' } });

      const count = await client.db.EnumLiteralRef.deleteMany({
        where: { visibility: 'ADMIN' },
      });

      expect(count).toBe(2);
    });
  });

  describe('count and exists', () => {
    beforeEach(async () => {
      await client.db.EnumLiteralRef.create({ data: { visibility: 'ADMIN' } });
      await client.db.EnumLiteralRef.create({ data: { visibility: 'custom' } });
    });

    test('should count by enum-sourced value', async () => {
      const count = await client.db.EnumLiteralRef.count({ visibility: 'ADMIN' });

      expect(count).toBe(1);
    });

    test('should count by literal-only value', async () => {
      const count = await client.db.EnumLiteralRef.count({ visibility: 'custom' });

      expect(count).toBe(1);
    });

    test('should check exists with enum value', async () => {
      const exists = await client.db.EnumLiteralRef.exists({ visibility: 'ADMIN' });

      expect(exists).toBe(true);
    });

    test('should check exists with non-existent value', async () => {
      const exists = await client.db.EnumLiteralRef.exists({ visibility: 'MODERATOR' });

      expect(exists).toBe(false);
    });
  });
});
