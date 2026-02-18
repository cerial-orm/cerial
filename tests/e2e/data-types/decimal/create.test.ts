import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDecimal, isCerialId } from 'cerial';
import { Decimal } from 'surrealdb';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const DECIMAL_TABLES = tables.decimal;

describe('E2E Decimal: Create', () => {
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

  test('create with number input', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 19.99, tax: null },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('test');
    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.toNumber()).toBeCloseTo(19.99);
  });

  test('create with string input', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: '42.50', tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.toString()).toBe('42.5');
  });

  test('create with CerialDecimal input', async () => {
    const input = CerialDecimal.from('123.456');
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: input, tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.equals(input)).toBe(true);
  });

  test('create with SDK Decimal input', async () => {
    const native = new Decimal('99.99');
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: native, tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.toString()).toBe('99.99');
  });

  test('create with optional field present', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, discount: '5.5', tax: null },
    });

    expect(CerialDecimal.is(result.discount!)).toBe(true);
    expect(result.discount!.toString()).toBe('5.5');
  });

  test('create with optional field absent', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null },
    });

    expect(result.discount).toBeUndefined();
  });

  test('create with nullable field set to null', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null },
    });

    expect(result.tax).toBeNull();
  });

  test('create with nullable field set to value', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: '7.5' },
    });

    expect(CerialDecimal.is(result.tax!)).toBe(true);
    expect(result.tax!.toString()).toBe('7.5');
  });

  test('create with array field', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null, amounts: [1.5, '2.5', CerialDecimal.from('3.5')] },
    });

    expect(result.amounts).toHaveLength(3);
    expect(result.amounts.every((d: CerialDecimal) => CerialDecimal.is(d))).toBe(true);
  });

  test('create with empty array defaults', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null },
    });

    expect(result.amounts).toEqual([]);
  });

  test('create with zero value', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 0, tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.isZero()).toBe(true);
  });

  test('create with negative value', async () => {
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: -5.5, tax: null },
    });

    expect(result.price.isNegative()).toBe(true);
  });
});
