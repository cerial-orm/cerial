/**
 * Unit Tests: a tuple filter index key is canonical digits only
 *
 * `parseInt` read '1 anything' and '0\n...' as an index, so the raw key text reached refusal messages and
 * `{ '1 anything': 2 }` silently filtered on element 1. Only digits that name an element ('0', '1') or an
 * element name resolve; leading zeros are refused, as the data validator already does for data keys.
 */

import { describe, expect, test } from 'bun:test';
import { compileDeleteMany, compileFindMany } from '../../../src/query/builder';
import { resolveTupleElementKey } from '../../../src/query/filters/condition-builder';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { place, placeRegistry } from './where-validation-helpers';

const tupleInfo = place.fields.find((f) => f.name === 'spot')!.tupleInfo!;
const messages = (where: WhereClause): string[] => validateWhere(where, place).errors.map((e) => e.message);

// A key is accepted with a value valid for the element it names: a String at 0, a Geo at 1
const operandFor = (key: string): unknown => (key === '1' ? { lat: 1, lng: 2 } : 'a');

const ACCEPTED: Array<[string, number]> = [
  ['0', 0],
  ['1', 1],
  ['label', 0],
];
const REFUSED = ['0\nx', '1 anything', ' 1', '1 ', '01', '1e0', '-0', '+1', '0x1', '1.0', '2', '99', ''];

describe('resolveTupleElementKey', () => {
  test.each(ACCEPTED)('%j resolves to element %d', (key, index) => {
    expect(resolveTupleElementKey(key, tupleInfo)?.index).toBe(index);
  });

  test.each(REFUSED)('%j resolves to nothing', (key) => {
    expect(resolveTupleElementKey(key, tupleInfo)).toBeUndefined();
  });
});

describe('where validation on a tuple field', () => {
  test.each(ACCEPTED)('%j is accepted', (key) => {
    expect(messages({ spot: { [key]: operandFor(key) } })).toEqual([]);
  });

  test.each(REFUSED)('%j is refused as an unknown field', (key) => {
    const errors = messages({ spot: { [key]: 'a' } });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Unknown field');
  });
});

describe('compiled filters', () => {
  test('digit keys compile to the element index', () => {
    const q = compileFindMany(place, { where: { spot: { 1: { lat: 1, lng: 2 } } } }, placeRegistry);

    expect(q.query.text).toContain('spot[1].lat');
  });

  test.each(['1 anything', '0\nx', '01', '1e0'])('%j is refused before a query is built', (key) => {
    const where = { spot: { [key]: 'a' } } as WhereClause;

    expect(() => compileFindMany(place, { where }, placeRegistry)).toThrow('Unknown field');
    expect(() => compileDeleteMany(place, { where }, placeRegistry)).toThrow('Unknown field');
  });

  test('the refusal of an empty body does not echo a hostile key', () => {
    const where = { spot: { 0: 'a', '0\n[INFO] forged': {} } } as WhereClause;

    expect(() => compileDeleteMany(place, { where }, placeRegistry)).toThrow('Unknown field');
  });
});
