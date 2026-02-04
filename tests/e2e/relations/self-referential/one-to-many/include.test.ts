/**
 * E2E Tests: Self-Referential One-to-Many - Include
 *
 * Schema: self-ref-one-to-many.cerial
 * Tests including manager (forward relation only).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Self-Ref One-to-Many: Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToMany);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include manager', () => {
    test('should include manager when querying employee', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      const employee = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee', manager: { connect: manager.id } },
      });

      const result = await client.db.EmployeeSingleSided.findOne({
        where: { id: employee.id },
        include: { manager: true },
      });

      expect(result?.manager?.name).toBe('Manager');
    });

    test('should return null manager for top-level employee', async () => {
      const ceo = await client.db.EmployeeSingleSided.create({
        data: { name: 'CEO' },
      });

      const result = await client.db.EmployeeSingleSided.findOne({
        where: { id: ceo.id },
        include: { manager: true },
      });

      expect(result?.manager).toBeNull();
    });
  });

  describe('include manager chain', () => {
    test('should include nested manager chain', async () => {
      const ceo = await client.db.EmployeeSingleSided.create({
        data: { name: 'CEO' },
      });

      const vp = await client.db.EmployeeSingleSided.create({
        data: { name: 'VP', manager: { connect: ceo.id } },
      });

      const employee = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee', manager: { connect: vp.id } },
      });

      const result = await client.db.EmployeeSingleSided.findOne({
        where: { id: employee.id },
        include: {
          manager: {
            include: { manager: true },
          },
        },
      });

      expect(result?.manager?.name).toBe('VP');
      expect(result?.manager?.manager?.name).toBe('CEO');
      // Third level not included in query, so undefined (not fetched)
      // @ts-expect-error - Type inference doesn't fully resolve deeply nested includes, testing runtime behavior
      expect(result?.manager?.manager?.manager).toBeUndefined();
    });
  });

  describe('no directReports include', () => {
    test('cannot include directReports (not defined)', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      await client.db.EmployeeSingleSided.create({
        data: { name: 'Report', manager: { connect: manager.id } },
      });

      // Only manager relation is available
      const result = await client.db.EmployeeSingleSided.findOne({
        where: { id: manager.id },
        // include: { directReports: true }  // Would be type error
      });

      expect(result).toBeDefined();
      expect((result as any).directReports).toBeUndefined();
    });
  });

  describe('include in findMany', () => {
    test('should include manager for multiple employees', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      await client.db.EmployeeSingleSided.create({
        data: { name: 'E1', manager: { connect: manager.id } },
      });
      await client.db.EmployeeSingleSided.create({
        data: { name: 'E2', manager: { connect: manager.id } },
      });

      const employees = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: manager.id },
        include: { manager: true },
        orderBy: { name: 'asc' },
      });

      expect(employees).toHaveLength(2);
      expect(employees[0]?.manager?.name).toBe('Manager');
      expect(employees[1]?.manager?.name).toBe('Manager');
    });
  });
});
