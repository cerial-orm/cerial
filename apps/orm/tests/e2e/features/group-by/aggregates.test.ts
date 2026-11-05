import { describe, expect, test } from 'bun:test';
import { CerialDecimal, CerialDuration, CerialUuid } from 'cerial';
import { AGGREGATE_ROWS, seedOrders, useGroupByClient } from './helpers';

const getClient = useGroupByClient();

/** The server does not promise the member order of array::group, so members compare sorted. */
const sorted = <T>(values: T[]): T[] => [...values].sort();

async function byLabel() {
  await seedOrders(getClient(), AGGREGATE_ROWS);
}

describe('groupBy _count', () => {
  test('_count: true counts the rows of each group as _all', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({ by: { label: true }, _count: true, orderBy: { label: 'asc' } });
    expect(rows).toEqual([
      { label: 'g1', _count: { _all: 2 } },
      { label: 'g2', _count: { _all: 1 } },
    ]);
  });

  test('{ _all: true } is the same as _count: true', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _count: { _all: true },
      orderBy: { label: 'asc' },
    });
    expect(rows.map((r) => r._count._all)).toEqual([2, 1]);
  });

  test('a field counts present values: zero and false count, NONE does not', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _count: { _all: true, qty: true, paid: true, bonus: true, region: true },
      orderBy: { label: 'asc' },
    });
    expect(rows[0]!._count).toEqual({ _all: 2, qty: 2, paid: 2, bonus: 1, region: 0 });
    // g2 holds qty 0 and paid false, which a bare count(field) would miss
    expect(rows[1]!._count).toEqual({ _all: 1, qty: 1, paid: 1, bonus: 1, region: 0 });
  });

  test('null does not count as present', async () => {
    const client = getClient();
    await seedOrders(client, [{ nick: null }, { nick: 'a' }, {}]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _count: { _all: true, nick: true } });
    expect(row!._count).toEqual({ _all: 3, nick: 1 });
  });

  test('counts a field of every type', async () => {
    const client = getClient();
    await seedOrders(client, [{ altAddress: { city: 'Oslo' } }, {}]);
    const [row] = await client.db.GbOrder.groupBy({
      by: { paid: true },
      _count: {
        label: true,
        status: true,
        tier: true,
        paid: true,
        placed: true,
        ttl: true,
        ref: true,
        price: true,
        weight: true,
        units: true,
        codes: true,
        address: true,
        altAddress: true,
        authorId: true,
        tagIds: true,
      },
    });
    expect(row!._count).toEqual({
      label: 2,
      status: 2,
      tier: 2,
      paid: 2,
      placed: 2,
      ttl: 2,
      ref: 2,
      price: 2,
      weight: 2,
      units: 2,
      codes: 2,
      address: 2,
      altAddress: 1,
      authorId: 0,
      tagIds: 2,
    });
  });
});

describe('groupBy _sum and _avg', () => {
  test('sums and averages Int, Float, Number and a sized int', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _sum: { qty: true, weight: true, amount: true, units: true },
      _avg: { qty: true, weight: true, amount: true, units: true },
      orderBy: { label: 'asc' },
    });
    expect(rows[0]!._sum).toEqual({ qty: 6, weight: 4, amount: 30, units: 8 });
    expect(rows[0]!._avg).toEqual({ qty: 3, weight: 2, amount: 15, units: 4 });
    expect(rows[1]!._sum).toEqual({ qty: 0, weight: 0, amount: 5, units: 0 });
    expect(rows[1]!._avg).toEqual({ qty: 0, weight: 0, amount: 5, units: 0 });
  });

  test('a Decimal sum and average are CerialDecimal and keep decimal precision', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _sum: { price: true },
      _avg: { price: true },
      orderBy: { label: 'asc' },
    });
    const [g1, g2] = rows;
    expect(g1!._sum.price).toBeInstanceOf(CerialDecimal);
    expect(g1!._sum.price.toString()).toBe('3.35');
    expect(g1!._avg.price).toBeInstanceOf(CerialDecimal);
    expect(g1!._avg.price!.toString()).toBe('1.675');
    expect(g2!._sum.price.toString()).toBe('3.3');
    expect(g2!._avg.price!.toString()).toBe('3.3');
  });

  test('an optional Decimal skips absent values', async () => {
    await byLabel();
    const [g1] = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      where: { label: 'g1' },
      _sum: { bonus: true },
      _avg: { bonus: true },
    });
    expect(g1!._sum.bonus.toString()).toBe('0.5');
    expect(g1!._avg.bonus!.toString()).toBe('0.5');
  });

  test('a group with no value sums to 0 (a CerialDecimal for a Decimal) and averages to null', async () => {
    const client = getClient();
    await seedOrders(client, [{ label: 'none' }]);
    const [row] = await client.db.GbOrder.groupBy({
      by: { label: true },
      _sum: { bonus: true, qty: true },
      _avg: { bonus: true, qty: true },
    });
    expect(row!._sum.bonus).toBeInstanceOf(CerialDecimal);
    expect(row!._sum.bonus.toString()).toBe('0');
    expect(row!._sum.qty).toBe(1);
    expect(row!._avg.bonus).toBeNull();
    expect(row!._avg.qty).toBe(1);
  });

  test('an average of a sized float is a number', async () => {
    const client = getClient();
    await seedOrders(client, [{ weight: 1 }, { weight: 2 }]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _avg: { weight: true } });
    expect(row!._avg.weight).toBe(1.5);
  });
});

describe('groupBy _min and _max', () => {
  test('orders numbers, decimals, strings, bools, dates, durations and enums', async () => {
    await byLabel();
    const [g1] = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      where: { label: 'g1' },
      _min: { qty: true, price: true, label: true, paid: true, placed: true, ttl: true, status: true, tier: true },
      _max: { qty: true, price: true, label: true, paid: true, placed: true, ttl: true, status: true, tier: true },
    });
    expect(g1!._min.qty).toBe(2);
    expect(g1!._max.qty).toBe(4);
    expect(g1!._min.price).toBeInstanceOf(CerialDecimal);
    expect(g1!._min.price!.toString()).toBe('1.1');
    expect(g1!._max.price!.toString()).toBe('2.25');
    expect(g1!._min.label).toBe('g1');
    expect(g1!._max.label).toBe('g1');
    expect(g1!._min.paid).toBe(false);
    expect(g1!._max.paid).toBe(true);
    expect(g1!._min.placed).toBeInstanceOf(Date);
    expect(g1!._min.placed!.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(g1!._max.placed!.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(g1!._min.ttl).toBeInstanceOf(CerialDuration);
    expect(g1!._min.ttl!.toString()).toBe('30m');
    expect(g1!._max.ttl!.toString()).toBe('1h');
    expect(g1!._min.status).toBe('OPEN');
    expect(g1!._max.status).toBe('SHIPPED');
    expect(g1!._min.tier).toBe('free');
    expect(g1!._max.tier).toBe('pro');
  });

  test('a uuid maps to CerialUuid', async () => {
    const client = getClient();
    await seedOrders(client, [
      { ref: '00000000-0000-4000-8000-000000000001' },
      { ref: '00000000-0000-4000-8000-000000000002' },
    ]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _min: { ref: true }, _max: { ref: true } });
    expect(row!._min.ref).toBeInstanceOf(CerialUuid);
    expect(row!._min.ref!.toString()).toBe('00000000-0000-4000-8000-000000000001');
    expect(row!._max.ref!.toString()).toBe('00000000-0000-4000-8000-000000000002');
  });

  test('zero is a value, not an absence', async () => {
    await byLabel();
    const [g2] = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      where: { label: 'g2' },
      _min: { qty: true },
      _max: { qty: true },
    });
    expect(g2!._min.qty).toBe(0);
    expect(g2!._max.qty).toBe(0);
  });

  test('skips absent values, and a group with none gives null', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _min: { bonus: true, region: true },
      _max: { bonus: true, region: true },
      orderBy: { label: 'asc' },
    });
    expect(rows[0]!._min.bonus!.toString()).toBe('0.5');
    expect(rows[0]!._max.bonus!.toString()).toBe('0.5');
    expect(rows[0]!._min.region).toBeNull();
    expect(rows[0]!._max.region).toBeNull();
    expect(rows[1]!._min.bonus!.toString()).toBe('1.5');
  });

  test('skips null as well', async () => {
    const client = getClient();
    await seedOrders(client, [{ nick: null }, { nick: 'b' }, { nick: 'a' }]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _min: { nick: true }, _max: { nick: true } });
    expect(row!._min.nick).toBe('a');
    expect(row!._max.nick).toBe('b');
  });

  test('a group whose only value is null gives null', async () => {
    const client = getClient();
    await seedOrders(client, [{ nick: null }]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _min: { nick: true }, _max: { nick: true } });
    expect(row!._min.nick).toBeNull();
    expect(row!._max.nick).toBeNull();
  });
});

describe('groupBy _group', () => {
  test('collects the distinct values of each group in first-seen order', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _group: { qty: true, status: true, tier: true, paid: true },
      orderBy: { label: 'asc' },
    });
    expect(sorted(rows[0]!._group.qty)).toEqual([2, 4]);
    expect(sorted(rows[0]!._group.status)).toEqual(['OPEN', 'SHIPPED']);
    expect(sorted(rows[0]!._group.tier)).toEqual(['free', 'pro']);
    expect(sorted(rows[0]!._group.paid)).toEqual([false, true]);
    expect(rows[1]!._group.qty).toEqual([0]);
  });

  test('two equal values give one member', async () => {
    const client = getClient();
    await seedOrders(client, [{ qty: 7 }, { qty: 7 }, { qty: 8 }]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _group: { qty: true } });
    expect(sorted(row!._group.qty)).toEqual([7, 8]);
  });

  test('an array field is flattened one level and de-duplicated', async () => {
    await byLabel();
    const [g1, g2] = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _group: { codes: true },
      orderBy: { label: 'asc' },
    });
    expect(sorted(g1!._group.codes)).toEqual(['a', 'b', 'c']);
    expect(g2!._group.codes).toEqual([]);
  });

  test('drops NONE members', async () => {
    await byLabel();
    const [g1] = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      where: { label: 'g1' },
      _group: { bonus: true, region: true },
    });
    expect(g1!._group.bonus.map((d) => d.toString())).toEqual(['0.5']);
    expect(g1!._group.region).toEqual([]);
  });

  test('keeps null members on a @nullable field and drops them elsewhere', async () => {
    const client = getClient();
    await seedOrders(client, [{ nick: null }, { nick: 'a' }, {}]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _group: { nick: true } });
    expect([...row!._group.nick].sort()).toEqual(['a', null]);
  });

  test('maps record members to CerialId and decimals to CerialDecimal', async () => {
    const client = getClient();
    const author = await client.db.GbAuthor.create({ data: { name: 'A' } });
    await seedOrders(client, [{ authorId: author.id }, { authorId: author.id }]);
    const [row] = await client.db.GbOrder.groupBy({ by: { label: true }, _group: { authorId: true, price: true } });
    expect(row!._group.authorId).toHaveLength(1);
    expect(row!._group.authorId[0]!.toString()).toBe(author.id.toString());
    expect(row!._group.price[0]).toBeInstanceOf(CerialDecimal);
  });
});

describe('groupBy all aggregates together', () => {
  test('one call returns every requested aggregate for every group', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({
      by: { label: true },
      _count: true,
      _sum: { qty: true },
      _avg: { qty: true },
      _min: { qty: true },
      _max: { qty: true },
      _group: { qty: true },
      orderBy: { label: 'asc' },
    });
    const settled = rows.map((row) => ({ ...row, _group: { qty: sorted(row._group.qty) } }));
    expect(settled).toEqual([
      {
        label: 'g1',
        _count: { _all: 2 },
        _sum: { qty: 6 },
        _avg: { qty: 3 },
        _min: { qty: 2 },
        _max: { qty: 4 },
        _group: { qty: [2, 4] },
      },
      {
        label: 'g2',
        _count: { _all: 1 },
        _sum: { qty: 0 },
        _avg: { qty: 0 },
        _min: { qty: 0 },
        _max: { qty: 0 },
        _group: { qty: [0] },
      },
    ]);
  });

  test('a call with no aggregate returns only the keys', async () => {
    await byLabel();
    const rows = await getClient().db.GbOrder.groupBy({ by: { label: true }, orderBy: { label: 'asc' } });
    expect(rows).toEqual([{ label: 'g1' }, { label: 'g2' }]);
  });
});
