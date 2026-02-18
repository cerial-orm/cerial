/**
 * E2E Tests: Literal Defaults
 *
 * Tests @default decorator on literal fields.
 * Covers: default applied when omitted, default overridden when provided.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Literals: Defaults', () => {
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

  describe('create with defaults', () => {
    test('should apply default string literal when omitted', async () => {
      const result = await client.db.LiteralDefaults.create({
        data: { label: 'test' },
      });

      expect(isCerialId(result.id)).toBe(true);
      expect(result.label).toBe('test');
      expect(result.status).toBe('active');
    });

    test('should apply default int literal when omitted', async () => {
      const result = await client.db.LiteralDefaults.create({
        data: { label: 'test' },
      });

      expect(result.priority).toBe(1);
    });

    test('should apply both defaults when both omitted', async () => {
      const result = await client.db.LiteralDefaults.create({
        data: { label: 'both' },
      });

      expect(result.status).toBe('active');
      expect(result.priority).toBe(1);
    });

    test('should override default string literal when provided', async () => {
      const result = await client.db.LiteralDefaults.create({
        data: { label: 'override', status: 'pending' },
      });

      expect(result.status).toBe('pending');
    });

    test('should override default int literal when provided', async () => {
      const result = await client.db.LiteralDefaults.create({
        data: { label: 'override', priority: 3 },
      });

      expect(result.priority).toBe(3);
    });

    test('should override both defaults when both provided', async () => {
      const result = await client.db.LiteralDefaults.create({
        data: { label: 'both-override', status: 'inactive', priority: 2 },
      });

      expect(result.status).toBe('inactive');
      expect(result.priority).toBe(2);
    });
  });

  describe('update with defaults', () => {
    test('should update a literal field that has a default', async () => {
      const created = await client.db.LiteralDefaults.create({
        data: { label: 'upd' },
      });

      expect(created.status).toBe('active');

      const updated = await client.db.LiteralDefaults.updateUnique({
        where: { id: created.id },
        data: { status: 'inactive' },
      });

      expect(updated!.status).toBe('inactive');
    });

    test('should preserve default value when updating other fields', async () => {
      const created = await client.db.LiteralDefaults.create({
        data: { label: 'preserve' },
      });

      const updated = await client.db.LiteralDefaults.updateUnique({
        where: { id: created.id },
        data: { label: 'changed' },
      });

      expect(updated!.label).toBe('changed');
      expect(updated!.status).toBe('active');
      expect(updated!.priority).toBe(1);
    });
  });

  describe('findMany with defaults', () => {
    test('should filter by default literal value', async () => {
      await client.db.LiteralDefaults.create({ data: { label: 'a' } });
      await client.db.LiteralDefaults.create({ data: { label: 'b', status: 'inactive' } });
      await client.db.LiteralDefaults.create({ data: { label: 'c' } });

      const activeResults = await client.db.LiteralDefaults.findMany({
        where: { status: 'active' },
      });

      expect(activeResults.length).toBe(2);
      expect(activeResults.every((r) => r.status === 'active')).toBe(true);
    });
  });

  describe('upsert with defaults', () => {
    test('should use default value on create path', async () => {
      const result = await client.db.LiteralDefaults.upsert({
        where: { id: 'literal_defaults:upsert-test-1' },
        create: { label: 'upserted' },
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
      expect(result!.priority).toBe(1);
    });

    test('should update literal on update path', async () => {
      const created = await client.db.LiteralDefaults.create({
        data: { label: 'upsert-upd' },
      });

      const result = await client.db.LiteralDefaults.upsert({
        where: { id: created.id },
        create: { label: 'should-not-use' },
        update: { status: 'pending' },
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('pending');
    });
  });
});
