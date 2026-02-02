/**
 * E2E Tests: Self-Referential One-to-Many - Update
 *
 * Schema: self-ref-one-to-many.cerial
 * Tests updating manager relationships.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-Many: Update', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToMany);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('update manager connect', () => {
    test('should change manager via connect', async () => {
      const oldManager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Old Manager' },
      });
      const newManager = await client.db.EmployeeSingleSided.create({
        data: { name: 'New Manager' },
      });

      const employee = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee', manager: { connect: oldManager.id } },
      });

      await client.db.EmployeeSingleSided.updateMany({
        where: { id: employee.id },
        data: { manager: { connect: newManager.id } },
      });

      const updated = await client.db.EmployeeSingleSided.findOne({
        where: { id: employee.id },
      });

      expect(updated?.managerId).toBe(newManager.id);
    });

    test('should assign manager to previously unassigned employee', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      const employee = await client.db.EmployeeSingleSided.create({
        data: { name: 'Free Agent' },
      });
      expect(employee.managerId).toBeNull();

      await client.db.EmployeeSingleSided.updateMany({
        where: { id: employee.id },
        data: { manager: { connect: manager.id } },
      });

      const updated = await client.db.EmployeeSingleSided.findOne({
        where: { id: employee.id },
      });

      expect(updated?.managerId).toBe(manager.id);
    });
  });

  describe('update manager disconnect', () => {
    test('should remove manager via disconnect', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      const employee = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee', manager: { connect: manager.id } },
      });

      await client.db.EmployeeSingleSided.updateMany({
        where: { id: employee.id },
        data: { manager: { disconnect: true } },
      });

      const updated = await client.db.EmployeeSingleSided.findOne({
        where: { id: employee.id },
      });

      expect(updated?.managerId).toBeNull();
    });
  });

  describe('bulk manager reassignment', () => {
    test('should reassign multiple employees to new manager', async () => {
      const oldManager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Old Manager' },
      });
      const newManager = await client.db.EmployeeSingleSided.create({
        data: { name: 'New Manager' },
      });

      await client.db.EmployeeSingleSided.create({
        data: { name: 'E1', manager: { connect: oldManager.id } },
      });
      await client.db.EmployeeSingleSided.create({
        data: { name: 'E2', manager: { connect: oldManager.id } },
      });

      // Reassign all of old manager's reports
      await client.db.EmployeeSingleSided.updateMany({
        where: { managerId: oldManager.id },
        data: { manager: { connect: newManager.id } },
      });

      const newReports = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: newManager.id },
      });
      const oldReports = await client.db.EmployeeSingleSided.findMany({
        where: { managerId: oldManager.id },
      });

      expect(newReports).toHaveLength(2);
      expect(oldReports).toHaveLength(0);
    });
  });
});
