/**
 * E2E Tests: Self-Referential Tree - Parent/Children Navigation
 *
 * Schema: self-ref-tree.cerial
 * Tests navigating parent and children relationships.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref Tree: Parent/Children', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefTree);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include parent', () => {
    test('should include parent when querying child', async () => {
      const parent = await client.db.CategoryTree.create({
        data: { name: 'Parent' },
      });

      const child = await client.db.CategoryTree.create({
        data: { name: 'Child', parent: { connect: parent.id } },
      });

      const result = await client.db.CategoryTree.findOne({
        where: { id: child.id },
        include: { parent: true },
      });

      expect(result?.parent?.name).toBe('Parent');
    });
  });

  describe('include children', () => {
    test('should include children when querying parent', async () => {
      const parent = await client.db.CategoryTree.create({
        data: {
          name: 'Parent',
          children: {
            create: [{ name: 'Child 1' }, { name: 'Child 2' }],
          },
        },
      });

      const result = await client.db.CategoryTree.findOne({
        where: { id: parent.id },
        include: { children: true },
      });

      expect(result?.children).toHaveLength(2);
      expect(result?.children?.map((c) => c.name).sort()).toEqual([
        'Child 1',
        'Child 2',
      ]);
    });

    test('should return empty children for leaf node', async () => {
      const leaf = await client.db.CategoryTree.create({
        data: { name: 'Leaf' },
      });

      const result = await client.db.CategoryTree.findOne({
        where: { id: leaf.id },
        include: { children: true },
      });

      expect(result?.children).toEqual([]);
    });
  });

  describe('include both directions', () => {
    test('should include both parent and children', async () => {
      const root = await client.db.CategoryTree.create({
        data: { name: 'Root' },
      });

      const middle = await client.db.CategoryTree.create({
        data: { name: 'Middle', parent: { connect: root.id } },
      });

      await client.db.CategoryTree.create({
        data: { name: 'Leaf', parent: { connect: middle.id } },
      });

      // Middle has parent (root) and children (leaf)
      const result = await client.db.CategoryTree.findOne({
        where: { id: middle.id },
        include: { parent: true, children: true },
      });

      expect(result?.parent?.name).toBe('Root');
      expect(result?.children).toHaveLength(1);
      expect(result?.children?.[0]?.name).toBe('Leaf');
    });
  });

  describe('find root categories', () => {
    test('should find all root categories', async () => {
      const root1 = await client.db.CategoryTree.create({
        data: { name: 'Root 1' },
      });
      const root2 = await client.db.CategoryTree.create({
        data: { name: 'Root 2' },
      });

      await client.db.CategoryTree.create({
        data: { name: 'Child', parent: { connect: root1.id } },
      });

      const roots = await client.db.CategoryTree.findMany({
        where: { parentId: null },
      });

      expect(roots).toHaveLength(2);
      expect(roots.map((r) => r.name).sort()).toEqual(['Root 1', 'Root 2']);
    });
  });

  describe('find leaf categories', () => {
    test('should find categories with no children', async () => {
      const parent = await client.db.CategoryTree.create({
        data: { name: 'Parent' },
      });

      const child1 = await client.db.CategoryTree.create({
        data: { name: 'Child 1', parent: { connect: parent.id } },
      });
      await client.db.CategoryTree.create({
        data: { name: 'Grandchild', parent: { connect: child1.id } },
      });
      await client.db.CategoryTree.create({
        data: { name: 'Child 2', parent: { connect: parent.id } },
      });

      // Manual leaf detection - categories that have no children
      const all = await client.db.CategoryTree.findMany({});
      const parentIds = new Set(
        all.filter((c) => c.parentId).map((c) => c.parentId)
      );
      const leaves = all.filter((c) => !parentIds.has(c.id));

      expect(leaves.map((l) => l.name).sort()).toEqual([
        'Child 2',
        'Grandchild',
      ]);
    });
  });
});
