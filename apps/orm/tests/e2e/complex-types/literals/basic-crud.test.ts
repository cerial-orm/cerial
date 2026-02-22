/**
 * E2E Tests: Literal Basic CRUD
 *
 * Tests create, read, update, delete for literal fields on models.
 * Covers: required string literal, int literal, mixed literal, optional, nullable, array literals.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Literals: Basic CRUD', () => {
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

  describe('create', () => {
    test('should create with required string literal', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'Alice', status: 'active', priority: 1, mixed: 'low' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.name).toBe('Alice');
      expect(result.status).toBe('active');
    });

    test('should create with each string literal variant', async () => {
      const r1 = await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      const r2 = await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'inactive', priority: 1, mixed: 'low' },
      });
      const r3 = await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'pending', priority: 1, mixed: 'low' },
      });

      expect(r1.status).toBe('active');
      expect(r2.status).toBe('inactive');
      expect(r3.status).toBe('pending');
    });

    test('should create with int literal values', async () => {
      const r1 = await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      const r2 = await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 2, mixed: 'low' },
      });
      const r3 = await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 3, mixed: 'low' },
      });

      expect(r1.priority).toBe(1);
      expect(r2.priority).toBe(2);
      expect(r3.priority).toBe(3);
    });

    test('should create with mixed literal - string variant', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'high' },
      });

      expect(result.mixed).toBe('high');
    });

    test('should create with mixed literal - int variant', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 2 },
      });

      expect(result.mixed).toBe(2);
    });

    test('should create with mixed literal - bool variant', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: true },
      });

      expect(result.mixed).toBe(true);
    });

    test('should create with optional literal omitted', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'low' },
      });

      expect(result.optStatus).toBeUndefined();
    });

    test('should create with optional literal provided', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'low', optStatus: 'pending' },
      });

      expect(result.optStatus).toBe('pending');
    });

    test('should create with nullable literal as null', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'low', nullStatus: null },
      });

      expect(result.nullStatus).toBeNull();
    });

    test('should create with nullable literal as value', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'low', nullStatus: 'active' },
      });

      expect(result.nullStatus).toBe('active');
    });

    test('should create with nullable literal omitted', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'low' },
      });

      // nullable+optional = undefined when omitted (NONE)
      expect(result.nullStatus).toBeUndefined();
    });

    test('should create with array of literals', async () => {
      const result = await client.db.LiteralBasic.create({
        data: {
          name: 'X',
          status: 'active',
          priority: 1,
          mixed: 'low',
          statuses: ['active', 'pending', 'inactive'],
        },
      });

      expect(result.statuses).toEqual(['active', 'pending', 'inactive']);
    });

    test('should create with empty array of literals', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'low', statuses: [] },
      });

      expect(result.statuses).toEqual([]);
    });

    test('should default array of literals to empty array when omitted', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'X', status: 'active', priority: 1, mixed: 'low' },
      });

      expect(result.statuses).toEqual([]);
    });
  });

  describe('findUnique', () => {
    test('should read back literal fields after create', async () => {
      const created = await client.db.LiteralBasic.create({
        data: {
          name: 'ReadTest',
          status: 'inactive',
          priority: 2,
          mixed: true,
          optStatus: 'active',
          nullStatus: 'pending',
          statuses: ['active', 'inactive'],
        },
      });

      const found = await client.db.LiteralBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.status).toBe('inactive');
      expect(found!.priority).toBe(2);
      expect(found!.mixed).toBe(true);
      expect(found!.optStatus).toBe('active');
      expect(found!.nullStatus).toBe('pending');
      expect(found!.statuses).toEqual(['active', 'inactive']);
    });

    test('should return undefined optStatus when absent', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'NoOpt', status: 'active', priority: 1, mixed: 'low' },
      });

      const found = await client.db.LiteralBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.optStatus).toBeUndefined();
    });

    test('should return null nullStatus when set to null', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'NullVal', status: 'active', priority: 1, mixed: 'low', nullStatus: null },
      });

      const found = await client.db.LiteralBasic.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.nullStatus).toBeNull();
    });
  });

  describe('findMany', () => {
    test('should find all records with literal fields', async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'inactive', priority: 2, mixed: 'high' },
      });

      const results = await client.db.LiteralBasic.findMany();

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('updateUnique', () => {
    test('should update a string literal field', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'UpdStr', status: 'active', priority: 1, mixed: 'low' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { status: 'inactive' },
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('inactive');
    });

    test('should update an int literal field', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'UpdInt', status: 'active', priority: 1, mixed: 'low' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { priority: 3 },
      });

      expect(updated).not.toBeNull();
      expect(updated!.priority).toBe(3);
    });

    test('should update a mixed literal field', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'UpdMix', status: 'active', priority: 1, mixed: 'low' },
      });

      // Update from string to int
      const updated1 = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { mixed: 2 },
      });
      expect(updated1!.mixed).toBe(2);

      // Update from int to bool
      const updated2 = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { mixed: true },
      });
      expect(updated2!.mixed).toBe(true);

      // Update from bool to string
      const updated3 = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { mixed: 'high' },
      });
      expect(updated3!.mixed).toBe('high');
    });

    test('should update optional literal to a value', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'UpdOpt', status: 'active', priority: 1, mixed: 'low' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { optStatus: 'pending' },
      });

      expect(updated!.optStatus).toBe('pending');
    });

    test('should update nullable literal to null', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'UpdNull', status: 'active', priority: 1, mixed: 'low', nullStatus: 'active' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { nullStatus: null },
      });

      expect(updated!.nullStatus).toBeNull();
    });

    test('should update nullable literal from null to value', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'UpdNullVal', status: 'active', priority: 1, mixed: 'low', nullStatus: null },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { nullStatus: 'inactive' },
      });

      expect(updated!.nullStatus).toBe('inactive');
    });

    test('should update array of literals with direct assignment', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'UpdArr', status: 'active', priority: 1, mixed: 'low', statuses: ['active'] },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { statuses: ['inactive', 'pending'] },
      });

      expect(updated!.statuses).toEqual(['inactive', 'pending']);
    });

    test('should push to array of literals', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'PushArr', status: 'active', priority: 1, mixed: 'low', statuses: ['active'] },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { statuses: { push: 'pending' } },
      });

      expect(updated!.statuses).toContain('active');
      expect(updated!.statuses).toContain('pending');
    });

    test('should push multiple to array of literals', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'PushMulti', status: 'active', priority: 1, mixed: 'low', statuses: [] },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { statuses: { push: ['active', 'inactive'] } },
      });

      expect(updated!.statuses).toContain('active');
      expect(updated!.statuses).toContain('inactive');
    });

    test('should return before state on update', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'Before', status: 'active', priority: 1, mixed: 'low' },
      });

      const before = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { status: 'inactive' },
        return: 'before',
      });

      expect(before).not.toBeNull();
      expect(before!.status).toBe('active');
    });
  });

  describe('updateMany', () => {
    test('should update multiple records with literal filter', async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'M1', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'M2', status: 'active', priority: 2, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'M3', status: 'inactive', priority: 1, mixed: 'low' },
      });

      const results = await client.db.LiteralBasic.updateMany({
        where: { status: 'active' },
        data: { status: 'pending' },
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.status === 'pending')).toBe(true);
    });
  });

  describe('deleteUnique', () => {
    test('should delete a record with literal fields', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'DelMe', status: 'active', priority: 1, mixed: 'low' },
      });

      await client.db.LiteralBasic.deleteUnique({ where: { id: created.id } });

      const found = await client.db.LiteralBasic.findUnique({ where: { id: created.id } });
      expect(found).toBeNull();
    });

    test('should delete and return before state with literal fields', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'DelBefore', status: 'pending', priority: 3, mixed: true },
      });

      const deleted = await client.db.LiteralBasic.deleteUnique({
        where: { id: created.id },
        return: 'before',
      });

      expect(deleted).not.toBeNull();
      expect(deleted!.status).toBe('pending');
      expect(deleted!.priority).toBe(3);
      expect(deleted!.mixed).toBe(true);
    });
  });

  describe('deleteMany', () => {
    test('should delete multiple records filtered by literal', async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'D1', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'D2', status: 'active', priority: 2, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'D3', status: 'inactive', priority: 1, mixed: 'low' },
      });

      const count = await client.db.LiteralBasic.deleteMany({ where: { status: 'active' } });

      expect(count).toBe(2);
    });
  });

  describe('count and exists', () => {
    test('should count records filtered by literal', async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'C1', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C2', status: 'active', priority: 2, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C3', status: 'inactive', priority: 1, mixed: 'low' },
      });

      const count = await client.db.LiteralBasic.count({ status: 'active' });

      expect(count).toBe(2);
    });

    test('should check existence with literal filter', async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'E1', status: 'pending', priority: 3, mixed: true },
      });

      const exists = await client.db.LiteralBasic.exists({ status: 'pending' });
      const notExists = await client.db.LiteralBasic.exists({ status: 'inactive' });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });

  describe('select', () => {
    test('should select only specified fields including literal', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'Sel', status: 'active', priority: 1, mixed: 'low' },
      });

      const found = await client.db.LiteralBasic.findUnique({
        where: { id: created.id },
        select: { name: true, status: true },
      });

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Sel');
      expect(found!.status).toBe('active');
    });

    test('should exclude literal from select when false', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'SelExcl', status: 'active', priority: 1, mixed: 'low' },
      });

      const found = await client.db.LiteralBasic.findUnique({
        where: { id: created.id },
        select: { name: true, status: false },
      });

      expect(found).not.toBeNull();
      expect(found!.name).toBe('SelExcl');
    });
  });
});
