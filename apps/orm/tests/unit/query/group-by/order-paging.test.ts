import { describe, expect, test } from 'bun:test';
import { compile } from './helpers';

describe('groupBy orderBy, limit and offset', () => {
  test('orders by a key, uppercasing the direction', () => {
    expect(compile({ by: { status: true }, orderBy: { status: 'desc' } }).text).toBe(
      'SELECT status FROM order GROUP BY status ORDER BY status DESC',
    );
    expect(compile({ by: { status: true }, orderBy: { status: 'ASC' } }).text).toContain('ORDER BY status ASC');
  });

  test('orders by a requested aggregate through its alias', () => {
    expect(compile({ by: { status: true }, _count: true, orderBy: { _count: { _all: 'desc' } } }).text).toBe(
      'SELECT status, count() AS _count._all FROM order GROUP BY status ORDER BY _count._all DESC',
    );
  });

  test('aggregate and key orderings combine in the order written', () => {
    const text = compile({
      by: { status: true },
      _sum: { qty: true },
      orderBy: { _sum: { qty: 'asc' }, status: 'desc' },
    }).text;
    expect(text).toContain('ORDER BY _sum.qty ASC, status DESC');
  });

  test('assumes: a nested key orders by its dotted path', () => {
    expect(compile({ by: { address: { city: true } }, orderBy: { address: { city: 'asc' } } }).text).toBe(
      'SELECT address.city FROM order GROUP BY address.city ORDER BY address.city ASC',
    );
  });

  test('an orderBy that names nothing adds no ORDER BY, and an undefined direction is skipped', () => {
    expect(compile({ by: { status: true }, orderBy: {} }).text).not.toContain('ORDER BY');
    expect(compile({ by: { status: true }, orderBy: { status: undefined } }).text).not.toContain('ORDER BY');
  });

  test('limit and offset follow ORDER BY as LIMIT and START, 0 included', () => {
    expect(compile({ by: { status: true }, orderBy: { status: 'asc' }, limit: 10, offset: 5 }).text).toBe(
      'SELECT status FROM order GROUP BY status ORDER BY status ASC LIMIT 10 START 5',
    );
    expect(compile({ by: { status: true }, limit: 0, offset: 0 }).text).toBe(
      'SELECT status FROM order GROUP BY status LIMIT 0 START 0',
    );
  });

  test('where, group, order and paging keep the SurrealQL clause order', () => {
    const { text } = compile({
      by: { status: true },
      where: { qty: { gt: 1 } },
      _count: true,
      orderBy: { status: 'asc' },
      limit: 2,
      offset: 1,
    });
    const at = ['WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'START'].map((k) => text.indexOf(k));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at.every((i) => i > 0)).toBe(true);
  });
});
