/**
 * Unit Tests: validateWhere on relation filters, checked against the target model
 *
 * Place has a forward relation `owner` to Owner; Owner has the reverse array `places`.
 */

import { describe, expect, test } from 'bun:test';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { owner, place, placeRegistry } from './where-validation-helpers';

const placeMessages = (where: WhereClause): string[] =>
  validateWhere(where, place, placeRegistry).errors.map((e) => e.message);
const ownerMessages = (where: WhereClause): string[] =>
  validateWhere(where, owner, placeRegistry).errors.map((e) => e.message);
const unknown = (path: string, model: string): string =>
  `Unknown field '${path}' on model ${model} — check the field name against the schema`;

describe('validateWhere — relation filters', () => {
  test('accepts known target fields on a forward relation, with operators and direct values', () => {
    expect(placeMessages({ owner: { name: 'Ada' } })).toEqual([]);
    expect(placeMessages({ owner: { name: { contains: 'A' } } })).toEqual([]);
    expect(ownerMessages({ places: { some: { name: 'Hub' }, none: { name: { startsWith: 'x' } } } })).toEqual([]);
  });

  test('rejects an unknown key on a forward relation, naming the target model', () => {
    expect(placeMessages({ owner: { nmae: 'Ada' } })).toEqual([unknown('owner.nmae', 'Owner')]);
  });

  test.each(['some', 'every', 'none'])('rejects an unknown key inside %s on an array relation', (quantifier) => {
    expect(ownerMessages({ places: { [quantifier]: { nmae: 'Hub' } } })).toEqual([
      unknown(`places.${quantifier}.nmae`, 'Place'),
    ]);
  });

  test('rejects a key that is not some, every or none on an array relation', () => {
    expect(ownerMessages({ places: { name: 'Hub' } })).toEqual([
      "Unknown key 'name' in the filter on relation 'places' of model Owner — use some, every or none",
    ]);
  });

  test('rejects an unknown key whose value is falsy', () => {
    expect(placeMessages({ owner: { a: null, b: 0, c: '', d: false } })).toHaveLength(4);
  });

  test('reports the where path of the offending key', () => {
    expect(validateWhere({ owner: { nmae: 'x' } }, place, placeRegistry).errors[0]!.path).toBe('where.owner.nmae');
    expect(validateWhere({ owner: { places: { some: { nmae: 'x' } } } }, place, placeRegistry).errors[0]!.path).toBe(
      'where.owner.places.some.nmae',
    );
  });

  test('checks AND, OR and NOT inside a relation filter against the target model', () => {
    expect(placeMessages({ owner: { AND: [{ name: 'A' }, { name: 'B' }] } })).toEqual([]);
    expect(placeMessages({ owner: { OR: [{ nmae: 'A' }] } })).toEqual([unknown('owner.nmae', 'Owner')]);
    expect(placeMessages({ owner: { NOT: { nmae: 'A' } } })).toEqual([unknown('owner.nmae', 'Owner')]);
  });

  test('checks a relation nested inside a relation, naming each target', () => {
    expect(placeMessages({ owner: { places: { some: { name: 'x' } } } })).toEqual([]);
    expect(placeMessages({ owner: { places: { some: { nmae: 'x' } } } })).toEqual([
      unknown('places.some.nmae', 'Place'),
    ]);
  });

  test('checks object sub-fields and operators of the target through the relation', () => {
    expect(ownerMessages({ places: { some: { address: { city: 'NYC' } } } })).toEqual([]);
    expect(ownerMessages({ places: { some: { address: { cty: 'NYC' } } } })).toEqual([unknown('address.cty', 'Place')]);
    expect(ownerMessages({ places: { some: { name: { nope: 1 } } } })).toEqual(['Unknown operator: nope']);
  });

  test('checks a relation filter inside AND, OR and NOT at the top level', () => {
    expect(placeMessages({ AND: [{ owner: { nmae: 'A' } }] })).toHaveLength(1);
    expect(placeMessages({ NOT: { owner: { nmae: 'A' } } })).toHaveLength(1);
  });

  test('the target model name, not the queried one, appears in the message', () => {
    const [message] = placeMessages({ owner: { nmae: 'A' } });
    expect(message).toContain('model Owner');
    expect(message).not.toContain('model Place');
  });

  test('without a registry the relation filter is accepted as before', () => {
    expect(validateWhere({ owner: { nmae: 'A' } }, place).errors).toEqual([]);
  });
});
