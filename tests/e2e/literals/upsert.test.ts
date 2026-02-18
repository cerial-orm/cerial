/**
 * E2E Tests: Literal Upsert
 *
 * Tests upsert operations with literal fields.
 * Covers: create path, update path, return options, select with upsert.
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

describe('E2E Literals: Upsert', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.literals);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.literals);
  });

  describe('upsert create path', () => {
    test('should create new record with literal fields', async () => {
      const result = await client.db.LiteralBasic.upsert({
        where: { id: 'literal_basic:upsert-1' },
        create: { name: 'Upserted', status: 'active', priority: 1, mixed: 'low' },
      });

      expect(result).not.toBeNull();
      expect(isCerialId(result!.id)).toBe(true);
      expect(result!.status).toBe('active');
      expect(result!.priority).toBe(1);
    });

    test('should use create data with mixed literal on create path', async () => {
      const result = await client.db.LiteralBasic.upsert({
        where: { id: 'literal_basic:upsert-2' },
        create: { name: 'MixedUpsert', status: 'pending', priority: 3, mixed: true },
      });

      expect(result).not.toBeNull();
      expect(result!.mixed).toBe(true);
    });

    test('should use default values on upsert create path', async () => {
      const result = await client.db.LiteralDefaults.upsert({
        where: { id: 'literal_defaults:upsert-1' },
        create: { label: 'defaults-upsert' },
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
      expect(result!.priority).toBe(1);
    });
  });

  describe('upsert update path', () => {
    test('should update existing record literal fields', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'Existing', status: 'active', priority: 1, mixed: 'low' },
      });

      const result = await client.db.LiteralBasic.upsert({
        where: { id: created.id },
        create: { name: 'ShouldNotUse', status: 'pending', priority: 3, mixed: true },
        update: { status: 'inactive', priority: 2 },
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('inactive');
      expect(result!.priority).toBe(2);
      expect(result!.name).toBe('Existing'); // preserved from original
    });

    test('should update mixed literal variant on update path', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'MixUpd', status: 'active', priority: 1, mixed: 'low' },
      });

      const result = await client.db.LiteralBasic.upsert({
        where: { id: created.id },
        create: { name: 'x', status: 'active', priority: 1, mixed: 'low' },
        update: { mixed: 2 },
      });

      expect(result).not.toBeNull();
      expect(result!.mixed).toBe(2);
    });
  });

  describe('upsert return options', () => {
    test('should return boolean true on upsert create path', async () => {
      const result = await client.db.LiteralBasic.upsert({
        where: { id: 'literal_basic:upsert-bool-1' },
        create: { name: 'BoolCreate', status: 'active', priority: 1, mixed: 'low' },
        return: true,
      });

      expect(result).toBe(true);
    });

    test('should return before state as null on create path', async () => {
      const result = await client.db.LiteralBasic.upsert({
        where: { id: 'literal_basic:upsert-before-1' },
        create: { name: 'BeforeCreate', status: 'active', priority: 1, mixed: 'low' },
        return: 'before',
      });

      expect(result).toBeNull();
    });

    test('should return before state on update path', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'BeforeUpd', status: 'active', priority: 1, mixed: 'low' },
      });

      const result = await client.db.LiteralBasic.upsert({
        where: { id: created.id },
        create: { name: 'x', status: 'active', priority: 1, mixed: 'low' },
        update: { status: 'inactive' },
        return: 'before',
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
    });
  });

  describe('upsert with select', () => {
    test('should return selected fields on create path', async () => {
      const result = await client.db.LiteralBasic.upsert({
        where: { id: 'literal_basic:upsert-sel-1' },
        create: { name: 'SelCreate', status: 'pending', priority: 3, mixed: true },
        select: { name: true, status: true },
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('SelCreate');
      expect(result!.status).toBe('pending');
    });
  });

  describe('upsert with array literals', () => {
    test('should create with array of literals on create path', async () => {
      const result = await client.db.LiteralBasic.upsert({
        where: { id: 'literal_basic:upsert-arr-1' },
        create: {
          name: 'ArrCreate',
          status: 'active',
          priority: 1,
          mixed: 'low',
          statuses: ['active', 'pending'],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.statuses).toEqual(['active', 'pending']);
    });

    test('should update array of literals on update path', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'ArrUpd', status: 'active', priority: 1, mixed: 'low', statuses: ['active'] },
      });

      const result = await client.db.LiteralBasic.upsert({
        where: { id: created.id },
        create: { name: 'x', status: 'active', priority: 1, mixed: 'low' },
        update: { statuses: ['inactive', 'pending'] },
      });

      expect(result).not.toBeNull();
      expect(result!.statuses).toEqual(['inactive', 'pending']);
    });
  });
});
