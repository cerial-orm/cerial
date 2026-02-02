/**
 * E2E Tests: Self-Referential One-to-Many with Reverse - Create
 *
 * Schema: self-ref-one-to-many-with-reverse.cerial
 * - EmployeeWithReports: id, name, managerId (Record?),
 *                        manager (Relation? @field @key),
 *                        directReports (Relation[] @key)
 *
 * Tests 1-n self-ref with bidirectional lookup via @key pairing.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-Many with Reverse: Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToManyWithReverse);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('create with manager', () => {
    test('should create employee with manager via connect', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      const employee = await client.db.EmployeeWithReports.create({
        data: {
          name: 'Employee',
          manager: { connect: manager.id },
        },
      });

      expect(employee.managerId).toBe(manager.id);
    });

    test('should create employee with nested manager create', async () => {
      const employee = await client.db.EmployeeWithReports.create({
        data: {
          name: 'Employee',
          manager: {
            create: { name: 'New Manager' },
          },
        },
      });

      expect(employee.managerId).toBeDefined();

      const manager = await client.db.EmployeeWithReports.findOne({
        where: { id: employee.managerId! },
      });
      expect(manager?.name).toBe('New Manager');
    });
  });

  describe('create without manager', () => {
    test('should create top-level employee', async () => {
      const ceo = await client.db.EmployeeWithReports.create({
        data: { name: 'CEO' },
      });

      expect(ceo.managerId).toBeNull();
    });
  });

  describe('create hierarchy', () => {
    test('should create multi-level hierarchy', async () => {
      const ceo = await client.db.EmployeeWithReports.create({
        data: { name: 'CEO' },
      });

      const vp = await client.db.EmployeeWithReports.create({
        data: { name: 'VP', manager: { connect: ceo.id } },
      });

      const director = await client.db.EmployeeWithReports.create({
        data: { name: 'Director', manager: { connect: vp.id } },
      });

      expect(ceo.managerId).toBeNull();
      expect(vp.managerId).toBe(ceo.id);
      expect(director.managerId).toBe(vp.id);
    });
  });
});
