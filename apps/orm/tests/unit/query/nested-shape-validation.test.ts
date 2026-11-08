/**
 * Unit Tests: a nested object or tuple is checked at every depth, on create, update and where
 *
 * An object or tuple that sits inside another one used to be skipped when its value was not an object or an
 * array, so `[1, 5]` where the second element is an object was stored, and a tuple longer than its definition
 * was accepted. Each is refused naming the path, and the well formed value beside it is still accepted.
 */

import { describe, expect, test } from 'bun:test';
import { validateCreateData, validateUpdateData, validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { model, registry } from './where-create-parity/schema';

const host = model('Host');
const D = '2021-01-01T00:00:00.000Z';

const createErrors = (data: Record<string, unknown>): string[] =>
  validateCreateData(data, host)
    .errors.filter((e) =>
      Object.keys(data).some((k) => e.field === k || (/^[.[]/.test(e.field.slice(k.length)) && e.field.startsWith(k))),
    )
    .map((e) => e.message);
const updateErrors = (data: Record<string, unknown>): string[] =>
  validateUpdateData(data, host).errors.map((e) => e.message);
const whereErrors = (where: unknown): string[] =>
  validateWhere(where as WhereClause, host, registry).errors.map((e) => e.message);

const NOT_SHAPES = [5, 'x', true, [1], []];

describe('an object inside an object is an object', () => {
  test.each(NOT_SHAPES.map((v) => [JSON.stringify(v), v] as const))('create refuses %s at depth 2 and 3', (_l, v) => {
    expect(createErrors({ deep: { mid: v } }).join()).toContain('deep.mid');
    expect(createErrors({ deep: { mid: { leaf: v } } }).join()).toContain('deep.mid.leaf');
    expect(createErrors({ selfRef: { child: v } }).join()).toContain('selfRef.child');
  });

  test.each(NOT_SHAPES.map((v) => [JSON.stringify(v), v] as const))('update refuses %s', (_l, v) => {
    expect(updateErrors({ deep: { mid: v } }).join()).toContain('deep.mid');
    expect(updateErrors({ deep: { mid: { leaf: v } } }).join()).toContain('deep.mid.leaf');
  });

  test.each(NOT_SHAPES.map((v) => [JSON.stringify(v), v] as const))('where refuses %s', (_l, v) => {
    expect(whereErrors({ deep: { mid: v } }).join()).toContain('mid');
    expect(whereErrors({ NOT: { deep: { mid: { leaf: v } } } }).join()).toContain('leaf');
  });

  test('a well formed nested object is accepted', () => {
    expect(createErrors({ deep: { mid: { leaf: { fInt: 1 }, fInt: 2 }, fStr: 'a' } })).toEqual([]);
    expect(updateErrors({ deep: { mid: { leaf: { fInt: 1 } } } })).toEqual([]);
    expect(whereErrors({ deep: { mid: { leaf: { fInt: 1 } } } })).toEqual([]);
  });
});

describe('an object or tuple that is a tuple element is an object or a tuple', () => {
  test.each([
    ['boxT', [1, 5]],
    ['boxT', [1, 'x']],
    ['boxT', [1, true]],
    ['objTup', [D, 5]],
    ['objTup', [D, [1]]],
    ['deepT', [1, 5]],
    ['deepT', [1, { t: 5, fDec: '1.5' }]],
    ['deepT', [1, { t: 'x', fDec: '1.5' }]],
  ])('create refuses %s %j', (field, value) => {
    expect(createErrors({ [field]: value }).join()).toContain(field);
  });

  test('where refuses the same whole values, naming the field', () => {
    for (const [field, value] of [
      ['boxT', [1, 5]],
      ['objTup', [D, 5]],
      ['deepT', [1, { t: 5, fDec: '1.5' }]],
    ] as const) {
      expect(whereErrors({ [field]: value }).join()).toContain(field);
    }
  });

  test('a well formed value is accepted', () => {
    expect(createErrors({ boxT: [1, { fUuid: '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d', fDur: '1h' }] })).toEqual([]);
    expect(createErrors({ objTup: [D, { fInt: 1 }] })).toEqual([]);
    expect(createErrors({ deepT: [1, { t: [1, '1h'], fDec: '1.5' }] })).toEqual([]);
  });
});

describe('a tuple holds no more elements than it defines, at any depth', () => {
  test.each([
    ['pairT', [1, D, 3]],
    ['optPair', [1, D, 3]],
    ['pairs', [[1, D, 3]]],
    ['boxT', [1, { fUuid: '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d', fDur: '1h' }, 3]],
    ['deepT', [1, { t: [1, '1h', 3], fDec: '1.5' }]],
  ])('create refuses %s %j', (field, value) => {
    expect(createErrors({ [field]: value }).join()).toMatch(/elements and its tuple has/);
  });

  test.each([
    ['pairT', [1, D, 3]],
    ['pairs', [[1, D, 3]]],
    ['deepT', [1, { t: [1, '1h', 3], fDec: '1.5' }]],
  ])('where refuses %s %j', (field, value) => {
    expect(whereErrors({ [field]: value }).join()).toContain(field);
  });

  test('the defined length is accepted', () => {
    expect(createErrors({ pairT: [1, D] })).toEqual([]);
    expect(createErrors({ pairs: [[1, D]] })).toEqual([]);
  });
});
