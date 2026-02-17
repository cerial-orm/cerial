/**
 * E2E Tests: Mixed Optionality - Queries
 *
 * Schema: mixed-optionality.cerial
 * Tests querying with required and optional relation filters.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../test-helper';

describe('E2E Mixed Optionality: Queries', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.mixedOptionality);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.mixedOptionality);
  });

  describe('query by customerId', () => {
    test('should find orders by customer', async () => {
      const c1 = await client.db.Customer.create({ data: { name: 'C1' } });
      const c2 = await client.db.Customer.create({ data: { name: 'C2' } });

      await client.db.Order.create({
        data: { orderNumber: 'ORD-1', customer: { connect: c1.id } },
      });
      await client.db.Order.create({
        data: { orderNumber: 'ORD-2', customer: { connect: c1.id } },
      });
      await client.db.Order.create({
        data: { orderNumber: 'ORD-3', customer: { connect: c2.id } },
      });

      const c1Orders = await client.db.Order.findMany({
        where: { customerId: c1.id },
      });

      expect(c1Orders).toHaveLength(2);
    });
  });

  describe('query by assigneeId', () => {
    test('should find assigned orders', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const agent = await client.db.Agent.create({ data: { name: 'Agent' } });

      await client.db.Order.create({
        data: {
          orderNumber: 'ORD-1',
          customer: { connect: customer.id },
          assignee: { connect: agent.id },
        },
      });
      await client.db.Order.create({
        data: { orderNumber: 'ORD-2', customer: { connect: customer.id } },
      });

      const assignedOrders = await client.db.Order.findMany({
        where: { assigneeId: agent.id },
      });

      expect(assignedOrders).toHaveLength(1);
      expect(assignedOrders[0]?.orderNumber).toBe('ORD-1');
    });

    test('should find unassigned orders', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const agent = await client.db.Agent.create({ data: { name: 'Agent' } });

      await client.db.Order.create({
        data: {
          orderNumber: 'ORD-1',
          customer: { connect: customer.id },
          assignee: { connect: agent.id },
        },
      });
      await client.db.Order.create({
        data: { orderNumber: 'ORD-2', customer: { connect: customer.id } },
      });
      await client.db.Order.create({
        data: { orderNumber: 'ORD-3', customer: { connect: customer.id } },
      });

      const unassignedOrders = await client.db.Order.findMany({
        where: { assigneeId: null },
      });

      expect(unassignedOrders).toHaveLength(2);
    });
  });

  describe('combined filters', () => {
    test('should find orders by customer and assignment status', async () => {
      const c1 = await client.db.Customer.create({ data: { name: 'C1' } });
      const c2 = await client.db.Customer.create({ data: { name: 'C2' } });
      const agent = await client.db.Agent.create({ data: { name: 'Agent' } });

      // C1: 1 assigned, 1 unassigned
      await client.db.Order.create({
        data: {
          orderNumber: 'C1-A',
          customer: { connect: c1.id },
          assignee: { connect: agent.id },
        },
      });
      await client.db.Order.create({
        data: { orderNumber: 'C1-U', customer: { connect: c1.id } },
      });

      // C2: 1 unassigned
      await client.db.Order.create({
        data: { orderNumber: 'C2-U', customer: { connect: c2.id } },
      });

      // C1's unassigned orders
      const c1Unassigned = await client.db.Order.findMany({
        where: { customerId: c1.id, assigneeId: null },
      });

      expect(c1Unassigned).toHaveLength(1);
      expect(c1Unassigned[0]?.orderNumber).toBe('C1-U');
    });
  });

  describe('orderBy', () => {
    test('should order orders by orderNumber', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });

      await client.db.Order.create({
        data: { orderNumber: 'C', customer: { connect: customer.id } },
      });
      await client.db.Order.create({
        data: { orderNumber: 'A', customer: { connect: customer.id } },
      });
      await client.db.Order.create({
        data: { orderNumber: 'B', customer: { connect: customer.id } },
      });

      const orders = await client.db.Order.findMany({
        where: { customerId: customer.id },
        orderBy: { orderNumber: 'asc' },
      });

      expect(orders.map((o) => o.orderNumber)).toEqual(['A', 'B', 'C']);
    });
  });
});
