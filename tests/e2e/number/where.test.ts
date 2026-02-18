import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const NUMBER_TABLES = tables.number;

describe('E2E Number: Where Filtering', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, NUMBER_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, NUMBER_TABLES);
    await client.db.NumberBasic.create({
      data: { name: 'A', price: 10.5, weight: null },
    });
    await client.db.NumberBasic.create({
      data: { name: 'B', price: 20.0, weight: null },
    });
    await client.db.NumberBasic.create({
      data: { name: 'C', price: 30.5, weight: null },
    });
  });

  test('filter by exact Number value', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: 20.0 },
    });

    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('B');
  });

  test('filter by Number with eq operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { eq: 10.5 } },
    });

    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('A');
  });

  test('filter by Number with neq operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { neq: 20.0 } },
    });

    expect(results.length).toBe(2);
  });

  test('filter by Number with gt operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { gt: 20.0 } },
    });

    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('C');
  });

  test('filter by Number with gte operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { gte: 20.0 } },
    });

    expect(results.length).toBe(2);
  });

  test('filter by Number with lt operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { lt: 20.0 } },
    });

    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('A');
  });

  test('filter by Number with lte operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { lte: 20.0 } },
    });

    expect(results.length).toBe(2);
  });

  test('filter by Number with between operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { between: [15.0, 25.0] } },
    });

    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('B');
  });

  test('filter by Number with in operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { in: [10.5, 30.5] } },
    });

    expect(results.length).toBe(2);
  });

  test('filter by Number with notIn operator', async () => {
    const results = await client.db.NumberBasic.findMany({
      where: { price: { notIn: [20.0] } },
    });

    expect(results.length).toBe(2);
  });
});
