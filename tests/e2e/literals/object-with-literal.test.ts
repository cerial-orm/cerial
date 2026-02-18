/**
 * E2E Tests: Literal in Object Fields
 *
 * Tests object types that contain literal fields (LiteralAddress has a Status field).
 * Covers: create, read, update object with literal sub-field, filtering on object literal sub-field.
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

describe('E2E Literals: Object with Literal Field', () => {
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
    test('should create with required object containing literal', async () => {
      const result = await client.db.LiteralWithObject.create({
        data: {
          name: 'Alice',
          address: { city: 'NYC', status: 'active' },
        },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.address.city).toBe('NYC');
      expect(result.address.status).toBe('active');
    });

    test('should create with each literal variant in object', async () => {
      const r1 = await client.db.LiteralWithObject.create({
        data: { name: 'A', address: { city: 'A', status: 'active' } },
      });
      const r2 = await client.db.LiteralWithObject.create({
        data: { name: 'B', address: { city: 'B', status: 'inactive' } },
      });
      const r3 = await client.db.LiteralWithObject.create({
        data: { name: 'C', address: { city: 'C', status: 'pending' } },
      });

      expect(r1.address.status).toBe('active');
      expect(r2.address.status).toBe('inactive');
      expect(r3.address.status).toBe('pending');
    });

    test('should create with optional object containing literal', async () => {
      const result = await client.db.LiteralWithObject.create({
        data: {
          name: 'Bob',
          address: { city: 'LA', status: 'active' },
          optAddress: { city: 'SF', status: 'pending' },
        },
      });

      expect(result.optAddress).toBeDefined();
      expect(result.optAddress!.city).toBe('SF');
      expect(result.optAddress!.status).toBe('pending');
    });

    test('should create with optional object omitted', async () => {
      const result = await client.db.LiteralWithObject.create({
        data: {
          name: 'Carol',
          address: { city: 'CHI', status: 'inactive' },
        },
      });

      expect(result.optAddress).toBeUndefined();
    });
  });

  describe('findUnique', () => {
    test('should read back object with literal field', async () => {
      const created = await client.db.LiteralWithObject.create({
        data: {
          name: 'Read',
          address: { city: 'NYC', status: 'active' },
          optAddress: { city: 'LA', status: 'inactive' },
        },
      });

      const found = await client.db.LiteralWithObject.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.address.status).toBe('active');
      expect(found!.optAddress!.status).toBe('inactive');
    });
  });

  describe('update', () => {
    test('should update literal sub-field in object with partial update', async () => {
      const created = await client.db.LiteralWithObject.create({
        data: {
          name: 'Update',
          address: { city: 'NYC', status: 'active' },
        },
      });

      const updated = await client.db.LiteralWithObject.updateUnique({
        where: { id: created.id },
        data: { address: { status: 'pending' } },
      });

      expect(updated!.address.status).toBe('pending');
      // city should be preserved
      expect(updated!.address.city).toBe('NYC');
    });

    test('should update literal sub-field in object with set', async () => {
      const created = await client.db.LiteralWithObject.create({
        data: {
          name: 'Set',
          address: { city: 'NYC', status: 'active' },
        },
      });

      const updated = await client.db.LiteralWithObject.updateUnique({
        where: { id: created.id },
        data: { address: { set: { city: 'LA', status: 'inactive' } } },
      });

      expect(updated!.address.city).toBe('LA');
      expect(updated!.address.status).toBe('inactive');
    });

    test('should update optional object with literal', async () => {
      const created = await client.db.LiteralWithObject.create({
        data: {
          name: 'OptUpd',
          address: { city: 'NYC', status: 'active' },
        },
      });

      const updated = await client.db.LiteralWithObject.updateUnique({
        where: { id: created.id },
        data: { optAddress: { set: { city: 'SF', status: 'pending' } } },
      });

      expect(updated!.optAddress).toBeDefined();
      expect(updated!.optAddress!.status).toBe('pending');
    });
  });

  describe('filtering on object literal sub-field', () => {
    beforeEach(async () => {
      await client.db.LiteralWithObject.create({
        data: { name: 'A', address: { city: 'NYC', status: 'active' } },
      });
      await client.db.LiteralWithObject.create({
        data: { name: 'B', address: { city: 'LA', status: 'inactive' } },
      });
      await client.db.LiteralWithObject.create({
        data: { name: 'C', address: { city: 'SF', status: 'pending' } },
      });
    });

    test('should filter by object literal sub-field direct value', async () => {
      const results = await client.db.LiteralWithObject.findMany({
        where: { address: { status: 'active' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });

    test('should filter by object literal sub-field with eq', async () => {
      const results = await client.db.LiteralWithObject.findMany({
        where: { address: { status: { eq: 'inactive' } } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('B');
    });

    test('should filter by object literal sub-field with in', async () => {
      const results = await client.db.LiteralWithObject.findMany({
        where: { address: { status: { in: ['active', 'pending'] } } },
      });

      expect(results.length).toBe(2);
    });

    test('should combine object literal filter with object string filter', async () => {
      const results = await client.db.LiteralWithObject.findMany({
        where: { address: { status: 'active', city: 'NYC' } },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });
  });

  describe('select on object with literal', () => {
    test('should select object with literal sub-field', async () => {
      const created = await client.db.LiteralWithObject.create({
        data: { name: 'Sel', address: { city: 'NYC', status: 'active' } },
      });

      const found = await client.db.LiteralWithObject.findUnique({
        where: { id: created.id },
        select: { name: true, address: true },
      });

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Sel');
      expect(found!.address.status).toBe('active');
    });

    test('should select specific sub-fields of object including literal', async () => {
      const created = await client.db.LiteralWithObject.create({
        data: { name: 'SubSel', address: { city: 'NYC', status: 'active' } },
      });

      const found = await client.db.LiteralWithObject.findUnique({
        where: { id: created.id },
        select: { address: { status: true } },
      });

      expect(found).not.toBeNull();
      expect(found!.address.status).toBe('active');
    });
  });

  describe('delete', () => {
    test('should delete and return before state with object literal', async () => {
      const created = await client.db.LiteralWithObject.create({
        data: { name: 'Del', address: { city: 'NYC', status: 'active' } },
      });

      const deleted = await client.db.LiteralWithObject.deleteUnique({
        where: { id: created.id },
        return: 'before',
      });

      expect(deleted).not.toBeNull();
      expect(deleted!.address.status).toBe('active');
    });
  });
});
