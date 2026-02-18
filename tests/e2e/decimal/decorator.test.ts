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

describe('E2E Decimal: Decorators', () => {
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

  test('@default fills when not provided', async () => {
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test' },
    });

    expect(CerialDecimal.is(result.defaultPrice)).toBe(true);
    expect(result.defaultPrice.toNumber()).toBeCloseTo(99.99);
  });

  test('@default can be overridden', async () => {
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test', defaultPrice: 50 },
    });

    expect(result.defaultPrice.toNumber()).toBeCloseTo(50);
  });

  test('@defaultAlways fills when not provided', async () => {
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test' },
    });

    expect(CerialDecimal.is(result.alwaysPrice)).toBe(true);
    expect(result.alwaysPrice!.isZero()).toBe(true);
  });

  test('@defaultAlways resets on update when absent', async () => {
    const created = await client.db.DecimalDecorated.create({
      data: { name: 'test', alwaysPrice: 999 },
    });
    expect(created.alwaysPrice!.toNumber()).toBeCloseTo(999);

    const updated = await client.db.DecimalDecorated.updateUnique({
      where: { id: created.id },
      data: { name: 'updated' },
    });

    expect(updated).not.toBeNull();
    expect(updated!.alwaysPrice!.isZero()).toBe(true);
  });

  test('@defaultAlways can be overridden on create', async () => {
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test', alwaysPrice: 123 },
    });

    expect(result.alwaysPrice!.toNumber()).toBeCloseTo(123);
  });

  test('both decorators work together', async () => {
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test' },
    });

    expect(result.defaultPrice.toNumber()).toBeCloseTo(99.99);
    expect(result.alwaysPrice!.isZero()).toBe(true);
  });
});
