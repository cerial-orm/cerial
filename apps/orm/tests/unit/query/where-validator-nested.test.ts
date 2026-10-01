/**
 * Unit Tests: validateWhere on object sub-fields, array-object closures and tuple elements
 */

import { describe, expect, test } from 'bun:test';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { place } from './where-validation-helpers';

const messages = (where: WhereClause): string[] => validateWhere(where, place).errors.map((e) => e.message);
const unknown = (path: string): string =>
  `Unknown field '${path}' on model Place — check the field name against the schema`;

describe('validateWhere — object sub-fields', () => {
  test('accepts known sub-fields, operators and direct values', () => {
    expect(messages({ address: { city: 'NYC' } })).toEqual([]);
    expect(messages({ address: { city: { contains: 'N' }, geo: { lat: { gt: 1 } } } })).toEqual([]);
  });

  test('rejects an unknown sub-key on a strict object', () => {
    expect(messages({ address: { cty: 'NYC' } })).toEqual([unknown('address.cty')]);
  });

  test('rejects an unknown sub-key whose value is falsy', () => {
    expect(messages({ address: { cty: undefined, a: false, b: null, c: 0, d: '' } })).toHaveLength(4);
  });

  test('reports the where path of the offending key', () => {
    expect(validateWhere({ address: { cty: 'x' } }, place).errors[0]!.path).toBe('where.address.cty');
  });

  test('accepts an undeclared sub-key on a flexible object', () => {
    expect(messages({ open: { priority: 'high' } })).toEqual([]);
    expect(messages({ open: { priority: { gt: 1 } } })).toEqual([]);
    expect(messages({ open: { priority: false } })).toEqual([]);
  });

  test('accepts declared keys on a flexible object', () => {
    expect(messages({ open: { city: 'NYC', geo: { lat: 1 } } })).toEqual([]);
  });

  test('validates two levels deep on a strict object', () => {
    expect(messages({ address: { geo: { lat: 1 } } })).toEqual([]);
    expect(messages({ address: { geo: { lon: 1 } } })).toEqual([unknown('address.geo.lon')]);
  });

  test('flexibility is per field, not per object type', () => {
    expect(messages({ address: { loose: { anything: 1 } } })).toEqual([]);
    expect(messages({ open: { geo: { anything: 1 } } })).toEqual([unknown('open.geo.anything')]);
  });

  test('validates inside AND, OR and NOT within an object filter', () => {
    expect(messages({ address: { AND: [{ city: 'a' }, { cty: 'b' }] } })).toEqual([unknown('address.cty')]);
    expect(messages({ address: { OR: [{ cty: 'b' }] } })).toEqual([unknown('address.cty')]);
    expect(messages({ address: { NOT: { cty: 'b' } } })).toEqual([unknown('address.cty')]);
    expect(messages({ address: { AND: [{ city: 'a' }], NOT: { city: 'b' } } })).toEqual([]);
  });

  test('validates inside top-level logical operators', () => {
    expect(messages({ OR: [{ address: { cty: 'x' } }] })).toEqual([unknown('address.cty')]);
  });

  test('does not treat an operator on a sub-field as a sub-key', () => {
    expect(messages({ address: { city: { eq: 'a', contains: 'b', in: ['c'] } } })).toEqual([]);
  });
});

describe('validateWhere — array-of-object closures', () => {
  test('accepts known keys under some, every and none', () => {
    expect(messages({ stops: { some: { city: 'a' }, every: { city: 'b' }, none: { city: 'c' } } })).toEqual([]);
  });

  test('rejects an unknown key under each quantifier on a strict array', () => {
    for (const q of ['some', 'every', 'none']) {
      expect(messages({ stops: { [q]: { cty: 'a' } } })).toEqual([unknown('stops.cty')]);
    }
  });

  test('accepts an undeclared key under each quantifier on a flexible array', () => {
    for (const q of ['some', 'every', 'none']) {
      expect(messages({ openStops: { [q]: { priority: 'high' } } })).toEqual([]);
    }
  });

  test('rejects an unknown quantifier', () => {
    expect(messages({ stops: { somee: { city: 'a' } } })).toEqual([unknown('stops.somee')]);
  });

  test('validates nested objects inside a closure', () => {
    expect(messages({ stops: { some: { geo: { lon: 1 } } } })).toEqual([unknown('stops.geo.lon')]);
    expect(messages({ stops: { some: { geo: { lat: 1 } } } })).toEqual([]);
  });

  test('validates logical operators inside a closure', () => {
    expect(messages({ stops: { some: { OR: [{ city: 'a' }, { cty: 'b' }] } } })).toEqual([unknown('stops.cty')]);
  });
});

describe('validateWhere — tuple elements', () => {
  test('accepts elements by name and by index', () => {
    expect(messages({ spot: { label: 'a' } })).toEqual([]);
    expect(messages({ spot: { 0: 'a' } })).toEqual([]);
    expect(messages({ spot: { label: { contains: 'a' } } })).toEqual([]);
  });

  test('rejects an unknown element name', () => {
    expect(messages({ spot: { lable: 'a' } })).toEqual([unknown('spot.lable')]);
  });

  test('rejects an out-of-range element index', () => {
    expect(messages({ spot: { 5: 'a' } })).toEqual([unknown('spot.5')]);
  });

  test('rejects an unknown element key with a falsy value', () => {
    expect(messages({ spot: { lable: undefined, x: false, y: null } })).toHaveLength(2);
  });

  test('validates an object element of a tuple, strictly', () => {
    expect(messages({ spot: { 1: { lat: 1 } } })).toEqual([]);
    expect(messages({ spot: { 1: { lon: 1 } } })).toEqual([unknown('spot.1.lon')]);
  });

  test('validates array-of-tuples quantifiers', () => {
    expect(messages({ pairs: { some: { first: 1 }, every: { 1: { gt: 0 } } } })).toEqual([]);
    expect(messages({ pairs: { some: { third: 1 } } })).toEqual([unknown('pairs.third')]);
    expect(messages({ pairs: { sme: { first: 1 } } })).toEqual([unknown('pairs.sme')]);
  });
});
