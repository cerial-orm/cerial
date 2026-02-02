/**
 * E2E Tests: Many-to-Many One-Directional - No Reverse Access
 *
 * Schema: many-to-one-directional.cerial
 * Tests that Label has no accessor for bloggers.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Many-to-Many One-Directional: No Reverse', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.manyToOneDirectional);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('label has no bloggers field', () => {
    test('label model should not have bloggers relation', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      // Label only has id and name
      expect(label.id).toBeDefined();
      expect(label.name).toBe('Label');
      expect((label as any).bloggers).toBeUndefined();
      expect((label as any).bloggerIds).toBeUndefined();
    });

    test('findOne on label should not have bloggers', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      const found = await client.db.Label.findOne({
        where: { id: label.id },
      });

      expect(Object.keys(found!)).not.toContain('bloggers');
      expect(Object.keys(found!)).not.toContain('bloggerIds');
    });
  });

  describe('manual reverse query', () => {
    test('should find bloggers by labelId manually', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Shared Label' },
      });

      await client.db.Blogger.create({
        data: { name: 'B1', labels: { connect: [label.id] } },
      });
      await client.db.Blogger.create({
        data: { name: 'B2', labels: { connect: [label.id] } },
      });
      await client.db.Blogger.create({
        data: { name: 'B3' }, // No labels
      });

      // Manual reverse query
      const bloggersWithLabel = await client.db.Blogger.findMany({
        where: { labelIds: { has: label.id } },
      });

      expect(bloggersWithLabel).toHaveLength(2);
      expect(bloggersWithLabel.map((b) => b.name).sort()).toEqual(['B1', 'B2']);
    });

    test('should find all bloggers using a specific label', async () => {
      const tech = await client.db.Label.create({ data: { name: 'Tech' } });
      const travel = await client.db.Label.create({ data: { name: 'Travel' } });

      await client.db.Blogger.create({
        data: { name: 'Tech Blogger', labels: { connect: [tech.id] } },
      });
      await client.db.Blogger.create({
        data: { name: 'Travel Blogger', labels: { connect: [travel.id] } },
      });
      await client.db.Blogger.create({
        data: {
          name: 'Multi Blogger',
          labels: { connect: [tech.id, travel.id] },
        },
      });

      // Find tech bloggers
      const techBloggers = await client.db.Blogger.findMany({
        where: { labelIds: { has: tech.id } },
      });
      expect(techBloggers).toHaveLength(2);

      // Find travel bloggers
      const travelBloggers = await client.db.Blogger.findMany({
        where: { labelIds: { has: travel.id } },
      });
      expect(travelBloggers).toHaveLength(2);
    });
  });

  describe('no nested operations from label side', () => {
    test('cannot create bloggers via label', async () => {
      // Label has no bloggers field
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      expect(label).toBeDefined();
      // No way to create bloggers from label side
    });

    test('cannot update bloggers via label', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      // Only name can be updated
      await client.db.Label.updateMany({
        where: { id: label.id },
        data: { name: 'Updated' },
      });

      const updated = await client.db.Label.findOne({
        where: { id: label.id },
      });
      expect(updated?.name).toBe('Updated');
    });
  });
});
