import { describe, expect, test } from 'bun:test';
import { CerialDecimal } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Decimal: Decorators', () => {
  const { getClient } = setupDataTypeTests(tables.decimal);

  test('@default fills when not provided', async () => {
    const client = getClient();
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test' },
    });

    expect(CerialDecimal.is(result.defaultPrice)).toBe(true);
    expect(result.defaultPrice.toNumber()).toBeCloseTo(99.99);
  });

  test('@default can be overridden', async () => {
    const client = getClient();
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test', defaultPrice: 50 },
    });

    expect(result.defaultPrice.toNumber()).toBeCloseTo(50);
  });

  test('@defaultAlways fills when not provided', async () => {
    const client = getClient();
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test' },
    });

    expect(CerialDecimal.is(result.alwaysPrice)).toBe(true);
    expect(result.alwaysPrice!.isZero()).toBe(true);
  });

  test('@defaultAlways resets on update when absent', async () => {
    const client = getClient();
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
    const client = getClient();
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test', alwaysPrice: 123 },
    });

    expect(result.alwaysPrice!.toNumber()).toBeCloseTo(123);
  });

  test('both decorators work together', async () => {
    const client = getClient();
    const result = await client.db.DecimalDecorated.create({
      data: { name: 'test' },
    });

    expect(result.defaultPrice.toNumber()).toBeCloseTo(99.99);
    expect(result.alwaysPrice!.isZero()).toBe(true);
  });
});
