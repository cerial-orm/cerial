import { describe, expect, test } from 'bun:test';
import { seedOrders, useGroupByClient } from './helpers';

const getClient = useGroupByClient();

/** Three labels with 3, 2 and 1 orders and distinct quantities, so every ordering differs. */
async function seedLabels() {
  await seedOrders(getClient(), [
    { label: 'b', qty: 10 },
    { label: 'b', qty: 10 },
    { label: 'b', qty: 10 },
    { label: 'c', qty: 1 },
    { label: 'c', qty: 2 },
    { label: 'a', qty: 50 },
  ]);
}

const labels = (rows: { label: string }[]) => rows.map((r) => r.label);

describe('groupBy orderBy', () => {
  test('orders by a key ascending and descending', async () => {
    await seedLabels();
    const db = getClient().db.GbOrder;
    expect(labels(await db.groupBy({ by: { label: true }, orderBy: { label: 'asc' } }))).toEqual(['a', 'b', 'c']);
    expect(labels(await db.groupBy({ by: { label: true }, orderBy: { label: 'desc' } }))).toEqual(['c', 'b', 'a']);
  });

  test('accepts the uppercase direction the other methods accept', async () => {
    await seedLabels();
    const rows = await getClient().db.GbOrder.groupBy({ by: { label: true }, orderBy: { label: 'DESC' as 'desc' } });
    expect(labels(rows)).toEqual(['c', 'b', 'a']);
  });

  test('orders by the row count', async () => {
    await seedLabels();
    const db = getClient().db.GbOrder;
    expect(
      labels(await db.groupBy({ by: { label: true }, _count: true, orderBy: { _count: { _all: 'desc' } } })),
    ).toEqual(['b', 'c', 'a']);
    expect(
      labels(await db.groupBy({ by: { label: true }, _count: true, orderBy: { _count: { _all: 'asc' } } })),
    ).toEqual(['a', 'c', 'b']);
  });

  test('orders by a field count, sum, average, min and max', async () => {
    await seedLabels();
    const db = getClient().db.GbOrder;
    const sum = await db.groupBy({ by: { label: true }, _sum: { qty: true }, orderBy: { _sum: { qty: 'desc' } } });
    expect(labels(sum)).toEqual(['a', 'b', 'c']);
    const avg = await db.groupBy({ by: { label: true }, _avg: { qty: true }, orderBy: { _avg: { qty: 'asc' } } });
    expect(labels(avg)).toEqual(['c', 'b', 'a']);
    const min = await db.groupBy({ by: { label: true }, _min: { qty: true }, orderBy: { _min: { qty: 'asc' } } });
    expect(labels(min)).toEqual(['c', 'b', 'a']);
    const max = await db.groupBy({ by: { label: true }, _max: { qty: true }, orderBy: { _max: { qty: 'desc' } } });
    expect(labels(max)).toEqual(['a', 'b', 'c']);
    const count = await db.groupBy({
      by: { label: true },
      _count: { qty: true },
      orderBy: { _count: { qty: 'desc' } },
    });
    expect(labels(count)).toEqual(['b', 'c', 'a']);
  });

  test('orders by a Decimal sum numerically', async () => {
    const client = getClient();
    await seedOrders(client, [
      { label: 'x', price: '9.00' },
      { label: 'y', price: '10.50' },
      { label: 'z', price: '2.25' },
    ]);
    const rows = await client.db.GbOrder.groupBy({
      by: { label: true },
      _sum: { price: true },
      orderBy: { _sum: { price: 'desc' } },
    });
    expect(labels(rows)).toEqual(['y', 'x', 'z']);
  });

  test('an earlier orderBy entry wins over a later one', async () => {
    await seedLabels();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _count: true,
      orderBy: { _count: { _all: 'asc' }, label: 'desc' },
    });
    expect(labels(rows)).toEqual(['a', 'c', 'b']);
  });

  test('breaks a tie with a second key', async () => {
    const client = getClient();
    await seedOrders(client, [
      { label: 'x', status: 'SHIPPED' },
      { label: 'x', status: 'OPEN' },
      { label: 'y', status: 'OPEN' },
      { label: 'y', status: 'SHIPPED' },
    ]);
    const rows = await client.db.GbOrder.groupBy({
      by: { label: true, status: true },
      _count: true,
      orderBy: { _count: { _all: 'asc' }, label: 'desc', status: 'asc' },
    });
    expect(rows.map((r) => `${r.label}:${r.status}`)).toEqual(['y:OPEN', 'y:SHIPPED', 'x:OPEN', 'x:SHIPPED']);
  });

  test('orders by an object sub-key', async () => {
    const client = getClient();
    await seedOrders(client, [
      { address: { city: 'Oslo' } },
      { address: { city: 'Bergen' } },
      { address: { city: 'Trondheim' } },
    ]);
    const rows = await client.db.GbOrder.groupBy({
      by: { address: { city: true } },
      orderBy: { address: { city: 'desc' } },
    });
    expect(rows.map((r) => r.address.city)).toEqual(['Trondheim', 'Oslo', 'Bergen']);
  });
});

describe('groupBy limit and offset', () => {
  test('limit and offset page over groups, not rows', async () => {
    await seedLabels();
    const db = getClient().db.GbOrder;
    const base = { by: { label: true }, _count: true, orderBy: { label: 'asc' } } as const;
    expect(labels(await db.groupBy({ ...base, limit: 2 }))).toEqual(['a', 'b']);
    expect(labels(await db.groupBy({ ...base, limit: 2, offset: 1 }))).toEqual(['b', 'c']);
    expect(labels(await db.groupBy({ ...base, offset: 2 }))).toEqual(['c']);
  });

  test('paging follows the ordering by an aggregate', async () => {
    await seedLabels();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _count: true,
      orderBy: { _count: { _all: 'desc' } },
      limit: 1,
      offset: 1,
    });
    expect(rows).toEqual([{ label: 'c', _count: { _all: 2 } }]);
  });

  test('offset past the last group and limit 0 give no rows', async () => {
    await seedLabels();
    const db = getClient().db.GbOrder;
    expect(await db.groupBy({ by: { label: true }, offset: 10 })).toEqual([]);
    expect(await db.groupBy({ by: { label: true }, limit: 0 })).toEqual([]);
  });

  test('limit larger than the group count returns every group', async () => {
    await seedLabels();
    expect(await getClient().db.GbOrder.groupBy({ by: { label: true }, limit: 100 })).toHaveLength(3);
  });
});
