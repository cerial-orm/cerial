/**
 * E2E Tests: a caught @onDelete(Restrict) refusal inside a callback $transaction
 *
 * Inside an SDK transaction a THROW does not stop the script, so a callback that catches the refusal still
 * commits whatever the delete statements did. The row and its dependents must survive the commit, at the
 * direct dependent and one level further down.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../test-helper';
import { connectClient, levelCounts, refusalOf, resetTables, seedChain } from '../transitive/helpers';

describe('E2E callback $transaction: a caught Restrict refusal keeps every row', () => {
  describe('on the direct dependent', () => {
    let client: CerialClient;

    beforeAll(async () => {
      client = createTestClient();
      await client.connect(testConfig);
      await cleanupTables(client, tables.oneToManyRestrict);
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(async () => {
      await truncateTables(client, tables.oneToManyRestrict);
    });

    test('deleteUnique throws, the callback catches it, and the commit keeps the row and its dependent', async () => {
      const dept = await client.db.Department.create({
        data: { name: 'Engineering', employees: { create: [{ name: 'Engineer' }] } },
      });
      let caught: Error | undefined;

      await client.$transaction(async (tx) => {
        caught = await refusalOf(() => tx.Department.deleteUnique({ where: { id: dept.id } }));
      });

      expect(caught?.message).toContain('@onDelete(Restrict)');
      expect(await client.db.Department.findOne({ where: { id: dept.id } })).not.toBeNull();
      expect(await client.db.Department.count()).toBe(1);
      expect(await client.db.Employee.count()).toBe(1);
    });

    test('deleteUnique outside the transaction leaves the same two rows', async () => {
      const dept = await client.db.Department.create({
        data: { name: 'Engineering', employees: { create: [{ name: 'Engineer' }] } },
      });

      const refusal = await refusalOf(() => client.db.Department.deleteUnique({ where: { id: dept.id } }));

      expect(refusal?.message).toContain('@onDelete(Restrict)');
      expect(await client.db.Department.count()).toBe(1);
      expect(await client.db.Employee.count()).toBe(1);
    });

    test('once the dependent is gone the same deleteUnique removes the row in the callback', async () => {
      const dept = await client.db.Department.create({
        data: { name: 'Engineering', employees: { create: [{ name: 'Engineer' }] } },
      });
      await client.db.Employee.deleteMany({ where: {} });

      await client.$transaction(async (tx) => {
        await tx.Department.deleteUnique({ where: { id: dept.id } });
      });

      expect(await client.db.Department.count()).toBe(0);
    });
  });

  describe('two levels down', () => {
    let client: CerialClient;

    beforeAll(async () => {
      client = await connectClient();
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(async () => {
      await resetTables(client);
    });

    test('deleteUnique throws, the callback catches it, and the commit keeps every level', async () => {
      const chain = await seedChain(client, 2, 'Restrict');
      let caught: Error | undefined;

      await client.$transaction(async (tx) => {
        caught = await refusalOf(() => tx.DdRoot.deleteUnique({ where: { id: chain.rootId } }));
      });

      expect(caught?.message).toContain('@onDelete(Restrict)');
      expect(await client.db.DdRoot.count()).toBe(1);
      expect(await client.db.DdOne.count()).toBe(1);
      expect(await levelCounts(client, 2, 'Restrict')).toEqual([1, 1, 1]);
    });
  });
});
