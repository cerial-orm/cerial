/**
 * E2E Tests: Self-Referential One-to-One with Reverse - No Auto Sync
 *
 * Schema: self-ref-one-to-one-with-reverse.cerial
 * Tests that setting assists doesn't auto-set assistedBy.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-One with Reverse: No Auto Sync', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToOneWithReverse);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefOneToOneWithReverse);
  });

  describe('no auto-sync behavior', () => {
    test('setting assists should not modify the target record', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      await client.db.Assistant.create({
        data: { name: 'Assistant', assists: { connect: boss.id } },
      });

      // Boss record itself should be unchanged
      const bossRecord = await client.db.Assistant.findOne({
        where: { id: boss.id },
      });

      // Boss has no assistsId (they don't assist anyone)
      expect(bossRecord?.assistsId).toBeNull();

      // assistedBy is a virtual lookup, not a stored field
      // The record itself doesn't have an "assistedById" field
    });

    test('assistedBy is computed, not stored', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      // Initially, boss has no assistant
      const beforeResult = await client.db.Assistant.findOne({
        where: { id: boss.id },
        include: { assistedBy: true },
      });
      expect(beforeResult?.assistedBy).toBeNull();

      // Create assistant
      await client.db.Assistant.create({
        data: { name: 'Assistant', assists: { connect: boss.id } },
      });

      // Now boss has assistant (computed from reverse query)
      const afterResult = await client.db.Assistant.findOne({
        where: { id: boss.id },
        include: { assistedBy: true },
      });
      expect(afterResult?.assistedBy?.name).toBe('Assistant');
    });
  });

  describe('independent operations', () => {
    test('updating assists does not update assistedBy target', async () => {
      const boss1 = await client.db.Assistant.create({
        data: { name: 'Boss 1' },
      });
      const boss2 = await client.db.Assistant.create({
        data: { name: 'Boss 2' },
      });

      const assistant = await client.db.Assistant.create({
        data: { name: 'Assistant', assists: { connect: boss1.id } },
      });

      // Change who assistant assists
      await client.db.Assistant.updateMany({
        where: { id: assistant.id },
        data: { assists: { connect: boss2.id } },
      });

      // Boss1 and Boss2 records unchanged (except computed assistedBy)
      const boss1After = await client.db.Assistant.findOne({
        where: { id: boss1.id },
        include: { assistedBy: true },
      });
      expect(boss1After?.assistedBy).toBeNull();

      const boss2After = await client.db.Assistant.findOne({
        where: { id: boss2.id },
        include: { assistedBy: true },
      });
      expect(boss2After?.assistedBy?.name).toBe('Assistant');
    });
  });
});
