import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';
import { CerialDecimal } from 'cerial';

const DECIMAL_TABLES = tables.decimal;

describe('E2E Decimal: Where', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, DECIMAL_TABLES);

    await client.db.DecimalBasic.create({ data: { name: 'cheap', price: 10, tax: null } });
    await client.db.DecimalBasic.create({ data: { name: 'mid', price: 50, tax: '5' } });
    await client.db.DecimalBasic.create({ data: { name: 'expensive', price: 100, tax: '10' } });
  });

  afterAll(async () => {
    await client.disconnect();
  });

  test('direct value equality', async () => {
    const results = await client.db.DecimalBasic.findMany({ where: { price: 50 } });
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('mid');
  });

  test('CerialDecimal direct value', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { price: CerialDecimal.from(10) },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('cheap');
  });

  test('gt operator', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { price: { gt: 50 } },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('expensive');
  });

  test('gte operator', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { price: { gte: 50 } },
    });
    expect(results).toHaveLength(2);
    const names = results.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(['expensive', 'mid']);
  });

  test('lt operator', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { price: { lt: 50 } },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('cheap');
  });

  test('lte operator', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { price: { lte: 50 } },
    });
    expect(results).toHaveLength(2);
    const names = results.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(['cheap', 'mid']);
  });

  test('between operator', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { price: { between: [10, 50] } },
    });
    expect(results).toHaveLength(2);
  });

  test('in operator', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { price: { in: [10, 100] } },
    });
    expect(results).toHaveLength(2);
    const names = results.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(['cheap', 'expensive']);
  });

  test('nullable field: isNull true', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { tax: { isNull: true } },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('cheap');
  });

  test('nullable field: isNull false', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { tax: { isNull: false } },
    });
    expect(results).toHaveLength(2);
  });

  test('nullable field: null direct value', async () => {
    const results = await client.db.DecimalBasic.findMany({
      where: { tax: null },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('cheap');
  });
});
