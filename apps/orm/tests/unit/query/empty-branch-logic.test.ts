/**
 * Unit tests: an empty where branch is a condition that matches every row
 *
 * An empty branch (`{}`, `AND: []`, an empty object field, undefined values) compiles to no condition, which
 * the surrounding context reads as true. OR with such a branch is therefore always true, AND ignores it, and
 * NOT of it matches no row. Dropping the branch from an OR instead let a NOT around the OR widen the filter.
 */

import { describe, expect, test } from 'bun:test';
import { transformWhere } from '../../../src/query/filters/transformer';
import { handleAnd, handleNot, handleOr } from '../../../src/query/filters/logical-operators';
import type { WhereClause } from '../../../src/types';
import { field, model } from './helpers';

// astToRegistry does not populate objectInfo, so the object fields are built by hand
const addrInfo = { objectName: 'Addr', fields: [field({ name: 'street' })] };
const item = model('Item', [
  field({ name: 'id', type: 'record', isId: true }),
  field({ name: 'name' }),
  field({ name: 'addr', type: 'object', objectInfo: addrInfo }),
  field({ name: 'free', type: 'object', isFlexible: true, objectInfo: addrInfo }),
]);
const registry = { Item: item };
const compile = (where: Record<string, unknown>) => transformWhere(where as WhereClause, item, registry);

const shapes: Record<string, Record<string, unknown>> = {
  'empty object': {},
  'empty AND': { AND: [] },
  'OR of an empty object': { OR: [{}] },
  'NOT of an empty OR': { NOT: { OR: [] } },
  'empty object field': { addr: {} },
  'empty flexible field': { free: {} },
  'undefined value': { name: undefined },
  'undefined operator value': { name: { eq: undefined } },
};

const alwaysTrue = Object.entries(shapes);

describe('empty branch inside logical operators', () => {
  describe('handlers', () => {
    const named = { text: 'name = $a', vars: { a: 1 } };
    const empty = { text: '', vars: {} };

    test('OR with an empty branch is the empty fragment, in any position', () => {
      expect(handleOr([empty, named])).toEqual(empty);
      expect(handleOr([named, empty])).toEqual(empty);
      expect(handleOr([named, empty, named])).toEqual(empty);
      expect(handleOr([empty])).toEqual(empty);
    });

    test('OR with an empty branch and a false branch is still empty', () => {
      expect(handleOr([{ text: 'false', vars: {} }, empty])).toEqual(empty);
    });

    test('OR without an empty branch is unchanged', () => {
      expect(handleOr([named, { text: 'age = $b', vars: { b: 2 } }])).toEqual({
        text: '(name = $a OR age = $b)',
        vars: { a: 1, b: 2 },
      });
      expect(handleOr([named])).toEqual(named);
      expect(handleOr([])).toEqual({ text: 'false', vars: {} });
      expect(handleOr([{ text: 'false', vars: {} }, named])).toEqual(named);
    });

    test('AND drops an empty branch', () => {
      expect(handleAnd([empty, named])).toEqual({ text: '(name = $a)', vars: { a: 1 } });
      expect(handleAnd([named, empty, { text: 'age = $b', vars: { b: 2 } }])).toEqual({
        text: '(name = $a AND age = $b)',
        vars: { a: 1, b: 2 },
      });
      expect(handleAnd([empty, empty])).toEqual(empty);
    });

    test('NOT of an empty fragment matches no row, not every row', () => {
      expect(handleNot(empty)).toEqual({ text: 'false', vars: {} });
    });
  });

  describe.each(alwaysTrue)('%s', (_label, shape) => {
    test('compiles to no condition on its own', () => {
      expect(compile(shape).text).toBe('');
    });

    test('OR with a real branch is no condition', () => {
      expect(compile({ OR: [shape, { name: 't1' }] }).text).toBe('');
      expect(compile({ OR: [{ name: 't1' }, shape] }).text).toBe('');
    });

    test('NOT around the OR matches no row', () => {
      expect(compile({ NOT: { OR: [shape, { name: 't1' }] } })).toEqual({ text: 'false', vars: {} });
    });

    test('AND around the OR keeps only the other branch', () => {
      const query = compile({ AND: [{ name: 't1' }, { OR: [{ name: 't2' }, shape] }] });
      expect(query.text).toBe('(name = $name_eq_0)');
      expect(query.vars).toEqual({ name_eq_0: 't1' });
    });

    test('NOT around the AND negates only the real branch', () => {
      const query = compile({ NOT: { AND: [{ name: 't1' }, { OR: [{ name: 't2' }, shape] }] } });
      expect(query.text).toBe('NOT ((name = $name_eq_0))');
      expect(query.vars).toEqual({ name_eq_0: 't1' });
    });

    test('nested OR inside OR inside NOT matches no row', () => {
      expect(compile({ NOT: { OR: [{ name: 't1' }, { OR: [{ name: 't2' }, shape] }] } }).text).toBe('false');
    });

    test('inside an object field where', () => {
      expect(compile({ addr: { OR: [{}, { street: 's' }] } }).text).toBe('');
      expect(compile({ addr: { NOT: { OR: [{}, { street: 's' }] } } }).text).toBe('false');
    });
  });

  describe('empty disjunction', () => {
    test('OR of nothing is false, and NOT of it is every row', () => {
      expect(compile({ OR: [] }).text).toBe('false');
      expect(compile({ NOT: { OR: [] } }).text).toBe('');
    });
  });

  describe('ordinary filters are unchanged', () => {
    test('OR of two real branches', () => {
      expect(compile({ OR: [{ name: 't1' }, { name: 't2' }] }).text).toBe('(name = $name_eq_0 OR name = $name_eq_1)');
    });

    test('NOT of a real branch', () => {
      expect(compile({ NOT: { name: 't1' } }).text).toBe('NOT (name = $name_eq_0)');
    });

    test('AND of two real branches', () => {
      expect(compile({ AND: [{ name: 't1' }, { name: 't2' }] }).text).toBe('(name = $name_eq_0 AND name = $name_eq_1)');
    });
  });
});
