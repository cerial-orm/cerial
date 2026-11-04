/**
 * Unit Tests: Decimal where values
 *
 * SurrealDB 4.0 treats a float parameter as unequal to a decimal, so every value
 * reaching a decimal field must be bound as an SDK Decimal, never as a JS number.
 */

import { describe, expect, test } from 'bun:test';
import { Decimal } from 'surrealdb';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { CerialDecimal } from '../../../src/utils/cerial-decimal';
import { elem, field, model, tupleInfo } from './helpers';

const priceModel = model('Item', [
  field({ name: 'id', type: 'record', isId: true }),
  field({ name: 'name', type: 'string' }),
  field({ name: 'price', type: 'decimal' }),
  field({ name: 'amounts', type: 'decimal', isArray: true }),
  field({
    name: 'pricing',
    type: 'object',
    objectInfo: { objectName: 'Pricing', fields: [field({ name: 'amount', type: 'decimal' })] },
  }),
  field({
    name: 'pair',
    type: 'tuple',
    tupleInfo: tupleInfo('Pair', [elem({ index: 0, type: 'decimal' })]),
  }),
]);

function compile(where: Record<string, unknown>) {
  const ctx = createCompileContext();
  const result = buildConditions(ctx, where, priceModel);

  return { text: result.text, vars: result.vars };
}

function isDecimal(value: unknown, expected: string): boolean {
  return value instanceof Decimal && value.toString() === expected;
}

describe('Decimal where values are bound as decimals', () => {
  test.each([
    ['eq', { price: 0.1 }, 'price = $price_eq_0'],
    ['eq operator', { price: { eq: 0.1 } }, 'price = $price_eq_0'],
    ['neq', { price: { neq: 0.1 } }, 'price != $price_neq_0'],
    ['not', { price: { not: 0.1 } }, 'price != $price_not_0'],
    ['gt', { price: { gt: 0.1 } }, 'price > $price_gt_0'],
    ['gte', { price: { gte: 0.1 } }, 'price >= $price_gte_0'],
    ['lt', { price: { lt: 0.1 } }, 'price < $price_lt_0'],
    ['lte', { price: { lte: 0.1 } }, 'price <= $price_lte_0'],
  ])('%s binds a number as a Decimal', (_name, where, text) => {
    const { text: actual, vars } = compile(where);
    expect(actual).toBe(text);
    const bound = Object.values(vars);
    expect(bound).toHaveLength(1);
    expect(isDecimal(bound[0], '0.1')).toBe(true);
  });

  test('a CerialDecimal is bound as the same Decimal', () => {
    const { vars } = compile({ price: CerialDecimal.from('0.3') });
    expect(isDecimal(Object.values(vars)[0], '0.3')).toBe(true);
  });

  test('in and notIn bind every member as a Decimal', () => {
    for (const [op, text] of [
      ['in', 'price IN $price_in_0'],
      ['notIn', 'price NOT IN $price_notIn_0'],
    ] as const) {
      const { text: actual, vars } = compile({ price: { [op]: [0.1, CerialDecimal.from('0.2'), '0.3'] } });
      expect(actual).toBe(text);
      const bound = Object.values(vars)[0] as unknown[];
      expect(bound).toHaveLength(3);
      expect(isDecimal(bound[0], '0.1')).toBe(true);
      expect(isDecimal(bound[1], '0.2')).toBe(true);
      expect(isDecimal(bound[2], '0.3')).toBe(true);
    }
  });

  test('has, hasAll and hasAny bind decimals', () => {
    const has = compile({ amounts: { has: 0.1 } });
    expect(has.text).toBe('amounts CONTAINS $amounts_has_0');
    expect(isDecimal(Object.values(has.vars)[0], '0.1')).toBe(true);

    for (const [op, keyword] of [
      ['hasAll', 'CONTAINSALL'],
      ['hasAny', 'CONTAINSANY'],
    ] as const) {
      const { text, vars } = compile({ amounts: { [op]: [0.1, 0.2] } });
      expect(text).toBe(`amounts ${keyword} $amounts_${op}_0`);
      const bound = Object.values(vars)[0] as unknown[];
      expect(isDecimal(bound[0], '0.1')).toBe(true);
      expect(isDecimal(bound[1], '0.2')).toBe(true);
    }
  });

  test('a decimal inside an object is bound as a Decimal', () => {
    const { text, vars } = compile({ pricing: { amount: { gt: 0.1 } } });
    expect(text).toBe('pricing.amount > $pricing_amount_gt_0');
    expect(isDecimal(Object.values(vars)[0], '0.1')).toBe(true);
  });

  test('a decimal tuple element is bound as a Decimal', () => {
    const { text, vars } = compile({ pair: { 0: { lte: 0.1 } } });
    expect(text).toBe('pair[0] <= $pair_0__lte_0');
    expect(isDecimal(Object.values(vars)[0], '0.1')).toBe(true);
  });

  test('a non-decimal field keeps its number', () => {
    const m = model('Plain', [field({ name: 'score', type: 'float' })]);
    const ctx = createCompileContext();
    const result = buildConditions(ctx, { score: { gt: 0.1 } }, m);
    expect(Object.values(result.vars)).toEqual([0.1]);
  });
});
