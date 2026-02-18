/**
 * E2E Tests: Self-Referential Tree - Create
 *
 * Schema: self-ref-tree.cerial
 * - CategoryTree: id, name, parentId (Record?), parent (Relation? @field @key),
 *                 children (Relation[] @key)
 *
 * Tests tree structure with parent-children relationship.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../../test-helper';

describe('E2E Self-Ref Tree: Create', () => {
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

  describe('create root category', () => {
    test('should create category without parent (root)', async () => {
      const root = await client.db.CategoryTree.create({
        data: { name: 'Root' },
      });

      expect(root.parentId).toBeNull();
    });
  });

  describe('create with parent', () => {
    test('should create child category with parent connect', async () => {
      const parent = await client.db.CategoryTree.create({
        data: { name: 'Parent' },
      });

      const child = await client.db.CategoryTree.create({
        data: {
          name: 'Child',
          parent: { connect: parent.id },
        },
      });

      expect(child.parentId?.equals(parent.id)).toBe(true);
    });

    test('should create child with nested parent create', async () => {
      const child = await client.db.CategoryTree.create({
        data: {
          name: 'Child',
          parent: {
            create: { name: 'New Parent' },
          },
        },
      });

      expect(child.parentId).toBeDefined();

      const parent = await client.db.CategoryTree.findOne({
        where: { id: child.parentId! },
      });
      expect(parent?.name).toBe('New Parent');
    });
  });

  describe('create with children', () => {
    test('should create parent with nested children', async () => {
      const parent = await client.db.CategoryTree.create({
        data: {
          name: 'Parent',
          children: {
            create: [{ name: 'Child 1' }, { name: 'Child 2' }],
          },
        },
      });

      expect(parent).toBeDefined();

      // Verify children were created
      const children = await client.db.CategoryTree.findMany({
        where: { parentId: parent.id },
      });

      expect(children).toHaveLength(2);
    });
  });

  describe('create tree structure', () => {
    test('should create multi-level tree', async () => {
      const root = await client.db.CategoryTree.create({
        data: { name: 'Root' },
      });

      const level1 = await client.db.CategoryTree.create({
        data: { name: 'Level 1', parent: { connect: root.id } },
      });

      const level2 = await client.db.CategoryTree.create({
        data: { name: 'Level 2', parent: { connect: level1.id } },
      });

      expect(level2.parentId?.equals(level1.id)).toBe(true);
      expect(level1.parentId?.equals(root.id)).toBe(true);
      expect(root.parentId).toBeNull();
    });
  });
});
