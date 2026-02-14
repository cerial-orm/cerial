/**
 * E2E Tests: Self-Referential One-to-One with Reverse - Include
 *
 * Schema: self-ref-one-to-one-with-reverse.cerial
 * Tests including from both directions.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-One with Reverse: Include', () => {
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

  describe('include assists', () => {
    test('should include who this person assists', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      const assistant = await client.db.Assistant.create({
        data: { name: 'Assistant', assists: { connect: boss.id } },
      });

      const result = await client.db.Assistant.findOne({
        where: { id: assistant.id },
        include: { assists: true },
      });

      expect(result?.assists?.name).toBe('Boss');
    });
  });

  describe('include assistedBy', () => {
    test('should include who assists this person', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      await client.db.Assistant.create({
        data: { name: 'Assistant', assists: { connect: boss.id } },
      });

      const result = await client.db.Assistant.findOne({
        where: { id: boss.id },
        include: { assistedBy: true },
      });

      expect(result?.assistedBy?.name).toBe('Assistant');
    });
  });

  describe('include both directions', () => {
    test('should include both assists and assistedBy simultaneously', async () => {
      const topBoss = await client.db.Assistant.create({
        data: { name: 'Top Boss' },
      });

      const middleManager = await client.db.Assistant.create({
        data: { name: 'Middle', assists: { connect: topBoss.id } },
      });

      await client.db.Assistant.create({
        data: { name: 'Junior', assists: { connect: middleManager.id } },
      });

      // Middle manager assists top boss and is assisted by junior
      const result = await client.db.Assistant.findOne({
        where: { id: middleManager.id },
        include: {
          assists: true,
          assistedBy: true,
        },
      });

      expect(result?.assists?.name).toBe('Top Boss');
      expect(result?.assistedBy?.name).toBe('Junior');
    });
  });

  describe('nested include', () => {
    test('should support nested include through chain', async () => {
      const top = await client.db.Assistant.create({
        data: { name: 'Top' },
      });

      const middle = await client.db.Assistant.create({
        data: { name: 'Middle', assists: { connect: top.id } },
      });

      const bottom = await client.db.Assistant.create({
        data: { name: 'Bottom', assists: { connect: middle.id } },
      });

      // From bottom, include assists.assists
      const result = await client.db.Assistant.findOne({
        where: { id: bottom.id },
        include: {
          assists: {
            include: { assists: true },
          },
        },
      });

      expect(result?.assists?.name).toBe('Middle');
      expect(result?.assists?.assists?.name).toBe('Top');
    });
  });
});
