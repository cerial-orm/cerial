/**
 * E2E Tests: Literal Optional & Nullable
 *
 * Tests optional literal (Status?) and nullable literal (Status? @nullable) fields.
 * Covers: NONE vs null semantics, unset, CerialNone on update.
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
import { NONE } from 'cerial';

describe('E2E Literals: Optional & Nullable', () => {
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

  describe('optional literal (optStatus)', () => {
    test('should create with optional omitted -> undefined', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });

      expect(result.optStatus).toBeUndefined();
    });

    test('should create with optional provided', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 1, mixed: 'low', optStatus: 'pending' },
      });

      expect(result.optStatus).toBe('pending');
    });

    test('should update optional to a value', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 1, mixed: 'low' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { optStatus: 'inactive' },
      });

      expect(updated!.optStatus).toBe('inactive');
    });

    test('should clear optional with NONE', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'D', status: 'active', priority: 1, mixed: 'low', optStatus: 'active' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { optStatus: NONE },
      });

      expect(updated!.optStatus).toBeUndefined();
    });

    test('should unset optional literal', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'E', status: 'active', priority: 1, mixed: 'low', optStatus: 'pending' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: {},
        unset: { optStatus: true },
      });

      expect(updated!.optStatus).toBeUndefined();
    });
  });

  describe('nullable literal (nullStatus)', () => {
    test('should create with nullable omitted -> undefined (NONE)', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });

      expect(result.nullStatus).toBeUndefined();
    });

    test('should create with nullable as null', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 1, mixed: 'low', nullStatus: null },
      });

      expect(result.nullStatus).toBeNull();
    });

    test('should create with nullable as value', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 1, mixed: 'low', nullStatus: 'pending' },
      });

      expect(result.nullStatus).toBe('pending');
    });

    test('should update nullable to null', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'D', status: 'active', priority: 1, mixed: 'low', nullStatus: 'active' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { nullStatus: null },
      });

      expect(updated!.nullStatus).toBeNull();
    });

    test('should update nullable from null to value', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'E', status: 'active', priority: 1, mixed: 'low', nullStatus: null },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { nullStatus: 'inactive' },
      });

      expect(updated!.nullStatus).toBe('inactive');
    });

    test('should clear nullable with NONE (back to undefined)', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'F', status: 'active', priority: 1, mixed: 'low', nullStatus: 'active' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { nullStatus: NONE },
      });

      expect(updated!.nullStatus).toBeUndefined();
    });

    test('should unset nullable literal', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'G', status: 'active', priority: 1, mixed: 'low', nullStatus: 'pending' },
      });

      const updated = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: {},
        unset: { nullStatus: true },
      });

      expect(updated!.nullStatus).toBeUndefined();
    });
  });

  describe('optional numeric literal (optRank on LiteralNumeric)', () => {
    test('should create with optional numeric omitted', async () => {
      const result = await client.db.LiteralNumeric.create({
        data: { rank: 1 },
      });

      expect(result.optRank).toBeUndefined();
    });

    test('should create with optional numeric provided', async () => {
      const result = await client.db.LiteralNumeric.create({
        data: { rank: 1, optRank: 5 },
      });

      expect(result.optRank).toBe(5);
    });

    test('should update optional numeric to a value', async () => {
      const created = await client.db.LiteralNumeric.create({
        data: { rank: 1 },
      });

      const updated = await client.db.LiteralNumeric.updateUnique({
        where: { id: created.id },
        data: { optRank: 3 },
      });

      expect(updated!.optRank).toBe(3);
    });

    test('should clear optional numeric with NONE', async () => {
      const created = await client.db.LiteralNumeric.create({
        data: { rank: 1, optRank: 5 },
      });

      const updated = await client.db.LiteralNumeric.updateUnique({
        where: { id: created.id },
        data: { optRank: NONE },
      });

      expect(updated!.optRank).toBeUndefined();
    });
  });
});
