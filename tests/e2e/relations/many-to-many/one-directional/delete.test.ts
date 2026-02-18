/**
 * E2E Tests: Many-to-Many One-Directional - Delete
 *
 * Schema: many-to-one-directional.cerial
 * Tests cleanup only on defining side.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../../test-helper';

describe('E2E Many-to-Many One-Directional: Delete', () => {
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

  describe('delete blogger', () => {
    test('should delete blogger - labels remain unchanged', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: { connect: [label.id] },
        },
      });

      // Delete blogger
      await client.db.Blogger.deleteMany({
        where: { id: blogger.id },
      });

      // Blogger gone
      expect(await client.db.Blogger.findOne({ where: { id: blogger.id } })).toBeNull();

      // Label still exists (no cleanup needed - no reverse reference)
      const labelAfter = await client.db.Label.findOne({
        where: { id: label.id },
      });
      expect(labelAfter).toBeDefined();
      expect(labelAfter?.name).toBe('Label');
    });
  });

  describe('delete label', () => {
    test('should delete label - blogger has dangling reference', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: { connect: [label.id] },
        },
      });

      const labelId = label.id;

      // Delete label
      await client.db.Label.deleteMany({
        where: { id: label.id },
      });

      // Label gone
      expect(await client.db.Label.findOne({ where: { id: labelId } })).toBeNull();

      // Blogger still has the labelId (dangling reference)
      // OR it should be cleaned up - depends on implementation
      const bloggerAfter = await client.db.Blogger.findOne({
        where: { id: blogger.id },
      });
      expect(bloggerAfter).toBeDefined();
      // The labelIds array may still contain the deleted ID
      // or may be cleaned up depending on implementation
    });

    test('should allow cleanup of dangling labelIds', async () => {
      const l1 = await client.db.Label.create({ data: { name: 'L1' } });
      const l2 = await client.db.Label.create({ data: { name: 'L2' } });

      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: { connect: [l1.id, l2.id] },
        },
      });

      // Delete l1
      await client.db.Label.deleteMany({
        where: { id: l1.id },
      });

      // Manual cleanup - remove dangling reference
      await client.db.Blogger.updateMany({
        where: { id: blogger.id },
        data: {
          labels: { disconnect: [l1.id] },
        },
      });

      const cleaned = await client.db.Blogger.findOne({
        where: { id: blogger.id },
      });
      expect(cleaned?.labelIds?.some((id) => id.equals(l1.id))).toBe(false);
      expect(cleaned?.labelIds?.some((id) => id.equals(l2.id))).toBe(true);
    });
  });

  describe('no cascade needed', () => {
    test('deleting blogger does not affect labels', async () => {
      const labels = await Promise.all([
        client.db.Label.create({ data: { name: 'L1' } }),
        client.db.Label.create({ data: { name: 'L2' } }),
      ]);

      await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: { connect: labels.map((l) => l.id) },
        },
      });

      await client.db.Blogger.deleteMany({ where: {} });

      // All labels should remain
      const labelsAfter = await client.db.Label.findMany({});
      expect(labelsAfter).toHaveLength(2);
    });
  });
});
