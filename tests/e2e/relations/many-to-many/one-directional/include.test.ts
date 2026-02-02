/**
 * E2E Tests: Many-to-Many One-Directional - Include
 *
 * Schema: many-to-one-directional.cerial
 * Tests that only defining side can include.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Many-to-Many One-Directional: Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.manyToOneDirectional);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include from blogger side', () => {
    test('should include labels when querying blogger', async () => {
      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: {
            create: [{ name: 'Tech' }, { name: 'Travel' }],
          },
        },
      });

      const result = await client.db.Blogger.findOne({
        where: { id: blogger.id },
        include: { labels: true },
      });

      expect(result?.labels).toHaveLength(2);
      expect(result?.labels?.map((l) => l.name).sort()).toEqual([
        'Tech',
        'Travel',
      ]);
    });

    test('should return empty array when blogger has no labels', async () => {
      const blogger = await client.db.Blogger.create({
        data: { name: 'No Labels' },
      });

      const result = await client.db.Blogger.findOne({
        where: { id: blogger.id },
        include: { labels: true },
      });

      expect(result?.labels).toEqual([]);
    });
  });

  describe('no include from label side', () => {
    test('label has no bloggers relation to include', async () => {
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      // Query label - no bloggers field available
      const result = await client.db.Label.findOne({
        where: { id: label.id },
        // include: { bloggers: true }  // Would be type error
      });

      expect(result).toBeDefined();
      expect((result as any).bloggers).toBeUndefined();
    });
  });

  describe('include with ordering', () => {
    test('should order included labels', async () => {
      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: {
            create: [{ name: 'Zebra' }, { name: 'Alpha' }, { name: 'Middle' }],
          },
        },
      });

      const result = await client.db.Blogger.findOne({
        where: { id: blogger.id },
        include: {
          labels: {
            orderBy: { name: 'asc' },
          },
        },
      });

      expect(result?.labels?.map((l) => l.name)).toEqual([
        'Alpha',
        'Middle',
        'Zebra',
      ]);
    });
  });

  describe('include in findMany', () => {
    test('should include labels for multiple bloggers', async () => {
      await client.db.Blogger.create({
        data: {
          name: 'B1',
          labels: { create: [{ name: 'L1' }] },
        },
      });
      await client.db.Blogger.create({
        data: {
          name: 'B2',
          labels: { create: [{ name: 'L2' }, { name: 'L3' }] },
        },
      });

      const bloggers = await client.db.Blogger.findMany({
        include: { labels: true },
        orderBy: { name: 'asc' },
      });

      expect(bloggers[0]?.labels).toHaveLength(1);
      expect(bloggers[1]?.labels).toHaveLength(2);
    });
  });
});
