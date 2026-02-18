/**
 * E2E: Unset — Self-Referencing Types
 *
 * Tests unsetting fields on self-referencing objects and tuples:
 *   UnsetTreeNode { value String, extra String?, child UnsetTreeNode? }
 *   UnsetRecursive { label String, UnsetRecursive? }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  testConfig,
  tables,
} from '../test-helper';

const UNSET_TABLES = tables.unset;
const NESTED = { title: 'T', mid: { label: 'L', deep: { code: 'C' } } };

describe('Unset: Self-Referencing Types', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, UNSET_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, UNSET_TABLES);
  });

  // ─── Self-referencing object (UnsetTreeNode) ──────────────────────────────

  describe('self-referencing object', () => {
    test('unsets entire optional tree (tree: true)', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'SR1',
          address: { street: 'A', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          tree: { value: 'root', extra: 'note', child: { value: 'leaf' } },
        },
      });
      expect(record.tree).toBeDefined();

      const updated = await client.db.UnsetTest.updateUnique({
        where: { id: record.id },
        data: {},
        unset: { tree: true },
      });

      expect(updated!.tree).toBeUndefined();
    });

    test('unsets optional sub-field of self-referencing object (tree.extra)', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'SR2',
          address: { street: 'B', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          tree: { value: 'root', extra: 'to-remove' },
        },
      });

      const updated = await client.db.UnsetTest.updateUnique({
        where: { id: record.id },
        data: {},
        unset: { tree: { extra: true } },
      });

      expect(updated!.tree).toBeDefined();
      expect(updated!.tree!.value).toBe('root');
      expect(updated!.tree!.extra).toBeUndefined();
    });

    test('unsets optional child of self-referencing object (tree.child)', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'SR3',
          address: { street: 'C', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          tree: { value: 'root', child: { value: 'leaf', extra: 'child-note' } },
        },
      });

      const updated = await client.db.UnsetTest.updateUnique({
        where: { id: record.id },
        data: {},
        unset: { tree: { child: true } },
      });

      expect(updated!.tree).toBeDefined();
      expect(updated!.tree!.value).toBe('root');
      expect(updated!.tree!.child).toBeUndefined();
    });

    test('unsets both extra and child at once', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'SR4',
          address: { street: 'D', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          tree: { value: 'root', extra: 'note', child: { value: 'leaf' } },
        },
      });

      const updated = await client.db.UnsetTest.updateUnique({
        where: { id: record.id },
        data: {},
        unset: { tree: { extra: true, child: true } },
      });

      expect(updated!.tree!.value).toBe('root');
      expect(updated!.tree!.extra).toBeUndefined();
      expect(updated!.tree!.child).toBeUndefined();
    });
  });

  // ─── Self-referencing tuple (UnsetRecursive) ──────────────────────────────

  describe('self-referencing tuple', () => {
    test('unsets entire optional recursive tuple (recursive: true)', async () => {
      // SurrealDB only supports single-level self-referencing tuples, so we use
      // ['outer', NONE] — the inner recursive element is absent at the first level.
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'SR5',
          address: { street: 'E', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          recursive: ['outer', null],
        },
      });

      const updated = await client.db.UnsetTest.updateUnique({
        where: { id: record.id },
        data: {},
        unset: { recursive: true },
      });

      expect(updated!.recursive).toBeUndefined();
    });

    test('unsets optional nested element of recursive tuple (recursive[1])', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'SR6',
          address: { street: 'F', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          recursive: ['outer', null],
        },
      });

      const updated = await client.db.UnsetTest.updateUnique({
        where: { id: record.id },
        data: {},
        unset: { recursive: { 1: true } },
      });

      expect(updated!.recursive).toBeDefined();
      expect(updated!.recursive![0]).toBe('outer');
      expect(updated!.recursive![1]).toBeNull();
    });
  });
});
