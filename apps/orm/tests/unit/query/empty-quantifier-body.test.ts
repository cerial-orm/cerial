/**
 * Unit tests: an empty filter body compiles by what it means
 *
 * A quantifier body that holds no condition (`{}`, `AND: []`, `OR: [{}]`, `NOT: { NOT: {} }`,
 * `NOT: { OR: [] }`, undefined values) is true for every element, so some means "there is one",
 * none means "there is none" and every is always true. An operator object without operators
 * (`{ name: {} }`) constrains nothing. None of them may be dropped in a way that changes what the
 * filter written around them selects, and a body that is false stays false.
 */

import { describe, expect, test } from 'bun:test';
import { compileFindMany } from '../../../src/query/builder';
import type { WhereClause } from '../../../src/types';
import { owner, place, placeRegistry } from './where-validation-helpers';

const compilePlace = (where: Record<string, unknown>) =>
  compileFindMany(place, { where: where as WhereClause }, placeRegistry).query;
const compileOwner = (where: Record<string, unknown>) =>
  compileFindMany(owner, { where: where as WhereClause }, placeRegistry).query;

const emptyBodies: Record<string, Record<string, unknown>> = {
  'empty object': {},
  'empty AND': { AND: [] },
  'OR of an empty object': { OR: [{}] },
  'NOT of NOT of empty': { NOT: { NOT: {} } },
  'NOT of an empty OR': { NOT: { OR: [] } },
  'AND of an empty object': { AND: [{}] },
};

const objectBodies = { ...emptyBodies, 'undefined value': { city: undefined } };
// The where validator accepts only field keys inside a tuple element body, so no logical operators here
const tupleBodies: Record<string, Record<string, unknown>> = {
  'empty object': {},
  'undefined value': { first: undefined },
};
const relationBodies = { ...emptyBodies, 'undefined value': { name: undefined } };

const sibling = { name: 'p' };
const sib = 'name = $name_eq_0';

describe.each(Object.entries(objectBodies))('object array, %s', (_label, body) => {
  test('some is "the array is not empty"', () => {
    expect(compilePlace({ stops: { some: body } }).text).toBe('SELECT * FROM place WHERE array::len(stops) > 0');
  });

  test('none is "the array is empty"', () => {
    expect(compilePlace({ stops: { none: body } }).text).toBe('SELECT * FROM place WHERE array::len(stops) = 0');
  });

  test('every is no condition', () => {
    expect(compilePlace({ stops: { every: body } }).text).toBe('SELECT * FROM place');
  });

  test('with a sibling key', () => {
    expect(compilePlace({ ...sibling, stops: { some: body } }).text).toBe(
      `SELECT * FROM place WHERE ${sib} AND array::len(stops) > 0`,
    );
    expect(compilePlace({ ...sibling, stops: { none: body } }).text).toBe(
      `SELECT * FROM place WHERE ${sib} AND array::len(stops) = 0`,
    );
    expect(compilePlace({ ...sibling, stops: { every: body } }).text).toBe(`SELECT * FROM place WHERE ${sib}`);
  });

  test('beside a real quantifier both apply', () => {
    const some = compilePlace({ stops: { some: body, every: { city: 'a' } } });
    expect(some.text).toBe(
      'SELECT * FROM place WHERE array::len(stops) > 0 AND stops.all(|$v| $v.city = $_v_city_eq_0)',
    );

    const none = compilePlace({ stops: { none: body, every: { city: 'a' } } });
    expect(none.text).toBe(
      'SELECT * FROM place WHERE array::len(stops) = 0 AND stops.all(|$v| $v.city = $_v_city_eq_0)',
    );
  });

  test('under NOT it is negated by meaning, not dropped', () => {
    expect(compilePlace({ NOT: { stops: { some: body } } }).text).toBe(
      'SELECT * FROM place WHERE NOT (array::len(stops) > 0)',
    );
    expect(compilePlace({ NOT: { stops: { none: body } } }).text).toBe(
      'SELECT * FROM place WHERE NOT (array::len(stops) = 0)',
    );
    // every is true for the empty body, so its negation is false
    expect(compilePlace({ NOT: { stops: { every: body } } }).text).toBe('SELECT * FROM place WHERE false');
  });
});

describe.each(Object.entries(tupleBodies))('tuple array, %s', (_label, body) => {
  test('some, none and every', () => {
    expect(compilePlace({ pairs: { some: body } }).text).toBe('SELECT * FROM place WHERE array::len(pairs) > 0');
    expect(compilePlace({ pairs: { none: body } }).text).toBe('SELECT * FROM place WHERE array::len(pairs) = 0');
    expect(compilePlace({ pairs: { every: body } }).text).toBe('SELECT * FROM place');
  });

  test('with a sibling key and under NOT', () => {
    expect(compilePlace({ ...sibling, pairs: { none: body } }).text).toBe(
      `SELECT * FROM place WHERE ${sib} AND array::len(pairs) = 0`,
    );
    expect(compilePlace({ NOT: { pairs: { some: body } } }).text).toBe(
      'SELECT * FROM place WHERE NOT (array::len(pairs) > 0)',
    );
  });

  test('beside a real quantifier both apply', () => {
    const q = compilePlace({ pairs: { some: body, every: { first: 1 } } });
    expect(q.text).toBe('SELECT * FROM place WHERE array::len(pairs) > 0 AND pairs.all(|$v| $v[0] = $_v_0__eq_0)');
  });
});

describe.each(Object.entries(relationBodies))('reverse relation, %s', (_label, body) => {
  const sub = 'SELECT VALUE ownerId FROM place';

  test('some, none and every', () => {
    expect(compileOwner({ places: { some: body } }).text).toBe(`SELECT * FROM owner WHERE id IN (${sub})`);
    expect(compileOwner({ places: { none: body } }).text).toBe(`SELECT * FROM owner WHERE id NOT IN (${sub})`);
    // Reverse every already requires one related row, so an empty body reads like some
    expect(compileOwner({ places: { every: body } }).text).toBe(`SELECT * FROM owner WHERE id IN (${sub})`);
  });

  test('with a sibling relation key the empty body is kept, not dropped', () => {
    expect(compileOwner({ places: { some: body, isEmpty: true } }).text).toBe(
      `SELECT * FROM owner WHERE id IN (${sub}) AND id NOT IN (${sub})`,
    );
    expect(compileOwner({ places: { isEmpty: true, none: body } }).text).toBe(
      `SELECT * FROM owner WHERE id NOT IN (${sub}) AND id NOT IN (${sub})`,
    );
    expect(compileOwner({ places: { every: body, isEmpty: true } }).text).toBe(
      `SELECT * FROM owner WHERE id IN (${sub}) AND id NOT IN (${sub})`,
    );
  });

  test('beside a real quantifier both apply', () => {
    const q = compileOwner({ places: { some: body, none: { name: 'x' } } });
    expect(q.text).toBe(`SELECT * FROM owner WHERE id IN (${sub}) AND id NOT IN (${sub} WHERE name = $name_eq_0)`);
    expect(q.vars).toEqual({ name_eq_0: 'x' });
  });

  test('under NOT it is negated by meaning', () => {
    expect(compileOwner({ NOT: { places: { some: body } } }).text).toBe(
      `SELECT * FROM owner WHERE NOT (id IN (${sub}))`,
    );
    expect(compileOwner({ NOT: { places: { none: body } } }).text).toBe(
      `SELECT * FROM owner WHERE NOT (id NOT IN (${sub}))`,
    );
    expect(compileOwner({ NOT: { places: { every: body } } }).text).toBe(
      `SELECT * FROM owner WHERE NOT (id IN (${sub}))`,
    );
  });
});

describe('a false body stays false', () => {
  test('some of an empty OR matches no element', () => {
    expect(compilePlace({ stops: { some: { OR: [] } } }).text).toBe('SELECT * FROM place WHERE stops.any(|$v| false)');
    expect(compilePlace({ stops: { none: { OR: [] } } }).text).toBe(
      'SELECT * FROM place WHERE !(stops.any(|$v| false))',
    );
  });
});

describe('non-empty bodies are unchanged', () => {
  test('object array', () => {
    expect(compilePlace({ stops: { some: { city: 'a' } } }).text).toBe(
      'SELECT * FROM place WHERE stops.any(|$v| $v.city = $_v_city_eq_0)',
    );
    expect(compilePlace({ stops: { none: { city: 'a' } } }).text).toBe(
      'SELECT * FROM place WHERE !(stops.any(|$v| $v.city = $_v_city_eq_0))',
    );
    expect(compilePlace({ stops: { every: { city: 'a' } } }).text).toBe(
      'SELECT * FROM place WHERE stops.all(|$v| $v.city = $_v_city_eq_0)',
    );
  });

  test('reverse relation', () => {
    expect(compileOwner({ places: { some: { name: 'x' } } }).text).toBe(
      'SELECT * FROM owner WHERE id IN (SELECT VALUE ownerId FROM place WHERE name = $name_eq_0)',
    );
  });
});

describe('an empty operator object constrains nothing', () => {
  test.each([
    ['empty object', {}],
    ['only undefined values', { eq: undefined }],
  ])('%s on a field', (_label, ops) => {
    expect(compilePlace({ name: ops }).text).toBe('SELECT * FROM place');
    expect(compilePlace({ ...sibling, id: ops }).text).toBe(`SELECT * FROM place WHERE ${sib}`);
  });

  test('beside a real operator on the same field', () => {
    expect(compilePlace({ name: { eq: 'a', ...{} } }).text).toBe('SELECT * FROM place WHERE name = $name_eq_0');
  });

  test('NOT of it matches no row', () => {
    expect(compilePlace({ NOT: { name: {} } }).text).toBe('SELECT * FROM place WHERE false');
  });

  test('NOT of an OR holding it matches no row', () => {
    expect(compilePlace({ NOT: { OR: [{ name: 'a' }, { name: {} }] } }).text).toBe('SELECT * FROM place WHERE false');
  });

  test('AND with it keeps the real branch', () => {
    expect(compilePlace({ AND: [{ name: 'a' }, { name: {} }] }).text).toBe(
      'SELECT * FROM place WHERE (name = $name_eq_0)',
    );
  });

  test('inside an object field where', () => {
    expect(compilePlace({ address: { city: {} } }).text).toBe('SELECT * FROM place');
    expect(compilePlace({ NOT: { address: { city: {} } } }).text).toBe('SELECT * FROM place WHERE false');
  });

  test('inside a quantifier body on an object array', () => {
    expect(compilePlace({ stops: { some: { city: {} } } }).text).toBe(
      'SELECT * FROM place WHERE array::len(stops) > 0',
    );
  });

  test('inside a tuple element and a relation body', () => {
    expect(compilePlace({ pairs: { some: { first: {} } } }).text).toBe(
      'SELECT * FROM place WHERE array::len(pairs) > 0',
    );
    expect(compileOwner({ places: { some: { name: {} } } }).text).toBe(
      'SELECT * FROM owner WHERE id IN (SELECT VALUE ownerId FROM place)',
    );
  });

  test('a non-empty operator object is unchanged', () => {
    expect(compilePlace({ name: { eq: 'a' } }).text).toBe('SELECT * FROM place WHERE name = $name_eq_0');
  });
});
