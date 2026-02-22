import { describe, expect, test } from 'bun:test';
import { CerialDecimal } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Decimal: Negative / Edge Cases', () => {
  const { getClient } = setupDataTypeTests(tables.decimal);

  test('non-numeric string is coerced to zero by SurrealDB', async () => {
    const client = getClient();

    const result = await client.db.DecimalBasic.create({
      data: { name: 'bad-dec', price: 'abc', tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.toString()).toBe('0');
  });

  test('empty string is coerced to zero by SurrealDB', async () => {
    const client = getClient();

    const result = await client.db.DecimalBasic.create({
      data: { name: 'empty-dec', price: '', tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.toString()).toBe('0');
  });

  test('NaN is coerced to zero by SurrealDB', async () => {
    const client = getClient();

    const result = await client.db.DecimalBasic.create({
      data: { name: 'nan-dec', price: NaN, tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.toString()).toBe('0');
  });

  test('Infinity is coerced to zero by SurrealDB', async () => {
    const client = getClient();

    const result = await client.db.DecimalBasic.create({
      data: { name: 'inf-dec', price: Infinity, tax: null },
    });

    expect(CerialDecimal.is(result.price)).toBe(true);
    expect(result.price.toString()).toBe('0');
  });

  test('rejects boolean as decimal value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DecimalBasic.create({
          // @ts-expect-error — intentionally passing boolean instead of CerialDecimalInput
          data: { name: 'bool-dec', price: true, tax: null },
        });
      })(),
    ).rejects.toThrow();
  });
});
