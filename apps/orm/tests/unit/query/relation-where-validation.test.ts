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

  test('accepts a plain target field on a reverse array relation as shorthand for some', () => {
    expect(ownerMessages({ places: { name: 'Hub' } })).toEqual([]);
    expect(ownerMessages({ places: { name: { contains: 'H' } } })).toEqual([]);
  });

  test('checks the shorthand keys against the target model', () => {
    expect(ownerMessages({ places: { nmae: 'Hub' } })).toEqual([unknown('places.nmae', 'Place')]);
  });

  test('rejects shorthand keys beside an explicit key', () => {
    for (const explicit of [{ some: { name: 'a' } }, { none: { name: 'a' } }, { isEmpty: false }]) {
      expect(ownerMessages({ places: { name: 'Hub', ...explicit } })).toEqual([
        "The filter on relation 'places' of model Owner mixes the field keys 'name' with some, every, none or isEmpty — move the fields into a 'some' body",
      ]);
    }
  });

  test('accepts isEmpty with a quantifier and rejects a non-boolean isEmpty', () => {
    expect(ownerMessages({ places: { isEmpty: false, none: { name: 'a' } } })).toEqual([]);
    expect(ownerMessages({ places: { isEmpty: 'yes' } } as WhereClause)).toEqual([
      "isEmpty on relation 'places' of model Owner must be a boolean",
    ]);
  });

  test.each(['AND', 'OR', 'NOT'])('still rejects a bare %s on an array relation, beside shorthand keys too', (op) => {
    const value = op === 'NOT' ? { name: 'a' } : [{ name: 'a' }];
    const message = `Unknown key '${op}' in the filter on relation 'places' of model Owner — use some, every, none or isEmpty`;

    expect(ownerMessages({ places: { [op]: value } })).toEqual([message]);
    expect(ownerMessages({ places: { [op]: value, name: 'Hub' } })).toEqual([message]);
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

  test('without a registry the relation filter is refused, since its target model is unknown', () => {
    const { errors } = validateWhere({ owner: { nmae: 'A' } }, place);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('a model registry is required to filter on a relation');
  });

  test('without a registry a plain field filter is still accepted', () => {
    expect(validateWhere({ name: 'A' }, place).errors).toEqual([]);
  });
});
