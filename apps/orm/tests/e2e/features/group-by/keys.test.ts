import { describe, expect, test } from 'bun:test';
import { CerialDecimal, CerialDuration, CerialId, CerialUuid } from 'cerial';
import { seedOrders, useGroupByClient } from './helpers';

const getClient = useGroupByClient();

describe('groupBy NONE and null keys', () => {
  test('NONE and null are separate groups; a NONE key is left off the row, a null key stays null', async () => {
    const client = getClient();
    await seedOrders(client, [{ nick: 'a' }, { nick: 'a' }, { nick: null }, {}, {}, {}]);
    const rows = await client.db.GbOrder.groupBy({ by: { nick: true }, _count: true });
    const none = rows.find((r) => !('nick' in r))!;
    const nul = rows.find((r) => r.nick === null)!;
    const named = rows.find((r) => r.nick === 'a')!;
    expect(rows).toHaveLength(3);
    expect(none._count._all).toBe(3);
    expect(Object.hasOwn(none, 'nick')).toBe(false);
    expect(nul._count._all).toBe(1);
    expect(named._count._all).toBe(2);
  });

  test('the default order sorts by key with NONE first, then null', async () => {
    const client = getClient();
    await seedOrders(client, [{ nick: 'b' }, { nick: null }, { nick: 'a' }, {}]);
    const rows = await client.db.GbOrder.groupBy({ by: { nick: true } });
    expect(rows.map((r) => ('nick' in r ? r.nick : 'NONE'))).toEqual(['NONE', null, 'a', 'b']);
  });

  test('an optional key without @nullable has a NONE group and no null group', async () => {
    const client = getClient();
    await seedOrders(client, [{ region: 'north' }, {}, {}]);
    const rows = await client.db.GbOrder.groupBy({ by: { region: true }, _count: true });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => !('region' in r))!._count._all).toBe(2);
    expect(rows.find((r) => r.region === 'north')!._count._all).toBe(1);
  });

  test('a NONE and a null key together with a present key', async () => {
    const client = getClient();
    await seedOrders(client, [{ region: 'n', nick: null }, { region: 'n' }, { nick: null }, {}]);
    const rows = await client.db.GbOrder.groupBy({ by: { region: true, nick: true }, _count: true });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r._count._all === 1)).toBe(true);
  });
});

describe('groupBy key types', () => {
  test.each([
    ['a string', { label: true }, 'label', 'x', 'y'],
    ['an int', { qty: true }, 'qty', 1, 2],
    ['a float', { weight: true }, 'weight', 1.5, 2.5],
    ['a number', { amount: true }, 'amount', 10, 20],
    ['a sized int', { units: true }, 'units', 1, 2],
    ['a bool', { paid: true }, 'paid', false, true],
    ['an enum', { status: true }, 'status', 'OPEN', 'SHIPPED'],
    ['a literal', { tier: true }, 'tier', 'free', 'pro'],
  ] as const)('%s key keeps its value', async (_type, by, field, first, second) => {
    const client = getClient();
    await seedOrders(client, [{ [field]: first }, { [field]: first }, { [field]: second }]);
    const rows = await client.db.GbOrder.groupBy({ by, _count: true });
    const counts = Object.fromEntries(
      rows.map((r) => [String(Object.entries(r).find(([k]) => k === field)?.[1]), r._count._all]),
    );
    expect(counts).toEqual({ [String(first)]: 2, [String(second)]: 1 });
  });

  test('a decimal key is a CerialDecimal', async () => {
    const client = getClient();
    await seedOrders(client, [{ price: '1.10' }, { price: '1.10' }, { price: '2.5' }]);
    const rows = await client.db.GbOrder.groupBy({ by: { price: true }, _count: true, orderBy: { price: 'asc' } });
    expect(rows[0]!.price).toBeInstanceOf(CerialDecimal);
    expect(rows.map((r) => [r.price.toString(), r._count._all])).toEqual([
      ['1.1', 2],
      ['2.5', 1],
    ]);
  });

  test('a date key is a Date', async () => {
    const client = getClient();
    const day = new Date('2026-05-05T00:00:00Z');
    await seedOrders(client, [{ placed: day }, { placed: day }, { placed: new Date('2026-05-06T00:00:00Z') }]);
    const rows = await client.db.GbOrder.groupBy({ by: { placed: true }, _count: true, orderBy: { placed: 'asc' } });
    expect(rows[0]!.placed).toBeInstanceOf(Date);
    expect(rows.map((r) => [r.placed.toISOString(), r._count._all])).toEqual([
      ['2026-05-05T00:00:00.000Z', 2],
      ['2026-05-06T00:00:00.000Z', 1],
    ]);
  });

  test('a duration key is a CerialDuration', async () => {
    const client = getClient();
    await seedOrders(client, [{ ttl: '1h' }, { ttl: '1h' }, { ttl: '2h' }]);
    const rows = await client.db.GbOrder.groupBy({ by: { ttl: true }, _count: true, orderBy: { ttl: 'asc' } });
    expect(rows[0]!.ttl).toBeInstanceOf(CerialDuration);
    expect(rows.map((r) => [r.ttl.toString(), r._count._all])).toEqual([
      ['1h', 2],
      ['2h', 1],
    ]);
  });

  test('a uuid key is a CerialUuid', async () => {
    const client = getClient();
    const ref = '00000000-0000-4000-8000-0000000000aa';
    await seedOrders(client, [{ ref }, { ref }, { ref: '00000000-0000-4000-8000-0000000000bb' }]);
    const rows = await client.db.GbOrder.groupBy({ by: { ref: true }, _count: true, orderBy: { ref: 'asc' } });
    expect(rows[0]!.ref).toBeInstanceOf(CerialUuid);
    expect(rows.map((r) => [r.ref.toString(), r._count._all])).toEqual([
      [ref, 2],
      ['00000000-0000-4000-8000-0000000000bb', 1],
    ]);
  });

  test('the id is a key: every record is its own group, as a CerialId', async () => {
    const client = getClient();
    await seedOrders(client, [{}, {}, {}]);
    const rows = await client.db.GbOrder.groupBy({ by: { id: true }, _count: true });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => CerialId.is(r.id) && r._count._all === 1)).toBe(true);
  });
});

describe('groupBy several keys', () => {
  test('groups by the combination of keys', async () => {
    const client = getClient();
    await seedOrders(client, [
      { status: 'OPEN', paid: true },
      { status: 'OPEN', paid: true },
      { status: 'OPEN', paid: false },
      { status: 'SHIPPED', paid: true },
    ]);
    const rows = await client.db.GbOrder.groupBy({
      by: { status: true, paid: true },
      _count: true,
      orderBy: { status: 'asc', paid: 'asc' },
    });
    expect(rows).toEqual([
      { status: 'OPEN', paid: false, _count: { _all: 1 } },
      { status: 'OPEN', paid: true, _count: { _all: 2 } },
      { status: 'SHIPPED', paid: true, _count: { _all: 1 } },
    ]);
  });
});

describe('groupBy object sub-keys', () => {
  test('groups by a declared sub-key and returns it nested', async () => {
    const client = getClient();
    await seedOrders(client, [
      { address: { city: 'Oslo' } },
      { address: { city: 'Oslo', zip: '0150' } },
      { address: { city: 'Bergen' } },
    ]);
    const rows = await client.db.GbOrder.groupBy({
      by: { address: { city: true } },
      _count: true,
      orderBy: { address: { city: 'asc' } },
    });
    expect(rows).toEqual([
      { address: { city: 'Bergen' }, _count: { _all: 1 } },
      { address: { city: 'Oslo' }, _count: { _all: 2 } },
    ]);
  });

  test('two sub-keys of one object group by their combination', async () => {
    const client = getClient();
    await seedOrders(client, [
      { address: { city: 'Oslo' } },
      { address: { city: 'Oslo', zip: '0150' } },
      { address: { city: 'Oslo', zip: '0150' } },
    ]);
    const rows = await client.db.GbOrder.groupBy({ by: { address: { city: true, zip: true } }, _count: true });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.address.zip === '0150')!._count._all).toBe(2);
    const noZip = rows.find((r) => r.address.zip === undefined)!;
    expect(noZip._count._all).toBe(1);
    expect(Object.hasOwn(noZip.address, 'zip')).toBe(false);
  });

  test('a sub-key beside a plain key', async () => {
    const client = getClient();
    await seedOrders(client, [
      { status: 'OPEN', address: { city: 'Oslo' } },
      { status: 'SHIPPED', address: { city: 'Oslo' } },
      { status: 'OPEN', address: { city: 'Oslo' } },
    ]);
    const rows = await client.db.GbOrder.groupBy({
      by: { status: true, address: { city: true } },
      _count: true,
      orderBy: { status: 'asc' },
    });
    expect(rows.map((r) => [r.status, r.address.city, r._count._all])).toEqual([
      ['OPEN', 'Oslo', 2],
      ['SHIPPED', 'Oslo', 1],
    ]);
  });

  test('an optional object: orders without it form a group of their own', async () => {
    const client = getClient();
    await seedOrders(client, [{ altAddress: { city: 'Oslo' } }, { altAddress: { city: 'Oslo' } }, {}]);
    const rows = await client.db.GbOrder.groupBy({ by: { altAddress: { city: true } }, _count: true });
    expect(rows).toHaveLength(2);
    const withCity = rows.find((r) => r.altAddress?.city === 'Oslo')!;
    expect(withCity._count._all).toBe(2);
    const without = rows.find((r) => r.altAddress?.city === undefined)!;
    expect(without._count._all).toBe(1);
    expect(without.altAddress?.city).toBeUndefined();
  });
});

describe('groupBy record and array keys', () => {
  test('a record FK key is a CerialId; orders with no author form a NONE group', async () => {
    const client = getClient();
    const a1 = await client.db.GbAuthor.create({ data: { name: 'A1' } });
    const a2 = await client.db.GbAuthor.create({ data: { name: 'A2' } });
    await seedOrders(client, [{ authorId: a1.id }, { authorId: a1.id }, { authorId: a2.id }, {}]);
    const rows = await client.db.GbOrder.groupBy({ by: { authorId: true }, _count: true });
    expect(rows).toHaveLength(3);
    const byAuthor = rows.find((r) => r.authorId && r.authorId.toString() === a1.id.toString())!;
    expect(CerialId.is(byAuthor.authorId)).toBe(true);
    expect(byAuthor._count._all).toBe(2);
    expect(rows.find((r) => r.authorId?.toString() === a2.id.toString())!._count._all).toBe(1);
    const none = rows.find((r) => !('authorId' in r))!;
    expect(none._count._all).toBe(1);
  });

  test('an array field groups by the whole array', async () => {
    const client = getClient();
    await seedOrders(client, [{ codes: ['a', 'b'] }, { codes: ['a', 'b'] }, { codes: ['a'] }, { codes: [] }]);
    const rows = await client.db.GbOrder.groupBy({ by: { codes: true }, _count: true, orderBy: { codes: 'asc' } });
    expect(rows).toEqual([
      { codes: [], _count: { _all: 1 } },
      { codes: ['a'], _count: { _all: 1 } },
      { codes: ['a', 'b'], _count: { _all: 2 } },
    ]);
  });

  test('a record array key maps each member to a CerialId', async () => {
    const client = getClient();
    const tag = await client.db.GbTag.create({ data: { name: 'T', orderIds: [] } });
    await seedOrders(client, [{ tagIds: [tag.id] }, { tagIds: [tag.id] }, { tagIds: [] }]);
    const rows = await client.db.GbOrder.groupBy({ by: { tagIds: true }, _count: true });
    expect(rows).toHaveLength(2);
    const tagged = rows.find((r) => r.tagIds.length === 1)!;
    expect(CerialId.is(tagged.tagIds[0])).toBe(true);
    expect(tagged.tagIds[0]!.toString()).toBe(tag.id.toString());
    expect(tagged._count._all).toBe(2);
  });
});
