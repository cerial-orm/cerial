/**
 * E2E Tests: Mixed Optionality - Include
 *
 * Schema: mixed-optionality.cerial
 * Tests include for required and optional relations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Mixed Optionality: Include', () => {
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

  describe('include customer (required)', () => {
    test('should always have customer when included', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });

      const order = await client.db.Order.create({
        data: { orderNumber: 'ORD-001', customer: { connect: customer.id } },
      });

      const result = await client.db.Order.findOne({
        where: { id: order.id },
        include: { customer: true },
      });

      expect(result?.customer).toBeDefined();
      expect(result?.customer?.name).toBe('Customer');
    });
  });

  describe('include assignee (optional)', () => {
    test('should return null assignee when not assigned', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });

      const order = await client.db.Order.create({
        data: { orderNumber: 'ORD-002', customer: { connect: customer.id } },
      });

      const result = await client.db.Order.findOne({
        where: { id: order.id },
        include: { assignee: true },
      });

      expect(result?.assignee).toBeNull();
    });

    test('should return assignee when assigned', async () => {
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

      const result = await client.db.Order.findOne({
        where: { id: order.id },
        include: { assignee: true },
      });

      expect(result?.assignee?.name).toBe('Agent');
    });
  });

  describe('include both', () => {
    test('should include both customer and assignee', async () => {
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

      const result = await client.db.Order.findOne({
        where: { id: order.id },
        include: { customer: true, assignee: true },
      });

      expect(result?.customer?.name).toBe('Customer');
      expect(result?.assignee?.name).toBe('Agent');
    });
  });

  describe('include orders from Customer', () => {
    test('should include orders when querying customer', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });

      await client.db.Order.create({
        data: { orderNumber: 'ORD-A', customer: { connect: customer.id } },
      });
      await client.db.Order.create({
        data: { orderNumber: 'ORD-B', customer: { connect: customer.id } },
      });

      const result = await client.db.Customer.findOne({
        where: { id: customer.id },
        include: { orders: true },
      });

      expect(result?.orders).toHaveLength(2);
    });
  });

  describe('include assignedOrders from Agent', () => {
    test('should include assigned orders when querying agent', async () => {
      const customer = await client.db.Customer.create({
        data: { name: 'Customer' },
      });
      const agent = await client.db.Agent.create({
        data: { name: 'Agent' },
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

      const result = await client.db.Agent.findOne({
        where: { id: agent.id },
        include: { assignedOrders: true },
      });

      expect(result?.assignedOrders).toHaveLength(2);
    });

    test('should return empty array for agent with no assignments', async () => {
      const agent = await client.db.Agent.create({
        data: { name: 'Free Agent' },
      });

      const result = await client.db.Agent.findOne({
        where: { id: agent.id },
        include: { assignedOrders: true },
      });

      expect(result?.assignedOrders).toEqual([]);
    });
  });
});
