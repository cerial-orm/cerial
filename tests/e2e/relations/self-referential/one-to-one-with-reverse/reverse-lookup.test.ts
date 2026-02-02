/**
 * E2E Tests: Self-Referential One-to-One with Reverse - Reverse Lookup
 *
 * Schema: self-ref-one-to-one-with-reverse.cerial
 * Tests assistedBy returns correct record.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-One with Reverse: Reverse Lookup', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToOneWithReverse);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('assistedBy lookup', () => {
    test('should find who assists this person via include', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      await client.db.Assistant.create({
        data: { name: 'Assistant', assists: { connect: boss.id } },
      });

      // Query boss with assistedBy included
      const result = await client.db.Assistant.findOne({
        where: { id: boss.id },
        include: { assistedBy: true },
      });

      expect(result?.assistedBy).toBeDefined();
      expect(result?.assistedBy?.name).toBe('Assistant');
    });

    test('should return null assistedBy when no one assists', async () => {
      const person = await client.db.Assistant.create({
        data: { name: 'No Assistant' },
      });

      const result = await client.db.Assistant.findOne({
        where: { id: person.id },
        include: { assistedBy: true },
      });

      expect(result?.assistedBy).toBeNull();
    });
  });

  describe('bidirectional include', () => {
    test('should include both assists and assistedBy', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      const assistant = await client.db.Assistant.create({
        data: { name: 'Assistant', assists: { connect: boss.id } },
      });

      // Include assists (who they help)
      const assistantResult = await client.db.Assistant.findOne({
        where: { id: assistant.id },
        include: { assists: true },
      });
      expect(assistantResult?.assists?.name).toBe('Boss');

      // Include assistedBy (who helps them)
      const bossResult = await client.db.Assistant.findOne({
        where: { id: boss.id },
        include: { assistedBy: true },
      });
      expect(bossResult?.assistedBy?.name).toBe('Assistant');
    });
  });
});
