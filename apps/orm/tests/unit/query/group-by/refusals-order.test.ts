import { describe, expect, test } from 'bun:test';
import { validateGroupBy } from '../../../../src/query/validators';
import { order, problems, registry } from './helpers';

const by = { status: true, address: { city: true } };

describe('groupBy orderBy accepts', () => {
  test.each([
    ['a key', { status: 'asc' }],
    ['a nested key', { address: { city: 'desc' } }],
    ['a requested aggregate', { _count: { _all: 'desc' }, _sum: { qty: 'asc' } }],
    ['upper-case directions', { status: 'ASC' }],
    ['undefined values', { status: undefined, _count: { _all: undefined } }],
  ])('%s', (_name, orderBy) => {
    expect(problems({ by, _count: true, _sum: { qty: true }, orderBy })).toEqual([]);
  });
});

describe('groupBy orderBy refuses', () => {
  test('an aggregate the call does not request, naming it', () => {
    expect(problems({ by, orderBy: { _count: { _all: 'desc' } } })).toEqual([
      "Cannot order by '_count._all' — the call does not request _count._all, and only requested aggregates order groups",
    ]);
    expect(problems({ by, _sum: { qty: true }, orderBy: { _sum: { total: 'asc' } } })[0]).toContain("'_sum.total'");
    expect(problems({ by, _count: true, orderBy: { _count: { qty: 'asc' } } })[0]).toContain("'_count.qty'");
  });

  test('_group, which collects arrays', () => {
    expect(problems({ by, _group: { tags: true }, orderBy: { _group: { tags: 'asc' } } })).toEqual([
      "Cannot order by '_group' — it collects arrays, which have no order",
    ]);
  });

  test('an aggregate named without a field', () => {
    expect(problems({ by, _count: true, orderBy: { _count: 'desc' } })[0]).toContain(
      "Cannot order by '_count' directly",
    );
  });

  test('a model field that is not a group key', () => {
    expect(problems({ by, orderBy: { qty: 'asc' } })).toEqual([
      "Cannot order by 'qty' — it is not a group key of this call; only the keys in by and the requested aggregates order groups",
    ]);
  });

  test('a sub-key that is not a group key', () => {
    expect(problems({ by, orderBy: { address: { geo: { lat: 'asc' } } } })[0]).toContain(
      "Cannot order by 'address.geo'",
    );
  });

  test('an unknown field is an unknownField problem', () => {
    const found = validateGroupBy({ by, orderBy: { nope: 'asc' } }, order, registry);
    expect(found[0]).toMatchObject({ kind: 'unknownField', path: 'nope' });
  });

  test('a grouped object ordered as a whole', () => {
    expect(problems({ by, orderBy: { address: 'asc' } })[0]).toContain("Cannot order by 'address' directly");
  });

  test('a direction other than asc or desc, on keys and aggregates', () => {
    expect(problems({ by, orderBy: { status: 'up' } })).toEqual([
      "Order direction for 'status' must be 'asc' or 'desc', got \"up\"",
    ]);
    expect(problems({ by, orderBy: { status: 1 } })[0]).toContain("Order direction for 'status'");
    expect(problems({ by, _count: true, orderBy: { _count: { _all: 'desc; DROP' } } })[0]).toContain("'_count._all'");
    expect(problems({ by, orderBy: { address: { city: true } } })[0]).toContain("Order direction for 'address.city'");
  });

  test('an orderBy that is not an object', () => {
    for (const orderBy of ['status', 1, null, ['status']]) {
      expect(problems({ by, orderBy })[0]).toContain('orderBy must be an object');
    }
  });

  test('assumes: orderBy is not judged against keys that already failed, so one root cause is reported once', () => {
    expect(problems({ by: { nope: true }, orderBy: { nope: 'asc' } })).toHaveLength(1);
  });
});
