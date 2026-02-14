/**
 * E2E Tests: Mixed Optionality - Update
 *
 * Schema: mixed-optionality.cerial
 * Tests updating required and optional relations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

describe('E2E Mixed Optionality: Update', () => {
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

  describe('update customer (required)', () => {
    test('should change customer via connect', async () => {
      const oldCustomer = await client.db.Customer.create({
        data: { name: 'Old Customer' },
      });
      const newCustomer = await client.db.Customer.create({
        data: { name: 'New Customer' },
      });

      const order = await client.db.Order.create({
        data: { orderNumber: 'ORD-001', customer: { connect: oldCustomer.id } },
      });

      await client.db.Order.updateMany({
        where: { id: order.id },
        data: { customer: { connect: newCustomer.id } },
      });

      const result = await client.db.Order.findOne({
        where: { id: order.id },
      });

      expect(result?.customerId?.equals(newCustomer.id)).toBe(true);
    });
  });

  describe('update assignee (optional)', () => {
    test('should assign agent via connect', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const agent = await client.db.Agent.create({
        data: { name: 'Agent' },
      });

      const order = await client.db.Order.create({
        data: { orderNumber: 'ORD-002', customer: { connect: customer.id } },
      });
      expect(order.assigneeId).toBeNull();

      await client.db.Order.updateMany({
        where: { id: order.id },
        data: { assignee: { connect: agent.id } },
      });

      const result = await client.db.Order.findOne({
        where: { id: order.id },
      });

      expect(result?.assigneeId?.equals(agent.id)).toBe(true);
    });

    test('should change assignee via connect', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const oldAgent = await client.db.Agent.create({
        data: { name: 'Old Agent' },
      });
      const newAgent = await client.db.Agent.create({
        data: { name: 'New Agent' },
      });

      const order = await client.db.Order.create({
        data: {
          orderNumber: 'ORD-003',
          customer: { connect: customer.id },
          assignee: { connect: oldAgent.id },
        },
      });

      await client.db.Order.updateMany({
        where: { id: order.id },
        data: { assignee: { connect: newAgent.id } },
      });

      const result = await client.db.Order.findOne({
        where: { id: order.id },
      });

      expect(result?.assigneeId?.equals(newAgent.id)).toBe(true);
    });

    test('should unassign agent via disconnect', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const agent = await client.db.Agent.create({
        data: { name: 'Agent' },
      });

      const order = await client.db.Order.create({
        data: {
          orderNumber: 'ORD-004',
          customer: { connect: customer.id },
          assignee: { connect: agent.id },
        },
      });

      await client.db.Order.updateMany({
        where: { id: order.id },
        data: { assignee: { disconnect: true } },
      });

      const result = await client.db.Order.findOne({
        where: { id: order.id },
      });

      expect(result?.assigneeId).toBeNull();
    });
  });

  describe('bulk reassignment', () => {
    test('should reassign all orders from one agent to another', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const oldAgent = await client.db.Agent.create({
        data: { name: 'Old Agent' },
      });
      const newAgent = await client.db.Agent.create({
        data: { name: 'New Agent' },
      });

      await client.db.Order.create({
        data: {
          orderNumber: 'ORD-A',
          customer: { connect: customer.id },
          assignee: { connect: oldAgent.id },
        },
      });
      await client.db.Order.create({
        data: {
          orderNumber: 'ORD-B',
          customer: { connect: customer.id },
          assignee: { connect: oldAgent.id },
        },
      });

      await client.db.Order.updateMany({
        where: { assigneeId: oldAgent.id },
        data: { assignee: { connect: newAgent.id } },
      });

      const oldAgentOrders = await client.db.Order.findMany({
        where: { assigneeId: oldAgent.id },
      });
      const newAgentOrders = await client.db.Order.findMany({
        where: { assigneeId: newAgent.id },
      });

      expect(oldAgentOrders).toHaveLength(0);
      expect(newAgentOrders).toHaveLength(2);
    });
  });
});
