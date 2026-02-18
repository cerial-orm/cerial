import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';
import { CerialDecimal, isCerialId } from 'cerial';

const DECIMAL_TABLES = tables.decimal;

describe('E2E Decimal: Nesting', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, DECIMAL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, DECIMAL_TABLES);
  });

  test('create with object containing decimal', async () => {
    const result = await client.db.DecimalWithObject.create({
      data: { name: 'test', pricing: { amount: '50.00' } },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(CerialDecimal.is(result.pricing.amount)).toBe(true);
    expect(result.pricing.amount.toString()).toBe('50');
  });

  test('create with object decimal optional present', async () => {
    const result = await client.db.DecimalWithObject.create({
      data: { name: 'test', pricing: { amount: 100, fee: '5.5' } },
    });

    expect(CerialDecimal.is(result.pricing.fee!)).toBe(true);
    expect(result.pricing.fee!.toString()).toBe('5.5');
  });

  test('create with object decimal optional absent', async () => {
    const result = await client.db.DecimalWithObject.create({
      data: { name: 'test', pricing: { amount: 100 } },
    });

    expect(result.pricing.fee).toBeUndefined();
  });

  test('update object decimal fields', async () => {
    const created = await client.db.DecimalWithObject.create({
      data: { name: 'test', pricing: { amount: 10 } },
    });

    const updated = await client.db.DecimalWithObject.updateUnique({
      where: { id: created.id },
      data: { pricing: { amount: 20 } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.pricing.amount.toString()).toBe('20');
  });

  test('create with tuple containing decimal', async () => {
    const result = await client.db.DecimalWithTuple.create({
      data: { name: 'test', pair: [10.5, null] },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(CerialDecimal.is(result.pair[0])).toBe(true);
    expect(result.pair[0].toString()).toBe('10.5');
    expect(result.pair[1]).toBeNull();
  });

  test('create with tuple both elements', async () => {
    const result = await client.db.DecimalWithTuple.create({
      data: { name: 'test', pair: ['99.99', '0.01'] },
    });

    expect(CerialDecimal.is(result.pair[0])).toBe(true);
    expect(CerialDecimal.is(result.pair[1]!)).toBe(true);
    expect(result.pair[0].toString()).toBe('99.99');
    expect(result.pair[1]!.toString()).toBe('0.01');
  });

  test('where filter on object decimal field', async () => {
    await client.db.DecimalWithObject.create({
      data: { name: 'low', pricing: { amount: 10 } },
    });
    await client.db.DecimalWithObject.create({
      data: { name: 'high', pricing: { amount: 100 } },
    });

    const results = await client.db.DecimalWithObject.findMany({
      where: { pricing: { amount: { gt: 50 } } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('high');
  });

  test('where filter on tuple decimal element', async () => {
    await client.db.DecimalWithTuple.create({
      data: { name: 'small', pair: [5, undefined] },
    });
    await client.db.DecimalWithTuple.create({
      data: { name: 'large', pair: [50, undefined] },
    });

    const results = await client.db.DecimalWithTuple.findMany({
      where: { pair: { 0: { gte: 50 } } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('large');
  });
});
