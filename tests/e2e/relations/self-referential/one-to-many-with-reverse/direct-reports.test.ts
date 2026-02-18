/**
 * E2E Tests: Self-Referential One-to-Many with Reverse - Direct Reports
 *
 * Schema: self-ref-one-to-many-with-reverse.cerial
 * Tests directReports reverse lookup via @key pairing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../../test-helper';

describe('E2E Self-Ref One-to-Many with Reverse: Direct Reports', () => {
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

  describe('include directReports', () => {
    test('should include directReports when querying manager', async () => {
      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager' },
      });

      await client.db.EmployeeWithReports.create({
        data: { name: 'Report 1', manager: { connect: manager.id } },
      });
      await client.db.EmployeeWithReports.create({
        data: { name: 'Report 2', manager: { connect: manager.id } },
      });

      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: manager.id },
        include: { directReports: true },
      });

      expect(result?.directReports).toHaveLength(2);
      expect(result?.directReports?.map((r) => r.name).sort()).toEqual(['Report 1', 'Report 2']);
    });

    test('should return empty array for employee with no reports', async () => {
      const employee = await client.db.EmployeeWithReports.create({
        data: { name: 'Individual Contributor' },
      });

      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: employee.id },
        include: { directReports: true },
      });

      expect(result?.directReports).toEqual([]);
    });
  });

  describe('include both directions', () => {
    test('should include both manager and directReports', async () => {
      const ceo = await client.db.EmployeeWithReports.create({
        data: { name: 'CEO' },
      });

      const manager = await client.db.EmployeeWithReports.create({
        data: { name: 'Manager', manager: { connect: ceo.id } },
      });

      await client.db.EmployeeWithReports.create({
        data: { name: 'Report', manager: { connect: manager.id } },
      });

      // Manager has both manager (CEO) and directReports
      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: manager.id },
        include: { manager: true, directReports: true },
      });

      expect(result?.manager?.name).toBe('CEO');
      expect(result?.directReports).toHaveLength(1);
      expect(result?.directReports?.[0]?.name).toBe('Report');
    });
  });

  describe('nested includes', () => {
    test('should include nested directReports chain', async () => {
      const ceo = await client.db.EmployeeWithReports.create({
        data: { name: 'CEO' },
      });

      const vp = await client.db.EmployeeWithReports.create({
        data: { name: 'VP', manager: { connect: ceo.id } },
      });

      await client.db.EmployeeWithReports.create({
        data: { name: 'Director', manager: { connect: vp.id } },
      });

      const result = await client.db.EmployeeWithReports.findOne({
        where: { id: ceo.id },
        include: {
          directReports: {
            include: { directReports: true },
          },
        },
      });

      expect(result?.directReports?.[0]?.name).toBe('VP');
      expect(result?.directReports?.[0]?.directReports?.[0]?.name).toBe('Director');
    });
  });
});
