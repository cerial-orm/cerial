/**
 * E2E Tests: Self-Referential Tree - Recursive Include
 *
 * Schema: self-ref-tree.cerial
 * Tests nested includes through tree structure.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../../test-helper';

describe('E2E Self-Ref Tree: Recursive Include', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefTree);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefTree);
  });

  describe('nested children include', () => {
    test('should include children of children', async () => {
      const root = await client.db.CategoryTree.create({
        data: { name: 'Root' },
      });

      const level1 = await client.db.CategoryTree.create({
        data: { name: 'Level 1', parent: { connect: root.id } },
      });

      await client.db.CategoryTree.create({
        data: { name: 'Level 2', parent: { connect: level1.id } },
      });

      const result = await client.db.CategoryTree.findOne({
        where: { id: root.id },
        include: {
          children: {
            include: { children: true },
          },
        },
      });

      expect(result?.children?.[0]?.name).toBe('Level 1');
      expect(result?.children?.[0]?.children?.[0]?.name).toBe('Level 2');
    });
  });

  describe('nested parent include', () => {
    test('should include parent of parent', async () => {
      const root = await client.db.CategoryTree.create({
        data: { name: 'Root' },
      });

      const level1 = await client.db.CategoryTree.create({
        data: { name: 'Level 1', parent: { connect: root.id } },
      });

      const level2 = await client.db.CategoryTree.create({
        data: { name: 'Level 2', parent: { connect: level1.id } },
      });

      const result = await client.db.CategoryTree.findOne({
        where: { id: level2.id },
        include: {
          parent: {
            include: { parent: true },
          },
        },
      });

      expect(result?.parent?.name).toBe('Level 1');
      expect(result?.parent?.parent?.name).toBe('Root');
      // Third level not included in query, so undefined (not fetched)
      // @ts-expect-error - Type inference doesn't fully resolve deeply nested includes, testing runtime behavior
      expect(result?.parent?.parent?.parent).toBeUndefined();
    });
  });

  describe('deep tree query', () => {
    test('should handle 3+ level include', async () => {
      // Create 4-level tree
      const l0 = await client.db.CategoryTree.create({
        data: { name: 'L0' },
      });
      const l1 = await client.db.CategoryTree.create({
        data: { name: 'L1', parent: { connect: l0.id } },
      });
      const l2 = await client.db.CategoryTree.create({
        data: { name: 'L2', parent: { connect: l1.id } },
      });
      await client.db.CategoryTree.create({
        data: { name: 'L3', parent: { connect: l2.id } },
      });

      // Query from root with 3 levels of children
      const result = await client.db.CategoryTree.findOne({
        where: { id: l0.id },
        include: {
          children: {
            include: {
              children: {
                include: { children: true },
              },
            },
          },
        },
      });

      expect(result?.children?.[0]?.children?.[0]?.children?.[0]?.name).toBe('L3');
    });
  });

  describe('mixed direction includes', () => {
    test('should include both up and down from middle node', async () => {
      const root = await client.db.CategoryTree.create({
        data: { name: 'Root' },
      });

      const middle = await client.db.CategoryTree.create({
        data: { name: 'Middle', parent: { connect: root.id } },
      });

      await client.db.CategoryTree.create({
        data: { name: 'Leaf', parent: { connect: middle.id } },
      });

      const result = await client.db.CategoryTree.findOne({
        where: { id: middle.id },
        include: {
          parent: true,
          children: true,
        },
      });

      expect(result?.parent?.name).toBe('Root');
      expect(result?.children?.[0]?.name).toBe('Leaf');
    });
  });
});
