import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Decimal: Negative / Edge Cases', () => {
  const { getClient } = setupDataTypeTests(tables.decimal);

  test('rejects non-numeric string as decimal value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DecimalBasic.create({
          data: { name: 'bad-dec', price: 'abc', tax: null },
        });
      })(),
    ).rejects.toThrow(/price must be of type decimal/);
  });

  test('rejects empty string as decimal value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DecimalBasic.create({
          data: { name: 'empty-dec', price: '', tax: null },
        });
      })(),
    ).rejects.toThrow(/price must be of type decimal/);
  });

  test('rejects NaN as decimal value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DecimalBasic.create({
          data: { name: 'nan-dec', price: NaN, tax: null },
        });
      })(),
    ).rejects.toThrow(/price must be of type decimal/);
  });

  test('rejects Infinity as decimal value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DecimalBasic.create({
          data: { name: 'inf-dec', price: Infinity, tax: null },
        });
      })(),
    ).rejects.toThrow(/price must be of type decimal/);
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
