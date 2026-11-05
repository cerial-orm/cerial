import { describe, expect, test } from 'bun:test';
import { CerialDecimal } from 'cerial';
import { AGGREGATE_ROWS, orderData, seedOrders, useGroupByClient } from './helpers';

const getClient = useGroupByClient();

describe('groupBy in $transaction', () => {
  test('array mode maps the rows exactly as a standalone call does', async () => {
    const client = getClient();
    await seedOrders(client, AGGREGATE_ROWS);
    const args = {
      by: { label: true },
      _count: true,
      _sum: { price: true, qty: true },
      _avg: { qty: true },
      _min: { placed: true },
      orderBy: { label: 'asc' },
    } as const;
    const [inTxn] = await client.$transaction([client.db.GbOrder.groupBy(args)]);
    const standalone = await client.db.GbOrder.groupBy(args);

    expect(inTxn).toEqual(standalone);
    expect(inTxn[0]!._sum.price).toBeInstanceOf(CerialDecimal);
    expect(inTxn[0]!._min.placed).toBeInstanceOf(Date);
  });

  test('array mode returns a groupBy beside other items, each with its own result', async () => {
    const client = getClient();
    await seedOrders(client, AGGREGATE_ROWS);
    const [groups, total, empty] = await client.$transaction([
      client.db.GbOrder.groupBy({ by: { label: true }, _count: true, orderBy: { label: 'asc' } }),
      client.db.GbOrder.count(),
      client.db.GbOrder.groupBy({ by: { label: true }, where: { label: 'none' } }),
    ]);
    expect(groups.map((g) => g._count._all)).toEqual([2, 1]);
    expect(total).toBe(3);
    expect(empty).toEqual([]);
  });

  test('array mode applies NONE, null and empty-sum mapping to a group item', async () => {
    const client = getClient();
    await seedOrders(client, [{ nick: null }, {}]);
    const [rows] = await client.$transaction([
      client.db.GbOrder.groupBy({ by: { nick: true }, _sum: { bonus: true }, _avg: { bonus: true } }),
    ]);
    const none = rows.find((r) => !('nick' in r))!;
    const nul = rows.find((r) => r.nick === null)!;
    expect(none._sum.bonus.toString()).toBe('0');
    expect(nul._avg.bonus).toBeNull();
  });

  test('array mode: a function item sees the writes before it', async () => {
    const client = getClient();
    const [created, groups] = await client.$transaction([
      client.db.GbOrder.create({ data: orderData({ label: 'fn', qty: 9 }) }),
      () => client.db.GbOrder.groupBy({ by: { label: true }, _sum: { qty: true } }),
    ]);
    expect(created.label).toBe('fn');
    expect(groups).toEqual([{ label: 'fn', _sum: { qty: 9 } }]);
  });

  test('callback mode groups rows the transaction wrote and has not committed', async () => {
    const client = getClient();
    const groups = await client.$transaction(async (tx) => {
      await tx.GbOrder.create({ data: orderData({ label: 'cb', qty: 2 }) });
      await tx.GbOrder.create({ data: orderData({ label: 'cb', qty: 3 }) });

      return tx.GbOrder.groupBy({ by: { label: true }, _count: true, _sum: { qty: true } });
    });
    expect(groups).toEqual([{ label: 'cb', _count: { _all: 2 }, _sum: { qty: 5 } }]);
    expect(await client.db.GbOrder.count()).toBe(2);
  });

  test('callback mode: the rows a rolled-back transaction grouped are gone', async () => {
    const client = getClient();
    await expect(
      client.$transaction(async (tx) => {
        await tx.GbOrder.create({ data: orderData({ label: 'rb' }) });
        const groups = await tx.GbOrder.groupBy({ by: { label: true }, _count: true });
        expect(groups).toEqual([{ label: 'rb', _count: { _all: 1 } }]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await client.db.GbOrder.groupBy({ by: { label: true } })).toEqual([]);
  });

  test('callback mode: a refused groupBy rejects the transaction and rolls it back', async () => {
    const client = getClient();
    await expect(
      client.$transaction(async (tx) => {
        await tx.GbOrder.create({ data: orderData() });
        // @ts-expect-error nope is not a field
        await tx.GbOrder.groupBy({ by: { nope: true } });
      }),
    ).rejects.toThrow('nope');

    expect(await client.db.GbOrder.count()).toBe(0);
  });

  test('manual mode groups inside the transaction and sees committed rows', async () => {
    const client = getClient();
    await seedOrders(client, AGGREGATE_ROWS);
    const txn = await client.$transaction();
    await txn.GbOrder.create({ data: orderData({ label: 'g2', qty: 7 }) });
    const rows = await txn.GbOrder.groupBy({ by: { label: true }, _sum: { qty: true }, orderBy: { label: 'asc' } });
    await txn.cancel();

    expect(rows).toEqual([
      { label: 'g1', _sum: { qty: 6 } },
      { label: 'g2', _sum: { qty: 7 } },
    ]);
    expect(await client.db.GbOrder.count()).toBe(3);
  });

  test('a refused item in array mode rejects before anything runs', async () => {
    const client = getClient();
    await expect(
      (async () => {
        await client.$transaction([
          client.db.GbOrder.create({ data: orderData() }),
          // @ts-expect-error nope is not a field
          client.db.GbOrder.groupBy({ by: { nope: true } }),
        ]);
      })(),
    ).rejects.toThrow('nope');

    expect(await client.db.GbOrder.count()).toBe(0);
  });
});
