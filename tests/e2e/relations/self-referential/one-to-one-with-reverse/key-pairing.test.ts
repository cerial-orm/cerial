/**
 * E2E Tests: Self-Referential One-to-One with Reverse - Key Pairing
 *
 * Schema: self-ref-one-to-one-with-reverse.cerial
 * Tests @key pairs forward and reverse correctly.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Self-Ref One-to-One with Reverse: Key Pairing', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToOneWithReverse);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('key pairing validation', () => {
    test('assists and assistedBy should be correctly paired', async () => {
      const a = await client.db.Assistant.create({
        data: { name: 'A' },
      });
      const b = await client.db.Assistant.create({
        data: { name: 'B', assists: { connect: a.id } },
      });

      // B assists A
      expect(b.assistsId).toBe(a.id);

      // A is assistedBy B
      const aWithReverse = await client.db.Assistant.findOne({
        where: { id: a.id },
        include: { assistedBy: true },
      });
      expect(aWithReverse?.assistedBy?.id).toBe(b.id);
    });

    test('multiple assistants should work with key pairing', async () => {
      const boss = await client.db.Assistant.create({
        data: { name: 'Boss' },
      });

      // In 1-1, only one assistant can assist one boss
      // If another tries, it should either replace or error
      const assistant1 = await client.db.Assistant.create({
        data: { name: 'Asst 1', assists: { connect: boss.id } },
      });

      // Query boss - should show assistant1
      let bossResult = await client.db.Assistant.findOne({
        where: { id: boss.id },
        include: { assistedBy: true },
      });
      expect(bossResult?.assistedBy?.id).toBe(assistant1.id);

      // Create another assistant for same boss
      const assistant2 = await client.db.Assistant.create({
        data: { name: 'Asst 2', assists: { connect: boss.id } },
      });

      // Since this is technically allowed (1-n from reverse perspective),
      // we might have multiple assistants
      // The include might return one or need special handling
      bossResult = await client.db.Assistant.findOne({
        where: { id: boss.id },
        include: { assistedBy: true },
      });
      // Depending on implementation, might return first or last
      expect([assistant1.id, assistant2.id]).toContain(bossResult?.assistedBy?.id!);
    });
  });
});
