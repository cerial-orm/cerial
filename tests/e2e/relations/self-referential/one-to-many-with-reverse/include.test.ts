/**
 * E2E Tests: Self-Referential One-to-Many with Reverse - Include
 *
 * Schema: self-ref-one-to-many-with-reverse.cerial
 * Tests all include combinations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../../test-helper';

describe('E2E Self-Ref One-to-Many with Reverse: Include', () => {
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

  describe('include manager only', () => {
    test('should include manager', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      const employee = await client.db.EmployeeWithReports.create({
        data: { name: 'Employee', manager: { connect: manager.id } },
      });

      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: employee.id },
        include: { manager: true },
      });

      expect(result?.manager?.name).toBe('Manager');
    });
  });

  describe('include directReports only', () => {
    test('should include directReports', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      await client.db.EmployeeWithReports.create({
        data: { name: 'E1', manager: { connect: manager.id } },
      });
      await client.db.EmployeeWithReports.create({
        data: { name: 'E2', manager: { connect: manager.id } },
      });

      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: manager.id },
        include: { directReports: true },
      });

      expect(result?.directReports).toHaveLength(2);
    });

    test('should order directReports', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      await client.db.EmployeeWithReports.create({
        data: { name: 'Zebra', manager: { connect: manager.id } },
      });
      await client.db.EmployeeWithReports.create({
        data: { name: 'Alpha', manager: { connect: manager.id } },
      });

      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: manager.id },
        include: {
          directReports: {
            orderBy: { name: 'asc' },
          },
        },
      });

      expect(result?.directReports?.map((r) => r.name)).toEqual(['Alpha', 'Zebra']);
    });
  });

  describe('include in findMany', () => {
    test('should include manager for multiple employees', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      await client.db.EmployeeWithReports.create({
        data: { name: 'E1', manager: { connect: manager.id } },
      });
      await client.db.EmployeeWithReports.create({
        data: { name: 'E2', manager: { connect: manager.id } },
      });

      const employees = await client.db.EmployeeWithReports.findMany({
        where: { managerId: manager.id },
        include: { manager: true },
        orderBy: { name: 'asc' },
      });

      expect(employees).toHaveLength(2);
      expect(employees[0]?.manager?.name).toBe('Manager');
      expect(employees[1]?.manager?.name).toBe('Manager');
    });

    test('should include directReports for multiple managers', async () => {
      const m1 = await client.db.EmployeeWithReports.create({
        data: { name: 'M1' },
      });
      const m2 = await client.db.EmployeeWithReports.create({
        data: { name: 'M2' },
      });

      await client.db.EmployeeWithReports.create({
        data: { name: 'E1', manager: { connect: m1.id } },
      });
      await client.db.EmployeeWithReports.create({
        data: { name: 'E2', manager: { connect: m1.id } },
      });
      await client.db.EmployeeWithReports.create({
        data: { name: 'E3', manager: { connect: m2.id } },
      });

      const managers = await client.db.EmployeeWithReports.findMany({
        where: { managerId: null },
        include: { directReports: true },
        orderBy: { name: 'asc' },
      });

      expect(managers).toHaveLength(2);
      expect(managers[0]?.directReports).toHaveLength(2);
      expect(managers[1]?.directReports).toHaveLength(1);
    });
  });
});
