/**
 * E2E Tests: Self-Referential One-to-Many with Reverse - Key Pairing
 *
 * Schema: self-ref-one-to-many-with-reverse.cerial
 * Tests that @key(manages) links manager and directReports.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-Many with Reverse: Key Pairing', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToManyWithReverse);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefOneToManyWithReverse);
  });

  describe('key pairing synchronization', () => {
    test('directReports reflects employees where manager = this', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      const e1 = await client.db.EmployeeWithReports.create({
        data: { name: 'E1', manager: { connect: manager.id } },
      });
      const e2 = await client.db.EmployeeWithReports.create({
        data: { name: 'E2', manager: { connect: manager.id } },
      });

      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: manager.id },
        include: { directReports: true },
      });

      const reportIds = result?.directReports?.map((r) => r.id).sort();
      expect(reportIds).toEqual([e1.id, e2.id].sort());
    });

    test('changing manager updates directReports lookup', async () => {
      const oldManager = await client.db.EmployeeWithReports.create({
        data: { name: 'Old Manager' },
      });
      const newManager = await client.db.EmployeeWithReports.create({
        data: { name: 'New Manager' },
      });

      const employee = await client.db.EmployeeWithReports.create({
        data: { name: 'Employee', manager: { connect: oldManager.id } },
      });

      // Old manager has employee
      let oldResult = await client.db.EmployeeWithReports.findOne({
        where: { id: oldManager.id },
        include: { directReports: true },
      });
      expect(oldResult?.directReports).toHaveLength(1);

      // Change manager
      await client.db.EmployeeWithReports.updateMany({
        where: { id: employee.id },
        data: { manager: { connect: newManager.id } },
      });

      // Old manager now empty, new manager has employee
      oldResult = await client.db.EmployeeWithReports.findOne({
        where: { id: oldManager.id },
        include: { directReports: true },
      });
      expect(oldResult?.directReports).toEqual([]);

      const newResult = await client.db.EmployeeWithReports.findOne({
        where: { id: newManager.id },
        include: { directReports: true },
      });
      expect(newResult?.directReports).toHaveLength(1);
    });
  });

  describe('no automatic sync needed', () => {
    test('directReports is computed from managerId, not stored', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      // No directReportIds field on model
      expect((manager as any).directReportIds).toBeUndefined();

      await client.db.EmployeeWithReports.create({
        data: { name: 'Employee', manager: { connect: manager.id } },
      });

      // directReports is derived, not stored
      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: manager.id },
        include: { directReports: true },
      });
      expect(result?.directReports).toHaveLength(1);
    });
  });
});
