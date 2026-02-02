/**
 * E2E Tests: Self-Referential One-to-One with Reverse - Create
 *
 * Schema: self-ref-one-to-one-with-reverse.cerial
 * - Assistant: id, name, assistsId (Record?), assists (Relation? @field @key),
 *              assistedBy (Relation? @key)
 *
 * Tests 1-1 self-ref with reverse lookup via @key pairing.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-One with Reverse: Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToOneWithReverse);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('create with assists', () => {
    test('should create assistant with assists connect', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      const assistant = await client.db.Assistant.create({
        data: {
          name: 'Assistant',
          assists: { connect: boss.id },
        },
      });

      expect(assistant.assistsId).toBe(boss.id);
    });

    test('should create assistant with nested assists create', async () => {
      const assistant = await client.db.Assistant.create({
        data: {
          name: 'Assistant',
          assists: {
            create: { name: 'New Boss' },
          },
        },
      });

      expect(assistant.assistsId).toBeDefined();

      const boss = await client.db.Assistant.findOne({
        where: { id: assistant.assistsId! },
      });
      expect(boss?.name).toBe('New Boss');
    });
  });

  describe('create without relation', () => {
    test('should create assistant without assists', async () => {
      const assistant = await client.db.Assistant.create({
        data: { name: 'Solo' },
      });

      expect(assistant.assistsId).toBeNull();
    });
  });
});
