/**
 * E2E Tests: Literal Extended (literalRef)
 *
 * Tests literal types that reference other literals (ExtendedStatus extends Status).
 * Covers: variant merging, all base variants work, extension-only variants work.
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

describe('E2E Literals: Extended (LiteralRef)', () => {
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

  describe('create with extended literal', () => {
    test('should create with base literal variant (active)', async () => {
      const result = await client.db.LiteralExtended.create({
        data: { status: 'active' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.status).toBe('active');
    });

    test('should create with base literal variant (inactive)', async () => {
      const result = await client.db.LiteralExtended.create({
        data: { status: 'inactive' },
      });

      expect(result.status).toBe('inactive');
    });

    test('should create with base literal variant (pending)', async () => {
      const result = await client.db.LiteralExtended.create({
        data: { status: 'pending' },
      });

      expect(result.status).toBe('pending');
    });

    test('should create with extension variant (archived)', async () => {
      const result = await client.db.LiteralExtended.create({
        data: { status: 'archived' },
      });

      expect(result.status).toBe('archived');
    });

    test('should create with extension variant (deleted)', async () => {
      const result = await client.db.LiteralExtended.create({
        data: { status: 'deleted' },
      });

      expect(result.status).toBe('deleted');
    });
  });

  describe('CRUD with extended literal', () => {
    test('should read back extended literal', async () => {
      const created = await client.db.LiteralExtended.create({
        data: { status: 'archived' },
      });

      const found = await client.db.LiteralExtended.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.status).toBe('archived');
    });

    test('should update from base to extension variant', async () => {
      const created = await client.db.LiteralExtended.create({
        data: { status: 'active' },
      });

      const updated = await client.db.LiteralExtended.updateUnique({
        where: { id: created.id },
        data: { status: 'archived' },
      });

      expect(updated!.status).toBe('archived');
    });

    test('should update from extension to base variant', async () => {
      const created = await client.db.LiteralExtended.create({
        data: { status: 'deleted' },
      });

      const updated = await client.db.LiteralExtended.updateUnique({
        where: { id: created.id },
        data: { status: 'active' },
      });

      expect(updated!.status).toBe('active');
    });

    test('should delete records with extended literal', async () => {
      await client.db.LiteralExtended.create({ data: { status: 'archived' } });
      await client.db.LiteralExtended.create({ data: { status: 'deleted' } });
      await client.db.LiteralExtended.create({ data: { status: 'active' } });

      const count = await client.db.LiteralExtended.deleteMany({
        where: { status: { in: ['archived', 'deleted'] } },
      });

      expect(count).toBe(2);
    });
  });
});
