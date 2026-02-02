/**
 * E2E Tests: One-to-Many @onDelete(Restrict)
 *
 * Schema: one-to-many-restrict.cerial
 * - Department: id, name, employees (Relation[] @model)
 * - Employee: id, name, departmentId (Record?), department (Relation? @field @onDelete(Restrict))
 *
 * Tests blocking delete when children exist.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E One-to-Many @onDelete(Restrict)', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyRestrict);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('restrict behavior', () => {
    test('should error when deleting department with employees', async () => {
      const dept = await client.db.Department.create({
        data: {
          name: 'Engineering',
          employees: { create: [{ name: 'Engineer' }] },
        },
      });

      // Attempt to delete should fail
      await expect(
        client.db.Department.deleteMany({
          where: { id: dept.id },
        })
      ).rejects.toThrow();

      // Department should still exist
      expect(
        await client.db.Department.findOne({ where: { id: dept.id } })
      ).toBeDefined();
    });

    test('should allow deleting department with no employees', async () => {
      const dept = await client.db.Department.create({
        data: { name: 'Empty Dept' },
      });

      await client.db.Department.deleteMany({
        where: { id: dept.id },
      });

      expect(
        await client.db.Department.findOne({ where: { id: dept.id } })
      ).toBeNull();
    });
  });

  describe('delete after removing employees', () => {
    test('should allow delete after all employees removed', async () => {
      const dept = await client.db.Department.create({
        data: {
          name: 'Department',
          employees: { create: [{ name: 'Emp 1' }, { name: 'Emp 2' }] },
        },
      });

      // Delete all employees
      await client.db.Employee.deleteMany({
        where: { departmentId: dept.id },
      });

      // Now department can be deleted
      await client.db.Department.deleteMany({
        where: { id: dept.id },
      });

      expect(
        await client.db.Department.findOne({ where: { id: dept.id } })
      ).toBeNull();
    });

    test('should allow delete after employees disconnected', async () => {
      const dept = await client.db.Department.create({
        data: {
          name: 'Department',
          employees: { create: [{ name: 'Employee' }] },
        },
      });

      // Disconnect employees (set departmentId to null)
      await client.db.Employee.updateMany({
        where: { departmentId: dept.id },
        data: { departmentId: null },
      });

      // Now department can be deleted
      await client.db.Department.deleteMany({
        where: { id: dept.id },
      });

      expect(
        await client.db.Department.findOne({ where: { id: dept.id } })
      ).toBeNull();

      // Employee should still exist as orphan
      const employees = await client.db.Employee.findMany({});
      expect(employees).toHaveLength(1);
      expect(employees[0]?.departmentId).toBeNull();
    });
  });

  describe('deleteMany with restrict', () => {
    test('should fail if any department has employees', async () => {
      await client.db.Department.create({
        data: { name: 'Dept A' },
      });
      await client.db.Department.create({
        data: {
          name: 'Dept B',
          employees: { create: [{ name: 'Blocker' }] },
        },
      });

      // Should fail because Dept B has employees with @onDelete(Restrict)
      await expect(
        client.db.Department.deleteMany({
          where: { name: { contains: 'Dept' } },
        })
      ).rejects.toThrow();

      // Both departments should still exist
      const depts = await client.db.Department.findMany({});
      expect(depts).toHaveLength(2);
    });
  });
});
