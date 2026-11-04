import { describe, expect, test } from 'bun:test';
import { validateGroupBy } from '../../../../src/query/validators';
import { order, problems, registry } from './helpers';

const by = { status: true };

describe('groupBy aggregates accept', () => {
  test.each([
    ['_count: true', { _count: true }],
    ['_count of every stored non-relation field', { _count: { _all: true, qty: true, address: true, tags: true } }],
    ['_sum of int, float, decimal', { _sum: { qty: true, weight: true, total: true } }],
    ['_avg of int, float, decimal', { _avg: { qty: true, weight: true, total: true } }],
    [
      '_min and _max of string, number, decimal, date, duration, uuid, bool, enum, record',
      {
        _min: {
          status: true,
          qty: true,
          total: true,
          createdAt: true,
          wait: true,
          ref: true,
          paid: true,
          kind: true,
          customerId: true,
        },
      },
    ],
    ['_group of scalars and arrays', { _group: { status: true, tags: true, scores: true, customerId: true } }],
  ])('%s', (_name, aggregates) => {
    expect(problems({ by, ...aggregates })).toEqual([]);
  });
});

describe('groupBy refuses aggregates, naming the field', () => {
  test('_sum and _avg over non-numerics: the server would answer 0, so the client refuses', () => {
    for (const aggregate of ['_sum', '_avg']) {
      for (const key of ['status', 'createdAt', 'wait', 'paid', 'ref', 'kind', 'customerId']) {
        expect(problems({ by, [aggregate]: { [key]: true } })[0]).toContain(`Cannot use '${aggregate}.${key}'`);
      }
    }
    expect(problems({ by, _sum: { status: true } })).toEqual([
      "Cannot use '_sum.status' on model Order — only numeric fields can be summed or averaged, and this is string in _sum",
    ]);
  });

  test('_sum, _avg, _min and _max over an array', () => {
    for (const aggregate of ['_sum', '_avg', '_min', '_max']) {
      expect(problems({ by, [aggregate]: { scores: true } })[0]).toContain(`'${aggregate}.scores'`);
    }
  });

  test('objects, tuples, bytes, geometry, any and relations in every value aggregate', () => {
    for (const aggregate of ['_sum', '_avg', '_min', '_max', '_group']) {
      for (const key of ['address', 'lines', 'pos', 'blob', 'shape', 'extra', 'customer', 'mixed']) {
        expect(problems({ by, [aggregate]: { [key]: true } })[0]).toContain(`Cannot use '${aggregate}.${key}'`);
      }
    }
  });

  test('a relation in _count', () => {
    expect(problems({ by, _count: { customer: true } })[0]).toContain("Cannot use '_count.customer'");
  });

  test('an unknown field is an unknownField problem naming the path', () => {
    for (const aggregate of ['_count', '_sum', '_avg', '_min', '_max', '_group']) {
      const found = validateGroupBy({ by, [aggregate]: { nope: true } }, order, registry);
      expect(found[0]).toMatchObject({ kind: 'unknownField', path: `${aggregate}.nope` });
    }
  });

  test('a sub-key path is not a field: aggregates take top-level fields', () => {
    expect(problems({ by, _sum: { address: { city: true } } })[0]).toContain('_sum.address');
  });

  test('an empty aggregate map', () => {
    expect(problems({ by, _sum: {} })).toEqual(['_sum is empty — name at least one field or leave it out']);
  });

  test('a value that is not true', () => {
    for (const value of [false, 1, 'x', null]) {
      expect(problems({ by, _sum: { qty: value } })).toEqual([`_sum.qty must be true, got ${JSON.stringify(value)}`]);
    }
  });

  test('an aggregate that is not an object; only _count takes true', () => {
    expect(problems({ by, _sum: true })).toEqual(['_sum must be an object of fields, got true']);
    expect(problems({ by, _count: 'all' })).toEqual(['_count must be true or an object of fields, got "all"']);
    expect(problems({ by, _min: [] })[0]).toContain('_min must be an object of fields');
  });

  test('a field named _all makes _count._all ambiguous', () => {
    const model = { ...order, fields: [...order.fields, { ...order.fields[1]!, name: '_all' }] };
    expect(problems({ by, _count: { _all: true } }, model)).toEqual([
      "_count._all is ambiguous: model Order has a field named '_all', which _count uses for the row count",
    ]);
  });
});

describe('groupBy refuses an aggregate whose name equals a group key', () => {
  const model = {
    ...order,
    fields: [...order.fields, { ...order.fields[1]!, name: '_count' }, { ...order.fields[1]!, name: '_sum' }],
  };

  test('a requested _count with a key named _count: the server breaks on this, so the client refuses', () => {
    expect(problems({ by: { _count: true }, _count: true }, model)).toEqual([
      "Aggregate '_count' collides with the group key '_count' on model Order — drop the aggregate or group by another field",
    ]);
  });

  test('every aggregate name collides when requested', () => {
    expect(problems({ by: { _sum: true }, _sum: { qty: true } }, model)[0]).toContain("'_sum' collides");
  });

  test('assumes: a key named like an aggregate that is not requested is allowed', () => {
    expect(problems({ by: { _count: true }, _sum: { qty: true } }, model)).toEqual([]);
  });
});
