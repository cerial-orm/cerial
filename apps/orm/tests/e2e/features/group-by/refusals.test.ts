import { describe, expect, test } from 'bun:test';
import { refuse, seedOrders, useGroupByClient } from './helpers';

const getClient = useGroupByClient();

describe('groupBy refuses keys, naming the field, before any query runs', () => {
  test.each([
    ['a missing by', {}],
    ['an empty by', { by: {} }],
    ['a by that is not an object', { by: 'label' }],
  ])('%s', async (_name, args) => {
    expect(await refuse(getClient().db.GbOrder, args)).toContain('by');
  });

  test('an unknown key', async () => {
    expect(await refuse(getClient().db.GbOrder, { by: { nope: true } })).toContain("'nope'");
  });

  test.each([
    ['an object without sub-keys', { address: true }, 'address'],
    ['a forward relation', { author: true }, 'author'],
    ['a reverse relation', { tags: true }, 'tags'],
    ['a flag that is not true', { label: false }, 'label'],
  ])('%s as a key', async (_name, by, field) => {
    expect(await refuse(getClient().db.GbOrder, { by })).toContain(`'${field}'`);
  });

  test('an unknown or empty object sub-key', async () => {
    const db = getClient().db.GbOrder;
    expect(await refuse(db, { by: { address: { nope: true } } })).toContain('address.nope');
    expect(await refuse(db, { by: { address: {} } })).toContain('address');
  });

  test('a sub-key on a non-object field', async () => {
    expect(await refuse(getClient().db.GbOrder, { by: { label: { x: true } } })).toContain('label');
  });

  test('a key named like an aggregate', async () => {
    expect(await refuse(getClient().db.GbOrder, { by: { _count: true } })).toContain('_count');
  });
});

describe('groupBy refuses aggregates the field cannot feed', () => {
  test.each([
    ['_sum', 'label'],
    ['_sum', 'paid'],
    ['_sum', 'placed'],
    ['_sum', 'ttl'],
    ['_sum', 'status'],
    ['_avg', 'label'],
    ['_avg', 'ref'],
    ['_sum', 'codes'],
    ['_min', 'codes'],
    ['_max', 'tagIds'],
    ['_min', 'address'],
    ['_group', 'address'],
    ['_sum', 'author'],
  ])('%s over %s', async (aggregate, field) => {
    const message = await refuse(getClient().db.GbOrder, { by: { label: true }, [aggregate]: { [field]: true } });
    expect(message).toContain(`${aggregate}.${field}`);
  });

  test('an unknown aggregate field and a flag that is not true', async () => {
    const db = getClient().db.GbOrder;
    expect(await refuse(db, { by: { label: true }, _sum: { nope: true } })).toContain('_sum.nope');
    expect(await refuse(db, { by: { label: true }, _sum: { qty: false } })).toContain('_sum.qty');
  });

  test('an empty aggregate', async () => {
    expect(await refuse(getClient().db.GbOrder, { by: { label: true }, _count: {} })).toContain('_count');
  });

  test('an aggregate that collides with a group key', async () => {
    const message = await refuse(getClient().db.GbOrder, { by: { label: true, _sum: true }, _sum: { qty: true } });
    expect(message).toContain('_sum');
  });
});

describe('groupBy refuses options it does not take', () => {
  test.each([['select'], ['include'], ['compute'], ['unset'], ['return'], ['having'], ['nope']])(
    '%s',
    async (option) => {
      const message = await refuse(getClient().db.GbOrder, { by: { label: true }, [option]: {} });
      expect(message).toContain(option);
    },
  );
});

describe('groupBy refuses orderBy it cannot honour', () => {
  test('an aggregate or field the call does not request', async () => {
    const db = getClient().db.GbOrder;
    expect(await refuse(db, { by: { label: true }, orderBy: { _sum: { qty: 'asc' } } })).toContain('_sum.qty');
    expect(await refuse(db, { by: { label: true }, _count: true, orderBy: { _count: { qty: 'asc' } } })).toContain(
      '_count.qty',
    );
  });

  test('a field that is not a group key', async () => {
    expect(await refuse(getClient().db.GbOrder, { by: { label: true }, orderBy: { qty: 'asc' } })).toContain('qty');
  });

  test('_group, a bad direction and an object key without a sub-key', async () => {
    const db = getClient().db.GbOrder;
    expect(
      await refuse(db, { by: { label: true }, _group: { qty: true }, orderBy: { _group: { qty: 'asc' } } }),
    ).toContain('_group');
    expect(await refuse(db, { by: { label: true }, orderBy: { label: 'up' } })).toContain('label');
    expect(await refuse(db, { by: { address: { city: true } }, orderBy: { address: 'asc' } })).toContain('address');
  });

  test('an orderBy that is not an object', async () => {
    expect(await refuse(getClient().db.GbOrder, { by: { label: true }, orderBy: 'label' })).toContain('orderBy');
  });
});

describe('groupBy refuses bad where and paging', () => {
  test('a where on an unknown field', async () => {
    expect(await refuse(getClient().db.GbOrder, { by: { label: true }, where: { nope: 1 } })).toContain('nope');
  });

  test.each([[-1], [1.5], [Number.NaN]])('limit %p', async (limit) => {
    expect(await refuse(getClient().db.GbOrder, { by: { label: true }, limit })).toContain('limit');
  });

  test.each([[-1], [1.5]])('offset %p', async (offset) => {
    expect(await refuse(getClient().db.GbOrder, { by: { label: true }, offset })).toContain('offset');
  });

  test('a refused call changes nothing', async () => {
    const client = getClient();
    await seedOrders(client, [{}]);
    await refuse(client.db.GbOrder, { by: { nope: true } });
    expect(await client.db.GbOrder.count()).toBe(1);
  });
});
