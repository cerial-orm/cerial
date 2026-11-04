import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDecimal } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const SET_TABLES = tables.set;

const strings = (values: readonly CerialDecimal[]): string[] => values.map((v) => v.toString());

describe('E2E Set: Decimal[]', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, SET_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, SET_TABLES);
  });

  test('create deduplicates equal decimals given as number, string and CerialDecimal', async () => {
    const result = await client.db.SetDecimal.create({
      data: { name: 'dedup', prices: [1.5, '1.5', CerialDecimal.from('2.5'), 2.5] },
    });

    expect(result.prices.every((d) => CerialDecimal.is(d))).toBe(true);
    expect(strings(result.prices)).toEqual(['1.5', '2.5']);
  });

  test('create with an empty list stores an empty set', async () => {
    const result = await client.db.SetDecimal.create({ data: { name: 'empty', prices: [] } });

    expect(result.prices).toHaveLength(0);
  });

  test('update replaces the set and deduplicates', async () => {
    const created = await client.db.SetDecimal.create({ data: { name: 'u', prices: [1, 2] } });
    const [updated] = await client.db.SetDecimal.updateMany({
      where: { id: created.id },
      data: { prices: ['9.5', 9.5, '3'] },
    });

    expect(strings(updated!.prices)).toEqual(['3', '9.5']);
  });

  test('push adds a new decimal and ignores an existing one', async () => {
    const created = await client.db.SetDecimal.create({ data: { name: 'p', prices: ['1.5', '2.5'] } });
    await client.db.SetDecimal.updateMany({ where: { id: created.id }, data: { prices: { push: '1.5' } } });
    await client.db.SetDecimal.updateMany({ where: { id: created.id }, data: { prices: { push: '0.5' } } });

    const found = await client.db.SetDecimal.findOne({ where: { id: created.id } });
    expect(strings(found!.prices)).toEqual(['0.5', '1.5', '2.5']);
  });

  test('unset removes a decimal and leaves the others', async () => {
    const created = await client.db.SetDecimal.create({ data: { name: 'r', prices: ['1.5', '2.5'] } });
    await client.db.SetDecimal.updateMany({ where: { id: created.id }, data: { prices: { unset: '1.5' } } });

    const found = await client.db.SetDecimal.findOne({ where: { id: created.id } });
    expect(strings(found!.prices)).toEqual(['2.5']);
  });

  test('upsert creates then updates the set', async () => {
    const where = { id: 'set_decimal:ups' };
    const first = await client.db.SetDecimal.upsert({
      where,
      create: { name: 'ups', prices: [1, 1, 2] },
      update: { prices: [5, 5] },
      return: 'after',
    });
    expect(strings(first!.prices)).toEqual(['1', '2']);

    const second = await client.db.SetDecimal.upsert({
      where,
      create: { name: 'ups', prices: [1] },
      update: { prices: [5, 5] },
      return: 'after',
    });
    expect(strings(second!.prices)).toEqual(['5']);
  });
});
