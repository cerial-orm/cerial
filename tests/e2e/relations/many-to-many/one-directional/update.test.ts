/**
 * E2E Tests: Many-to-Many One-Directional - Update
 *
 * Schema: many-to-one-directional.cerial
 * Tests modifying array on one side only.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Many-to-Many One-Directional: Update', () => {
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

  describe('connect labels', () => {
    test('should add labels to blogger', async () => {
      const blogger = await client.db.Blogger.create({
        data: { name: 'Blogger' },
      });
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      const updated = await client.db.Blogger.updateMany({
        where: { id: blogger.id },
        data: {
          labels: { connect: [label.id] },
        },
      });

      expect(updated[0]?.labelIds?.some((id) => id.equals(label.id))).toBe(true);
    });

    test('should add multiple labels', async () => {
      const blogger = await client.db.Blogger.create({
        data: { name: 'Blogger' },
      });
      const l1 = await client.db.Label.create({ data: { name: 'L1' } });
      const l2 = await client.db.Label.create({ data: { name: 'L2' } });
      const l3 = await client.db.Label.create({ data: { name: 'L3' } });

      await client.db.Blogger.updateMany({
        where: { id: blogger.id },
        data: {
          labels: { connect: [l1.id, l2.id, l3.id] },
        },
      });

      const updated = await client.db.Blogger.findOne({
        where: { id: blogger.id },
      });
      expect(updated?.labelIds).toHaveLength(3);
    });
  });

  describe('disconnect labels', () => {
    test('should remove labels from blogger', async () => {
      const l1 = await client.db.Label.create({ data: { name: 'L1' } });
      const l2 = await client.db.Label.create({ data: { name: 'L2' } });

      const blogger = await client.db.Blogger.create({
        data: {
          name: 'Blogger',
          labels: { connect: [l1.id, l2.id] },
        },
      });

      // Disconnect l1
      await client.db.Blogger.updateMany({
        where: { id: blogger.id },
        data: {
          labels: { disconnect: [l1.id] },
        },
      });

      const updated = await client.db.Blogger.findOne({
        where: { id: blogger.id },
      });
      expect(updated?.labelIds?.some((id) => id.equals(l1.id))).toBe(false);
      expect(updated?.labelIds?.some((id) => id.equals(l2.id))).toBe(true);
    });
  });

  describe('no reverse operations', () => {
    test('cannot update blogger labels from label side', async () => {
      // Label has no bloggers field, so no update possible
      const label = await client.db.Label.create({
        data: { name: 'Label' },
      });

      // Can only update name
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
