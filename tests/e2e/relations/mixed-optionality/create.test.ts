/**
 * E2E Tests: Mixed Optionality - Create
 *
 * Schema: mixed-optionality.cerial
 * - Customer: id, name, orders (Relation[])
 * - Agent: id, name, assignedOrders (Relation[])
 * - Order: id, orderNumber, customerId (Record), customer (Relation @field),
 *          assigneeId? (Record?), assignee (Relation? @field)
 *
 * Tests order with required customer and optional assignee.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

describe('E2E Mixed Optionality: Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.mixedOptionality);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('create order with customer only', () => {
    test('should create order with customer (required)', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });

      const order = await client.db.Order.create({
        data: {
          orderNumber: 'ORD-001',
          customer: { connect: customer.id },
        },
      });

      expect(order.customerId).toBe(customer.id);
      expect(order.assigneeId).toBeNull();
    });

    test('should create order with nested customer create', async () => {
      const order = await client.db.Order.create({
        data: {
          orderNumber: 'ORD-002',
          customer: {
            create: { name: 'New Customer' },
          },
        },
      });

      expect(order.customerId).toBeDefined();

      const customer = await client.db.Customer.findOne({
        where: { id: order.customerId },
      });
      expect(customer?.name).toBe('New Customer');
    });
  });

  describe('create order with customer and assignee', () => {
    test('should create order with both customer and assignee', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const agent = await client.db.Agent.create({
        data: { name: 'Agent' },
      });

      const order = await client.db.Order.create({
        data: {
          orderNumber: 'ORD-003',
          customer: { connect: customer.id },
          assignee: { connect: agent.id },
        },
      });

      expect(order.customerId).toBe(customer.id);
      expect(order.assigneeId).toBe(agent.id);
    });

    test('should create order with nested assignee create', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });

      const order = await client.db.Order.create({
        data: {
          orderNumber: 'ORD-004',
          customer: { connect: customer.id },
          assignee: {
            create: { name: 'New Agent' },
          },
        },
      });

      expect(order.assigneeId).toBeDefined();

      const agent = await client.db.Agent.findOne({
        where: { id: order.assigneeId! },
      });
      expect(agent?.name).toBe('New Agent');
    });
  });

  describe('multiple orders', () => {
    test('should allow customer to have multiple orders', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Repeat Customer' },
      });

      await client.db.Order.create({
        data: { orderNumber: 'ORD-A', customer: { connect: customer.id } },
      });
      await client.db.Order.create({
        data: { orderNumber: 'ORD-B', customer: { connect: customer.id } },
      });

      const orders = await client.db.Order.findMany({
        where: { customerId: customer.id },
      });

      expect(orders).toHaveLength(2);
    });

    test('should allow agent to be assigned multiple orders', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const agent = await client.db.Agent.create({
        data: { name: 'Busy Agent' },
      });

      await client.db.Order.create({
        data: {
          orderNumber: 'ORD-X',
          customer: { connect: customer.id },
          assignee: { connect: agent.id },
        },
      });
      await client.db.Order.create({
        data: {
          orderNumber: 'ORD-Y',
          customer: { connect: customer.id },
          assignee: { connect: agent.id },
        },
      });

      const orders = await client.db.Order.findMany({
        where: { assigneeId: agent.id },
      });

      expect(orders).toHaveLength(2);
    });
  });
});
