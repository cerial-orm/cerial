/**
 * Unit tests: operator names and logical bodies are checked at every depth of a where
 *
 * The top level refuses an unknown operator, an AND or OR that is not an array of objects and a NOT that is not an
 * object. Under an object sub-field, a @flexible undeclared key, a tuple element, a quantifier body or a relation
 * body those shapes used to be skipped, and the compilers dropped them, so a filter lost a condition or a NOT
 * inverted a comparison that never held. Each position now refuses them, on reads and writes alike.
 */

import { describe, expect, test } from 'bun:test';
import { compileCount, compileDeleteMany, compileFindMany, compileUpdateMany } from '../../../src/query/builder';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { owner, place, placeRegistry } from './where-validation-helpers';

const hostile = (value: unknown): WhereClause => value as WhereClause;
// Owner is the model whose reverse relation the where names; every other where is written against Place
const modelFor = (where: unknown) => (where !== null && typeof where === 'object' && 'places' in where ? owner : place);
const issues = (where: unknown, model = modelFor(where)) =>
  validateWhere(hostile(where), model, placeRegistry).errors.map((e) => e.message);

const BOGUS = 'Unknown operator: bogus';

const unknownOperators: Array<[string, unknown, string]> = [
  ['a declared sub-field', { address: { city: { eq: 'x', bogus: 1 } } }, BOGUS],
  ['a declared sub-field with a lost operator', { address: { city: { eq: undefined, bogus: 1 } } }, BOGUS],
  ['a declared sub-field with only the unknown key', { address: { city: { bogus: 1 } } }, BOGUS],
  ['a nested object sub-field', { address: { geo: { lat: { gt: 1, bogus: 1 } } } }, BOGUS],
  ['a flexible undeclared key', { open: { extra: { eq: 1, bogus: 1 } } }, BOGUS],
  ['a flexible undeclared key with a lost operator', { open: { extra: { eq: undefined, bogus: 1 } } }, BOGUS],
  ['a flexible undeclared key under a nested object', { address: { loose: { extra: { eq: 1, bogus: 1 } } } }, BOGUS],
  ['an object array quantifier body', { stops: { some: { city: { eq: 'x', bogus: 1 } } } }, BOGUS],
  ['an object array every body', { stops: { every: { geo: { lat: { bogus: 1 } } } } }, BOGUS],
  ['a tuple element by index', { pairs: { some: { 0: { eq: 1, bogus: 1 } } } }, BOGUS],
  ['a tuple element by name', { spot: { label: { eq: 'x', bogus: 1 } } }, BOGUS],
  ['an object element of a tuple', { spot: { 1: { lat: { eq: 1, bogus: 1 } } } }, BOGUS],
  ['a forward relation body', { owner: { name: { eq: 'x', bogus: 1 } } }, BOGUS],
  ['a reverse relation quantifier body', { places: { some: { name: { eq: 'x', bogus: 1 } } } }, BOGUS],
  ['a field inside NOT inside an object', { address: { NOT: { city: { eq: 'x', bogus: 1 } } } }, BOGUS],
  ['a field inside AND inside a relation body', { owner: { AND: [{ name: { bogus: 1 } }] } }, BOGUS],
];

describe('an unknown operator below the top level is refused', () => {
  test.each(unknownOperators)('validateWhere refuses it in %s', (_label, where, message) => {
    expect(issues(where)).toContain(message);
  });

  test('the top level still refuses it', () => {
    expect(issues({ name: { eq: 'x', bogus: 1 } })).toEqual([BOGUS]);
  });

  test('a plain object on a declared primitive sub-field is not an operator', () => {
    expect(issues({ address: { city: { foo: 1 } } })).toEqual(['Unknown operator: foo']);
  });

  test('the compiler fails closed when an unknown operator reaches it', () => {
    expect(() =>
      buildConditions(createCompileContext(), hostile({ name: { eq: 'x', bogus: 1 } }), place, placeRegistry),
    ).toThrow('Unknown operator: bogus');
    expect(() =>
      buildConditions(createCompileContext(), hostile({ address: { city: { eq: 'x', bogus: 1 } } }), place),
    ).toThrow('Unknown operator: bogus');
  });

  test.each(unknownOperators)('deleteMany, updateMany and findMany refuse it in %s', (_label, where) => {
    const model = modelFor(where);
    expect(() => compileDeleteMany(model, { where: hostile(where) }, placeRegistry)).toThrow(BOGUS);
    expect(() => compileUpdateMany(model, { where: hostile(where), data: { name: 'x' } }, placeRegistry)).toThrow(
      BOGUS,
    );
    expect(() => compileFindMany(model, { where: hostile(where) }, placeRegistry)).toThrow(BOGUS);
    expect(() => compileCount(model, hostile(where), placeRegistry)).toThrow(BOGUS);
  });
});

describe('near misses stay valid', () => {
  const accepted: Array<[string, unknown]> = [
    ['every operator known on a declared sub-field', { address: { city: { startsWith: 'a', contains: 'b' } } }],
    ['an empty object on a declared sub-field', { address: { city: {} } }],
    ['a known operator on a nested object sub-field', { address: { geo: { lat: { gt: 1, lte: 5 } } } }],
    ['a known operator on a flexible undeclared key', { open: { extra: { eq: 1, neq: 2 } } }],
    ['a value object on a flexible undeclared key', { open: { extra: { foo: 1 } } }],
    ['an empty value object on a flexible undeclared key', { open: { extra: {} } }],
    ['a value object with nested keys on a flexible undeclared key', { open: { extra: { foo: { bar: 1 } } } }],
    ['known operators in a quantifier body', { stops: { some: { city: { eq: 'x' }, geo: { lat: { gt: 1 } } } } }],
    ['known operators on a tuple element', { pairs: { some: { 0: { gt: 1 }, second: { lt: 9 } } } }],
    ['known operators in a relation body', { owner: { name: { startsWith: 'a' } } }],
    ['known operators in a reverse relation quantifier', { places: { some: { name: { eq: 'x' } } } }],
    ['a null forward relation', { owner: null }],
    ['AND and OR arrays and a NOT object', { AND: [{ name: 'a' }], OR: [{ name: 'b' }], NOT: { name: 'c' } }],
    ['logical keys inside an object', { address: { AND: [{ city: 'a' }], OR: [{ city: 'b' }], NOT: { city: 'c' } } }],
    ['logical keys inside a quantifier body', { stops: { some: { AND: [{ city: 'a' }], NOT: { city: 'b' } } } }],
    ['undefined logical keys', { AND: undefined, OR: undefined, NOT: undefined }],
  ];

  test.each(accepted)('accepts %s', (_label, where) => {
    expect(issues(where)).toEqual([]);
  });

  test('accepts the same shapes inside a relation body', () => {
    expect(
      issues({ places: { some: { AND: [{ name: 'a' }], OR: [{ name: 'b' }], NOT: { name: 'c' } } } }, owner),
    ).toEqual([]);
  });
});

describe('a logical key with the wrong shape is refused at every depth', () => {
  const shapes: Array<[string, unknown, string]> = [
    ['AND as a single object', { AND: { name: 'zz' } }, 'AND must be an array'],
    ['AND as a string', { AND: 'x' }, 'AND must be an array'],
    ['OR as a single object', { OR: { name: 'zz' } }, 'OR must be an array'],
    ['OR as a number', { OR: 5 }, 'OR must be an array'],
    ['NOT as an array', { NOT: [{ name: 'a' }] }, 'NOT must be an object'],
    ['NOT as a number', { NOT: 5 }, 'NOT must be an object'],
    ['NOT as null', { NOT: null }, 'NOT must be an object'],
    ['an AND item that is a number', { AND: [5] }, 'AND items must be objects'],
    ['an OR item that is an array', { OR: [[]] }, 'OR items must be objects'],
    ['an AND item that is null', { AND: [null] }, 'AND items must be objects'],
  ];

  const positions: Array<[string, (inner: Record<string, unknown>) => unknown, typeof place | undefined]> = [
    ['the top level', (inner) => inner, undefined],
    ['an object field', (inner) => ({ address: inner }), undefined],
    ['a flexible object field', (inner) => ({ open: inner }), undefined],
    ['a nested object field', (inner) => ({ address: { geo: inner } }), undefined],
    ['an object array quantifier body', (inner) => ({ stops: { some: inner } }), undefined],
    ['an object array none body', (inner) => ({ stops: { none: inner } }), undefined],
    ['a forward relation body', (inner) => ({ owner: inner }), undefined],
    ['a reverse relation quantifier body', (inner) => ({ places: { some: inner } }), owner],
    ['a reverse relation every body', (inner) => ({ places: { every: inner } }), owner],
    ['NOT around a relation body', (inner) => ({ NOT: { owner: inner } }), undefined],
    ['AND around an object field', (inner) => ({ AND: [{ address: inner }] }), undefined],
  ];

  for (const [position, wrap, model] of positions) {
    test.each(shapes)(`${position} refuses %s`, (_label, inner, message) => {
      expect(issues(wrap(inner as Record<string, unknown>), model)).toContain(message);
    });
  }

  test('the refusal reaches deleteMany, updateMany and findMany', () => {
    for (const where of [
      { NOT: { owner: 5 } },
      { owner: { NOT: [{ name: 'a' }] } },
      { stops: { some: { AND: { city: 'zz' } } } },
      { address: { OR: { city: 'zz' } } },
    ]) {
      expect(() => compileDeleteMany(place, { where: hostile(where) }, placeRegistry)).toThrow();
      expect(() => compileUpdateMany(place, { where: hostile(where), data: { name: 'x' } }, placeRegistry)).toThrow();
      expect(() => compileFindMany(place, { where: hostile(where) }, placeRegistry)).toThrow();
    }
  });
});

describe('a body that is not an object is refused', () => {
  const bodies: Array<[string, unknown, typeof place | undefined]> = [
    ['a forward relation set to a number', { owner: 5 }, undefined],
    ['a forward relation set to an array', { owner: [] }, undefined],
    ['a forward relation set to a string', { owner: 'x' }, undefined],
    ['a forward relation set to a boolean', { owner: true }, undefined],
    ['a forward relation inside NOT', { NOT: { owner: 5 } }, undefined],
    ['a reverse relation quantifier set to a string', { places: { some: 'x' } }, owner],
    ['a reverse relation quantifier set to a number', { places: { none: 5 } }, owner],
    ['a reverse relation quantifier set to an array', { places: { some: [] } }, owner],
    ['a reverse relation quantifier set to null', { places: { every: null } }, owner],
    ['an object array quantifier set to a string', { stops: { some: 'x' } }, undefined],
    ['an object array quantifier set to an array', { stops: { every: [] } }, undefined],
    ['a tuple array quantifier set to a number', { pairs: { some: 5 } }, undefined],
  ];

  test.each(bodies)('refuses %s', (_label, where, model) => {
    expect(issues(where, model)).not.toEqual([]);
  });

  test('a relation set to undefined is skipped like any undefined key', () => {
    expect(issues({ owner: undefined })).toEqual([]);
  });
});
