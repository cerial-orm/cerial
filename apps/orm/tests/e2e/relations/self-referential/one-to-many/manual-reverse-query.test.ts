/**
 * E2E Tests: Self-Referential One-to-Many - Manual Reverse Query
 *
 * Schema: self-ref-one-to-many.cerial
 * Tests manual reverse lookup (no directReports field).
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

describe('E2E Self-Ref One-to-Many: Manual Reverse Query', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToMany);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefOneToMany);
  });

  describe('no directReports field', () => {
    test('employee should not have directReports field', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      expect(manager.id).toBeDefined();
      expect(manager.name).toBe('Manager');
      expect('directReports' in manager).toBe(false);
    });
  });

  describe('manual query for direct reports', () => {
    test('should find direct reports via managerId query', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      await client.db.EmployeeSingleSided.create({
        data: { name: 'Report 1', manager: { connect: manager.id } },
      });
      await client.db.EmployeeSingleSided.create({
        data: { name: 'Report 2', manager: { connect: manager.id } },
      });
      await client.db.EmployeeSingleSided.create({
        data: { name: 'Other Employee' }, // No manager
      });

      // Manual reverse query
      const directReports = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: manager.id },
      });

      expect(directReports).toHaveLength(2);
      expect(directReports.map((r) => r.name).sort()).toEqual(['Report 1', 'Report 2']);
    });

    test('should return empty for manager with no reports', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Solo Manager' },
      });

      const directReports = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: manager.id },
      });

      expect(directReports).toEqual([]);
    });
  });

  describe('find all top-level employees', () => {
    test('should find employees with no manager', async () => {
      const ceo1 = await client.db.EmployeeSingleSided.create({
        data: { name: 'CEO 1' },
      });
      await client.db.EmployeeSingleSided.create({
        data: { name: 'CEO 2' },
      });

      await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee', manager: { connect: ceo1.id } },
      });

      const topLevel = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: null },
      });

      expect(topLevel).toHaveLength(2);
      expect(topLevel.map((e) => e.name).sort()).toEqual(['CEO 1', 'CEO 2']);
    });
  });

  describe('hierarchy traversal', () => {
    test('should traverse hierarchy manually', async () => {
      const ceo = await client.db.EmployeeSingleSided.create({
        data: { name: 'CEO' },
      });

      const vp1 = await client.db.EmployeeSingleSided.create({
        data: { name: 'VP1', manager: { connect: ceo.id } },
      });
      const vp2 = await client.db.EmployeeSingleSided.create({
        data: { name: 'VP2', manager: { connect: ceo.id } },
      });

      await client.db.EmployeeSingleSided.create({
        data: { name: 'Dir1', manager: { connect: vp1.id } },
      });
      await client.db.EmployeeSingleSided.create({
        data: { name: 'Dir2', manager: { connect: vp1.id } },
      });
      await client.db.EmployeeSingleSided.create({
        data: { name: 'Dir3', manager: { connect: vp2.id } },
      });

      // Count total employees under CEO (direct)
      const ceosReports = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: ceo.id },
      });
      expect(ceosReports).toHaveLength(2);

      // VP1's reports
      const vp1Reports = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: vp1.id },
      });
      expect(vp1Reports).toHaveLength(2);

      // VP2's reports
      const vp2Reports = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: vp2.id },
      });
      expect(vp2Reports).toHaveLength(1);
    });
  });
});
