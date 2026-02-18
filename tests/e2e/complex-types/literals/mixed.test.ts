/**
 * E2E Tests: Literal Mixed Types
 *
 * Tests literals with mixed variant kinds (string + int + bool).
 * Covers: creating with each variant kind, round-trip value preservation.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Literals: Mixed Types', () => {
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

  describe('create with each variant', () => {
    test('should create and read back string variant (low)', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      const found = await client.db.LiteralBasic.findUnique({ where: { id: result.id } });

      expect(found!.mixed).toBe('low');
    });

    test('should create and read back string variant (high)', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 1, mixed: 'high' },
      });
      const found = await client.db.LiteralBasic.findUnique({ where: { id: result.id } });

      expect(found!.mixed).toBe('high');
    });

    test('should create and read back int variant (1)', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 1, mixed: 1 },
      });
      const found = await client.db.LiteralBasic.findUnique({ where: { id: result.id } });

      expect(found!.mixed).toBe(1);
    });

    test('should create and read back int variant (2)', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'D', status: 'active', priority: 1, mixed: 2 },
      });
      const found = await client.db.LiteralBasic.findUnique({ where: { id: result.id } });

      expect(found!.mixed).toBe(2);
    });

    test('should create and read back bool variant (true)', async () => {
      const result = await client.db.LiteralBasic.create({
        data: { name: 'E', status: 'active', priority: 1, mixed: true },
      });
      const found = await client.db.LiteralBasic.findUnique({ where: { id: result.id } });

      expect(found!.mixed).toBe(true);
    });
  });

  describe('update between variant kinds', () => {
    test('should cycle through all variant kinds', async () => {
      const created = await client.db.LiteralBasic.create({
        data: { name: 'Cycle', status: 'active', priority: 1, mixed: 'low' },
      });

      // string -> int
      const u1 = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { mixed: 1 },
      });
      expect(u1!.mixed).toBe(1);

      // int -> bool
      const u2 = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { mixed: true },
      });
      expect(u2!.mixed).toBe(true);

      // bool -> string
      const u3 = await client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { mixed: 'high' },
      });
      expect(u3!.mixed).toBe('high');
    });
  });

  describe('filter mixed literal', () => {
    beforeEach(async () => {
      await client.db.LiteralBasic.create({
        data: { name: 'A', status: 'active', priority: 1, mixed: 'low' },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'B', status: 'active', priority: 1, mixed: 2 },
      });
      await client.db.LiteralBasic.create({
        data: { name: 'C', status: 'active', priority: 1, mixed: true },
      });
    });

    test('should filter mixed literal by string value', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { mixed: 'low' },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('A');
    });

    test('should filter mixed literal by int value', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { mixed: 2 },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('B');
    });

    test('should filter mixed literal by bool value', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { mixed: true },
      });

      expect(results.length).toBe(1);
      expect(results[0]).toBeDefined();
      expect(results[0]!.name).toBe('C');
    });

    test('should filter mixed literal by in with mixed types', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { mixed: { in: ['low', true] } },
      });

      expect(results.length).toBe(2);
    });

    test('should filter mixed literal by neq', async () => {
      const results = await client.db.LiteralBasic.findMany({
        where: { mixed: { neq: 'low' } },
      });

      expect(results.length).toBe(2);
    });
  });
});
