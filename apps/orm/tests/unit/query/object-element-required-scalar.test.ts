/**
 * Unit Tests: an object inside an array or tuple element is held to its required scalars
 *
 * A value bound whole has no `DEFINE FIELD` under it to fill what it leaves out, so the database refuses an
 * element missing a required scalar. Create and where share one validator, so each is refused naming the
 * field before a statement is built: a negated filter with such a value matched every row.
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { validateWhere } from '../../../src/query/validators';
import { validateCreateData, validateUpdateData } from '../../../src/query/validators/data-validator';
import type { WhereClause } from '../../../src/types';
import { registryFor } from './helpers';

const registry = registryFor(`
object Req {
  r Int
  s String?
}

object Dflt {
  r Int @default(5)
  s String?
}

object Nest {
  inner Req
  tags Int[]
}

tuple Tr {
  Int,
  Req
}

model R2 {
  id Record @id
  reqs Req[]
  dflts Dflt[]
  nests Nest[]
  tr Tr?
  trs Tr[]
  req Req?
}
`);
const model = registry.R2!;

const createErrors = (data: unknown): string[] =>
  validateCreateData(data as Record<string, unknown>, model).errors.map((e) => e.message);
const whereErrors = (where: unknown): string[] =>
  validateWhere(where as WhereClause, model, registry).errors.map((e) => e.message);
const compile = (where: unknown) => buildConditions(createCompileContext(), where as WhereClause, model, registry);

// An object-form tuple in a filter is a partial filter by element, so only create holds it whole
const CREATE_ONLY: Array<[string, unknown, RegExp]> = [
  ['a tuple element object in object form', { tr: { 0: 1, 1: { s: 'x' } } }, /tr\.1\.r is required/],
];

const MISSING: Array<[string, unknown, RegExp]> = [
  ['an array element with nothing', { reqs: [{}] }, /reqs\[0\]\.r is required/],
  ['an array element with only the optional key', { reqs: [{ s: 'x' }] }, /reqs\[0\]\.r is required/],
  ['the second of two elements', { reqs: [{ r: 1 }, { s: 'x' }] }, /reqs\[1\]\.r is required/],
  ['a tuple element object', { tr: [1, {}] }, /tr\[1\]\.r is required/],
  ['a tuple in an array', { trs: [[1, { s: 'x' }]] }, /trs\[0\]\[1\]\.r is required/],
  ['a nested required object', { nests: [{ tags: [] }] }, /nests\[0\]\.inner is required/],
  ['a nested element missing its own scalar', { nests: [{ inner: {}, tags: [] }] }, /nests\[0\]\.inner\.r is required/],
];

describe('a where comparing a whole value with a missing required scalar is refused, destructive forms first', () => {
  test.each(MISSING)('NOT with %s names the field', (_name, value, pattern) => {
    expect(whereErrors({ NOT: value }).join()).toMatch(pattern);
  });

  test.each(MISSING)('the bare filter with %s names the field', (_name, value, pattern) => {
    expect(whereErrors(value).join()).toMatch(pattern);
  });

  test.each(MISSING)('the builder alone refuses %s, so no statement is built', (_name, value) => {
    expect(() => compile({ NOT: value })).toThrow(/is required/);
  });
});

describe('create refuses the same values, naming the field', () => {
  test.each([...MISSING, ...CREATE_ONLY])('%s', (_name, value, pattern) => {
    expect(createErrors(value).join()).toMatch(pattern);
  });
});

describe('what is written or filtered completely is still accepted', () => {
  test('complete elements, with the optional key left out or given', () => {
    expect(createErrors({ reqs: [{ r: 1 }, { r: 2, s: 'x' }] })).toEqual([]);
    expect(createErrors({ tr: [1, { r: 1 }], trs: [[1, { r: 1, s: 'y' }]] })).toEqual([]);
    expect(createErrors({ tr: { 0: 1, 1: { r: 1 } } })).toEqual([]);
    expect(createErrors({ nests: [{ inner: { r: 1 }, tags: [] }] })).toEqual([]);
  });

  test('a required scalar the schema defaults is not required in the element', () => {
    expect(createErrors({ dflts: [{}, { s: 'x' }] })).toEqual([]);
  });

  test('where accepts the complete forms, bare and negated', () => {
    for (const value of [{ reqs: [{ r: 1 }] }, { tr: [1, { r: 1 }] }, { trs: [[1, { r: 1 }]] }]) {
      expect(whereErrors(value)).toEqual([]);
      expect(whereErrors({ NOT: value })).toEqual([]);
    }
  });

  test('a sub-filter on one object field is partial, as is a filter by element', () => {
    expect(whereErrors({ req: { s: 'x' } })).toEqual([]);
    expect(whereErrors({ NOT: { req: { s: 'x' } } })).toEqual([]);
    expect(whereErrors({ tr: { 1: { s: 'x' } } })).toEqual([]);
    expect(whereErrors({ reqs: { some: { s: 'x' } } })).toEqual([]);
  });

  test('a merge update of a single object stays partial', () => {
    expect(validateUpdateData({ req: { s: 'y' } }, model).errors).toEqual([]);
    expect(validateUpdateData({ tr: { 1: { s: 'y' } } }, model).errors).toEqual([]);
  });

  test('a whole value written by an update is held to the required scalar', () => {
    expect(
      validateUpdateData({ reqs: [{ s: 'x' }] }, model)
        .errors.map((e) => e.message)
        .join(),
    ).toContain('reqs[0].r is required');
    expect(
      validateUpdateData({ reqs: { push: { s: 'x' } } }, model)
        .errors.map((e) => e.message)
        .join(),
    ).toContain('r is required');
    expect(validateUpdateData({ reqs: [{ r: 1 }] }, model).errors).toEqual([]);
  });

  test('a filter that binds the complete value still binds it', () => {
    const { vars } = compile({ reqs: [{ r: 1 }] });
    expect(Object.values(vars)).toEqual([[{ r: 1 }]]);
  });
});
