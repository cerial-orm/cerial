import { describe, expect, test } from 'bun:test';
import { CerialDecimal } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Decimal: Array', () => {
  const { getClient } = setupDataTypeTests(tables.decimal);

  test('create with decimal array', async () => {
    const client = getClient();
    const result = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null, amounts: [1.5, '2.5', 3.5] },
    });

    expect(result.amounts).toHaveLength(3);
    result.amounts.forEach((d: CerialDecimal) => expect(CerialDecimal.is(d)).toBe(true));
  });

  test('update with array push', async () => {
    const client = getClient();
    const created = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null, amounts: ['1.0'] },
    });

    const updated = await client.db.DecimalBasic.updateUnique({
      where: { id: created.id },
      data: { amounts: { push: '2.0' } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.amounts).toHaveLength(2);
  });

  test('update with array push multiple', async () => {
    const client = getClient();
    const created = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null, amounts: ['1.0'] },
    });

    const updated = await client.db.DecimalBasic.updateUnique({
      where: { id: created.id },
      data: { amounts: { push: ['2.0', '3.0'] } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.amounts).toHaveLength(3);
  });

  test('update with array full replace', async () => {
    const client = getClient();
    const created = await client.db.DecimalBasic.create({
      data: { name: 'test', price: 10, tax: null, amounts: ['1.0', '2.0'] },
    });

    const updated = await client.db.DecimalBasic.updateUnique({
      where: { id: created.id },
      data: { amounts: ['10.0', '20.0', '30.0'] },
    });

    expect(updated).not.toBeNull();
    expect(updated!.amounts).toHaveLength(3);
  });

  test('where has on array', async () => {
    const client = getClient();
    await client.db.DecimalBasic.create({
      data: { name: 'a', price: 1, tax: null, amounts: [10, 20] },
    });
    await client.db.DecimalBasic.create({
      data: { name: 'b', price: 1, tax: null, amounts: [30, 40] },
    });

    const results = await client.db.DecimalBasic.findMany({
      where: { amounts: { has: 10 } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('a');
  });

  test('where isEmpty on array', async () => {
    const client = getClient();
    await client.db.DecimalBasic.create({
      data: { name: 'empty', price: 1, tax: null },
    });
    await client.db.DecimalBasic.create({
      data: { name: 'full', price: 1, tax: null, amounts: [1] },
    });

    const results = await client.db.DecimalBasic.findMany({
      where: { amounts: { isEmpty: true } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('empty');
  });
});
