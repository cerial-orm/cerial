/**
 * E2E Tests: Self-Referential One-to-Many - Create
 *
 * Schema: self-ref-one-to-many.cerial
 * - EmployeeSingleSided: id, name, managerId (Record?), manager (Relation? @field)
 *
 * Tests single-sided 1-n self-reference (no reverse lookup).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../../test-helper';

describe('E2E Self-Ref One-to-Many: Create', () => {
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

  describe('create without manager', () => {
    test('should create employee without manager (top-level)', async () => {
      const ceo = await client.db.EmployeeSingleSided.create({
        data: { name: 'CEO' },
      });

      expect(ceo.managerId).toBeNull();
    });
  });

  describe('create with manager connect', () => {
    test('should create employee with manager via connect', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      const employee = await client.db.EmployeeSingleSided.create({
        data: {
          name: 'Employee',
          manager: { connect: manager.id },
        },
      });

      expect(employee.managerId?.equals(manager.id)).toBe(true);
    });

    test('should create multiple employees under same manager', async () => {
      const manager = await client.db.EmployeeSingleSided.create({
        data: { name: 'Manager' },
      });

      const emp1 = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee 1', manager: { connect: manager.id } },
      });
      const emp2 = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee 2', manager: { connect: manager.id } },
      });
      const emp3 = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee 3', manager: { connect: manager.id } },
      });

      expect(emp1.managerId?.equals(manager.id)).toBe(true);
      expect(emp2.managerId?.equals(manager.id)).toBe(true);
      expect(emp3.managerId?.equals(manager.id)).toBe(true);
    });
  });

  describe('create with manager create', () => {
    test('should create employee with nested manager create', async () => {
      const employee = await client.db.EmployeeSingleSided.create({
        data: {
          name: 'Employee',
          manager: {
            create: { name: 'New Manager' },
          },
        },
      });

      expect(employee.managerId).toBeDefined();

      const manager = await client.db.EmployeeSingleSided.findOne({
        where: { id: employee.managerId! },
      });
      expect(manager?.name).toBe('New Manager');
    });
  });

  describe('create hierarchy', () => {
    test('should create multi-level hierarchy', async () => {
      const ceo = await client.db.EmployeeSingleSided.create({
        data: { name: 'CEO' },
      });

      const vp = await client.db.EmployeeSingleSided.create({
        data: { name: 'VP', manager: { connect: ceo.id } },
      });

      const director = await client.db.EmployeeSingleSided.create({
        data: { name: 'Director', manager: { connect: vp.id } },
      });

      const employee = await client.db.EmployeeSingleSided.create({
        data: { name: 'Employee', manager: { connect: director.id } },
      });

      expect(ceo.managerId).toBeNull();
      expect(vp.managerId?.equals(ceo.id)).toBe(true);
      expect(director.managerId?.equals(vp.id)).toBe(true);
      expect(employee.managerId?.equals(director.id)).toBe(true);
    });
  });
});
