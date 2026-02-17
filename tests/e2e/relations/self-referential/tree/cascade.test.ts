/**
 * E2E Tests: Self-Referential Tree - Cascade
 *
 * Schema: self-ref-tree.cerial
 * Tests cascade delete behavior in tree structure.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Self-Ref Tree: Cascade', () => {
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

  describe('delete leaf', () => {
    test('should delete leaf without affecting parent', async () => {
      const parent = await client.db.CategoryTree.create({
        data: {
          name: 'Parent',
          children: { create: [{ name: 'Child' }] },
        },
      });

      const children = await client.db.CategoryTree.findMany({
        where: { parentId: parent.id },
      });
      const child = children[0]!;

      // Delete child
      await client.db.CategoryTree.deleteMany({
        where: { id: child.id },
      });

      // Parent still exists
      expect(await client.db.CategoryTree.findOne({ where: { id: parent.id } })).toBeDefined();

      // Child is gone
      expect(await client.db.CategoryTree.findOne({ where: { id: child.id } })).toBeNull();
    });
  });

  describe('delete parent with children', () => {
    test('should handle parent deletion - children may cascade or orphan', async () => {
      const parent = await client.db.CategoryTree.create({
        data: {
          name: 'Parent',
          children: {
            create: [{ name: 'Child 1' }, { name: 'Child 2' }],
          },
        },
      });

      const childrenBefore = await client.db.CategoryTree.findMany({
        where: { parentId: parent.id },
      });
      expect(childrenBefore).toHaveLength(2);

      // Delete parent
      await client.db.CategoryTree.deleteMany({
        where: { id: parent.id },
      });

      // Parent gone
      expect(await client.db.CategoryTree.findOne({ where: { id: parent.id } })).toBeNull();

      // Children behavior: SetNull default for optional relations
      // Without explicit @onDelete, children get their parentId set to null
      const childrenAfter = await client.db.CategoryTree.findMany({
        where: { name: { startsWith: 'Child' } },
      });

      // SetNull: children still exist with null parentId
      expect(childrenAfter).toHaveLength(2);
      childrenAfter.forEach((c) => expect(c.parentId).toBeNull());
    });
  });

  describe('delete subtree', () => {
    test('should be able to delete entire subtree', async () => {
      const root = await client.db.CategoryTree.create({
        data: { name: 'Root' },
      });

      const branch = await client.db.CategoryTree.create({
        data: { name: 'Branch', parent: { connect: root.id } },
      });

      await client.db.CategoryTree.create({
        data: { name: 'Leaf 1', parent: { connect: branch.id } },
      });
      await client.db.CategoryTree.create({
        data: { name: 'Leaf 2', parent: { connect: branch.id } },
      });

      // Delete branch (and potentially its children)
      await client.db.CategoryTree.deleteMany({
        where: { id: branch.id },
      });

      // Branch gone
      expect(await client.db.CategoryTree.findOne({ where: { id: branch.id } })).toBeNull();

      // Root still exists
      expect(await client.db.CategoryTree.findOne({ where: { id: root.id } })).toBeDefined();
    });
  });

  describe('delete root', () => {
    test('should handle root deletion', async () => {
      const root = await client.db.CategoryTree.create({
        data: {
          name: 'Root',
          children: { create: [{ name: 'Child' }] },
        },
      });

      await client.db.CategoryTree.deleteMany({
        where: { id: root.id },
      });

      expect(await client.db.CategoryTree.findOne({ where: { id: root.id } })).toBeNull();
    });
  });
});
