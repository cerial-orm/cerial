import { describe, expect, test } from 'bun:test';
import { AGGREGATE_ROWS, seedOrders, useGroupByClient } from './helpers';

const getClient = useGroupByClient();

describe('groupBy where', () => {
  test('filters the rows before they are grouped', async () => {
    const client = getClient();
    await seedOrders(client, AGGREGATE_ROWS);
    const rows = await client.db.GbOrder.groupBy({
      by: { label: true },
      where: { status: 'OPEN' },
      _count: true,
      _sum: { qty: true },
      orderBy: { label: 'asc' },
    });
    expect(rows).toEqual([
      { label: 'g1', _count: { _all: 1 }, _sum: { qty: 2 } },
      { label: 'g2', _count: { _all: 1 }, _sum: { qty: 0 } },
    ]);
  });

  test('a group whose rows are all filtered out does not appear', async () => {
    const client = getClient();
    await seedOrders(client, AGGREGATE_ROWS);
    const rows = await client.db.GbOrder.groupBy({ by: { label: true }, where: { label: 'g2' }, _count: true });
    expect(rows).toEqual([{ label: 'g2', _count: { _all: 1 } }]);
  });

  test('supports operators, OR and a NOT clause', async () => {
    const client = getClient();
    await seedOrders(client, AGGREGATE_ROWS);
    const db = client.db.GbOrder;
    const gt = await db.groupBy({ by: { label: true }, where: { qty: { gt: 1 } }, _count: true });
    expect(gt).toEqual([{ label: 'g1', _count: { _all: 2 } }]);
    const or = await db.groupBy({
      by: { label: true },
      where: { OR: [{ label: 'g2' }, { qty: 4 }] },
      _count: true,
      orderBy: { label: 'asc' },
    });
    expect(or.map((r) => [r.label, r._count._all])).toEqual([
      ['g1', 1],
      ['g2', 1],
    ]);
    const not = await db.groupBy({ by: { label: true }, where: { NOT: { label: 'g1' } }, _count: true });
    expect(not).toEqual([{ label: 'g2', _count: { _all: 1 } }]);
  });

  test('filters on an object sub-field', async () => {
    const client = getClient();
    await seedOrders(client, [{ address: { city: 'Oslo' } }, { address: { city: 'Bergen' } }]);
    const rows = await client.db.GbOrder.groupBy({
      by: { address: { city: true } },
      where: { address: { city: 'Oslo' } },
    });
    expect(rows).toEqual([{ address: { city: 'Oslo' } }]);
  });

  test('a where value that looks like SurrealQL is bound, not run', async () => {
    const client = getClient();
    await seedOrders(client, [{ label: "x' OR true --" }, { label: 'y' }]);
    const rows = await client.db.GbOrder.groupBy({
      by: { label: true },
      where: { label: "x' OR true --" },
      _count: true,
    });
    expect(rows).toEqual([{ label: "x' OR true --", _count: { _all: 1 } }]);
  });
});

describe('groupBy over no rows', () => {
  test('an empty table answers no groups', async () => {
    const client = getClient();
    expect(await client.db.GbOrder.groupBy({ by: { label: true }, _count: true, _sum: { qty: true } })).toEqual([]);
  });

  test('a where that matches nothing answers no groups', async () => {
    const client = getClient();
    await seedOrders(client, AGGREGATE_ROWS);
    const rows = await client.db.GbOrder.groupBy({
      by: { label: true },
      where: { label: 'missing' },
      _count: true,
      _sum: { price: true },
      _avg: { price: true },
      _min: { qty: true },
      _group: { qty: true },
    });
    expect(rows).toEqual([]);
  });
});

describe('groupBy on other models', () => {
  test('a model with no numeric field groups, counts, takes min, max and group', async () => {
    const client = getClient();
    await client.db.GbLabel.create({ data: { name: 'a', note: 'x' } });
    await client.db.GbLabel.create({ data: { name: 'a' } });
    await client.db.GbLabel.create({ data: { name: 'b' } });
    const rows = await client.db.GbLabel.groupBy({
      by: { name: true },
      _count: { _all: true, note: true },
      _min: { note: true },
      _max: { name: true },
      _group: { note: true },
      orderBy: { name: 'asc' },
    });
    expect(rows).toEqual([
      { name: 'a', _count: { _all: 2, note: 1 }, _min: { note: 'x' }, _max: { name: 'a' }, _group: { note: ['x'] } },
      { name: 'b', _count: { _all: 1, note: 0 }, _min: { note: null }, _max: { name: 'b' }, _group: { note: [] } },
    ]);
  });

  test('a model whose only field is its id groups by the id', async () => {
    const client = getClient();
    await client.db.GbBare.create({ data: {} });
    await client.db.GbBare.create({ data: {} });
    const rows = await client.db.GbBare.groupBy({ by: { id: true }, _count: true });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r._count._all === 1)).toBe(true);
  });
});
