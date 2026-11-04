import { describe, expect, test } from 'bun:test';
import { compile } from './helpers';

describe('groupBy query shape: keys, where, bindings', () => {
  test('one key with no aggregate is a distinct-keys query', () => {
    expect(compile({ by: { status: true } })).toEqual({
      text: 'SELECT status FROM order GROUP BY status',
      vars: {},
    });
  });

  test('several keys group by their combination, in the order written', () => {
    expect(compile({ by: { status: true, paid: true } }).text).toBe(
      'SELECT status, paid FROM order GROUP BY status, paid',
    );
  });

  test('an object sub-key is a dotted path, and a deeper one extends it', () => {
    expect(compile({ by: { address: { city: true, geo: { lat: true } } } }).text).toBe(
      'SELECT address.city, address.geo.lat FROM order GROUP BY address.city, address.geo.lat',
    );
  });

  test('a record FK and an array field group like any other key (whole array)', () => {
    expect(compile({ by: { customerId: true, tags: true } }).text).toBe(
      'SELECT customerId, tags FROM order GROUP BY customerId, tags',
    );
  });

  test('where compiles through transformWhereClause and its values bind; the group clause follows it', () => {
    const query = compile({ by: { status: true }, where: { qty: { gte: 3 }, status: 'open' } });
    expect(query.text).toMatch(/^SELECT status FROM order WHERE .+ GROUP BY status$/);
    expect(query.text).not.toContain('3');
    expect(query.text).not.toContain("'open'");
    expect(Object.values(query.vars).sort()).toEqual([3, 'open']);
    for (const name of Object.keys(query.vars)) expect(query.text).toContain(`$${name}`);
  });

  test('a hostile where value is bound, never part of the text', () => {
    const payload = "x' OR true; REMOVE TABLE order; --";
    const query = compile({ by: { status: true }, where: { status: payload } });
    expect(query.text).not.toContain('REMOVE');
    expect(Object.values(query.vars)).toEqual([payload]);
  });

  test('no where adds no WHERE and no bindings', () => {
    expect(compile({ by: { status: true } }).vars).toEqual({});
  });
});
