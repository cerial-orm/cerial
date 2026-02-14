/**
 * E2E Tests: Many-to-Many One-Directional - Create
 *
 * Schema: many-to-one-directional.cerial
 * - Blogger: id, name, labelIds (Record[]), labels (Relation[] @field)
 * - Label: id, name (NO bloggerIds - one-directional)
 *
 * Tests one-directional array relation - no bidirectional sync.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Many-to-Many One-Directional: Create', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.manyToOneDirectional);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.manyToOneDirectional);
  });

  describe('create blogger with labels', () => {
    test('should create blogger connecting to labels', async () => {
      const label1 = await client.db.Label.create({
        data: { name: 'Tech' },
      });
      const label2 = await client.db.Label.create({
        data: { name: 'Travel' },
      });

      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: { connect: [label1.id, label2.id] },
        },
      });

      expect(blogger.labelIds.some((id) => id.equals(label1.id))).toBe(true);
      expect(blogger.labelIds.some((id) => id.equals(label2.id))).toBe(true);

      // Labels should NOT have blogger reference (one-directional)
      const l1 = await client.db.Label.findOne({ where: { id: label1.id } });
      expect((l1 as any).bloggerIds).toBeUndefined();
    });

    test('should create blogger with nested label creates', async () => {
      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: {
            create: [{ name: 'Food' }, { name: 'Lifestyle' }],
          },
        },
      });

      expect(blogger.labelIds).toHaveLength(2);

      // Verify labels created
      const labels = await client.db.Label.findMany({});
      expect(labels).toHaveLength(2);
    });

    test('should create blogger without labels', async () => {
      const blogger = await client.db.Blogger.create({
        data: { name: 'No Labels' },
      });

      expect(blogger.labelIds).toEqual([]);
    });
  });

  describe('create label (no blogger reference)', () => {
    test('should create label without any blogger reference', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Standalone' },
      });

      expect(label).toBeDefined();
      expect(label.name).toBe('Standalone');
      // Label has no blogger-related fields
      expect((label as any).bloggers).toBeUndefined();
      expect((label as any).bloggerIds).toBeUndefined();
    });
  });

  describe('no sync behavior', () => {
    test('creating blogger should not update labels', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: { connect: [label.id] },
        },
      });

      // Label should be unchanged (no bloggerIds field)
      const labelAfter = await client.db.Label.findOne({
        where: { id: label.id },
      });

      // Only id and name
      expect(Object.keys(labelAfter!).sort()).toEqual(['id', 'name'].sort());
    });
  });
});
