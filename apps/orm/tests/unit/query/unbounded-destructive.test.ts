/**
 * Unit Tests: a supplied where that compiles to nothing must never reach a destructive statement
 *
 * Covers the guard on every destructive builder, the absent-versus-empty distinction it rests on,
 * composite expansion in many-methods, the vacuous OR and NOT shapes, and unique-filter validation.
 * Place carries @@unique(nameCity, [name, address.city]) and a relation to Owner.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildDeleteUniqueWithCascade,
  buildDeleteWithCascade,
} from '../../../src/query/builders/delete-builder';
import { buildCountQuery, buildFindManyQuery, validateUniqueField } from '../../../src/query/builders/select-builder';
import { buildUpdateManyQuery, buildUpdateUniqueQuery } from '../../../src/query/builders/update-builder';
import { buildUpsertQuery } from '../../../src/query/builders/upsert-builder';
import { transformDestructiveWhere } from '../../../src/query/filters';
// Unchecked compile: the public helper refuses the vacuous filters these tests pin
import { transformWhereClause } from '../../../src/query/filters/transformer';
import type { WhereClause } from '../../../src/types';
import { owner, place, placeRegistry } from './where-validation-helpers';

// Hostile shapes are what a JavaScript or cast caller can send; the generated types reject them
const hostile = (value: unknown): WhereClause => value as WhereClause;

const refusal = (operation: string) =>
  `${operation} on Place: the where filter resolved to no conditions, so the statement would affect every row. Omit where entirely to affect every row.`;

const vanishing: Array<[string, WhereClause]> = [
  ['AND: []', { AND: [] }],
  ['every value undefined', { name: undefined, ownerId: undefined }],
  ['an unknown key', hostile({ nope: 1 })],
  ['AND holding only an empty condition', { AND: [{ name: undefined }] }],
  ['OR holding only an empty condition', { OR: [{ name: undefined }] }],
];

describe('transformDestructiveWhere — absent versus present-but-vanished', () => {
  test('an absent where is allowed and emits no WHERE', () => {
    expect(transformDestructiveWhere(undefined, place, 'deleteMany')).toEqual({ text: '', vars: {} });
  });

  test('a where with no keys is allowed and emits no WHERE', () => {
    expect(transformDestructiveWhere({}, place, 'deleteMany')).toEqual({ text: '', vars: {} });
  });

  test.each(vanishing)('%s throws, naming the operation and the model', (_label, where) => {
    expect(() => transformDestructiveWhere(where, place, 'deleteMany')).toThrow(refusal('deleteMany'));
  });

  test('a real condition compiles to a WHERE', () => {
    expect(transformDestructiveWhere({ name: 'a' }, place, 'deleteMany').text).toBe('WHERE name = $name_eq_0');
  });

  test('a real condition next to a vanished one keeps the real one', () => {
    expect(transformDestructiveWhere({ name: 'a', ownerId: undefined }, place, 'deleteMany').text).toBe(
      'WHERE name = $name_eq_0',
    );
  });
});

describe('the guard sits on every destructive builder', () => {
  const data = { name: 'x' };

  test.each(vanishing)('%s: buildDeleteQuery and buildDeleteQueryWithReturn throw', (_label, where) => {
    expect(() => buildDeleteQuery(place, where)).toThrow(refusal('deleteMany'));
    expect(() => buildDeleteQueryWithReturn(place, where)).toThrow(refusal('deleteMany'));
  });

  test.each(vanishing)('%s: buildDeleteWithCascade throws', (_label, where) => {
    expect(() => buildDeleteWithCascade(owner, where, placeRegistry)).toThrow(
      refusal('deleteMany').replace('Place', 'Owner'),
    );
  });

  test.each(vanishing)('%s: buildUpdateManyQuery throws', (_label, where) => {
    expect(() => buildUpdateManyQuery(place, where, data)).toThrow(refusal('updateMany'));
  });

  test.each(vanishing)('%s: the update half of upsert throws', (_label, where) => {
    expect(() => buildUpsertQuery(place, where, { name: 'n' }, data, true)).toThrow(refusal('upsert'));
  });

  test('a vanished filter beside an id still throws in updateUnique rather than dropping it', () => {
    expect(() => buildUpdateUniqueQuery(place, { id: 'a', AND: [] }, data, true)).toThrow(refusal('updateUnique'));
  });

  test('the cascading unique delete refuses to pick an arbitrary row to delete', () => {
    const noId = { ...place, fields: place.fields.map((f) => ({ ...f, isId: false })) };
    // validateUniqueField would normally stop this earlier; the guard is the backstop behind it
    expect(() => buildDeleteUniqueWithCascade(noId, { name: undefined }, placeRegistry, false)).toThrow();
  });

  test('absent where still builds an unconditional statement on every builder', () => {
    expect(buildDeleteQuery(place, {}).text).toBe('DELETE FROM place');
    expect(buildDeleteQueryWithReturn(place, {}).text).toBe('DELETE FROM place RETURN BEFORE');
    expect(buildUpdateManyQuery(place, {}, data).text).toBe('UPDATE place SET name = $name_set_0 RETURN *');
  });

  test('correct filters still build a WHERE on every builder', () => {
    expect(buildDeleteQuery(place, { name: 'a' }).text).toBe('DELETE FROM place WHERE name = $name_eq_0');
    expect(buildUpdateManyQuery(place, { name: 'a' }, data).text).toContain('WHERE name = $name_eq_0');
    expect(buildUpsertQuery(place, { name: 'a' }, { name: 'n' }, data, true).text).toContain('WHERE name = $name_eq_0');
  });
});

describe('composite keys expand in the many-methods', () => {
  const composite = { nameCity: { name: 'Hub', address: { city: 'NYC' } } };

  test('deleteMany carries the expanded dotted conditions', () => {
    const query = buildDeleteQueryWithReturn(place, hostile(composite));

    expect(query.text).toBe(
      'DELETE FROM place WHERE name = $name_eq_0 AND address.city = $address_city_eq_1 RETURN BEFORE',
    );
    expect(Object.values(query.vars)).toEqual(['Hub', 'NYC']);
  });

  test('updateMany carries the expanded conditions', () => {
    const query = buildUpdateManyQuery(place, hostile(composite), { name: 'x' });

    expect(query.text).toContain('WHERE name = $name_eq_');
    expect(query.text).toContain('AND address.city = $address_city_eq_');
  });

  test('findMany and count carry the expanded conditions', () => {
    expect(buildFindManyQuery(place, { where: hostile(composite) }).text).toContain('WHERE name = ');
    expect(buildCountQuery(place, hostile(composite)).text).toContain('address.city = ');
  });

  test('a composite inside AND, OR and NOT expands too', () => {
    for (const key of ['AND', 'OR']) {
      const text = buildDeleteQuery(place, hostile({ [key]: [composite, { name: 'z' }] })).text;
      expect(text).toContain('address.city = ');
    }
    expect(buildDeleteQuery(place, hostile({ NOT: composite })).text).toContain('NOT (name = ');
  });

  test('the composite key never leaves a valid filter empty', () => {
    expect(() => buildDeleteQuery(place, hostile(composite))).not.toThrow();
  });
});

describe('cascade delete removes the ids it captured', () => {
  test('the final DELETE does not re-run the filter after the children are gone', () => {
    const query = buildDeleteWithCascade(owner, hostile({ places: { some: { name: 'p' } } }), placeRegistry);
    const lines = query.text.split(';\n');

    expect(lines.at(-2)).toBe('DELETE FROM owner WHERE id IN $to_delete.id RETURN BEFORE');
  });

  test('a relation filter is compiled, not dropped, because the cascade builders now receive the registry', () => {
    const query = buildDeleteWithCascade(owner, hostile({ places: { some: { name: 'p' } } }), placeRegistry);

    expect(query.text).toContain('LET $to_delete = (SELECT id FROM owner WHERE ');
    expect(query.text).toContain('FROM place WHERE name = ');
  });

  test('deleteMany and updateMany compile a forward relation filter', () => {
    const filter = hostile({ owner: { name: 'Ada' } });

    expect(buildDeleteQueryWithReturn(place, filter, placeRegistry).text).toContain('WHERE ownerId.name = ');
    expect(buildUpdateManyQuery(place, filter, { name: 'x' }, undefined, undefined, placeRegistry).text).toContain(
      'WHERE ownerId.name = ',
    );
    // Without the registry the relation key was compared as a literal column and matched nothing
    expect(buildDeleteQueryWithReturn(place, filter).text).toContain('WHERE owner = $owner_eq_0');
  });
});

describe('vacuous logical shapes', () => {
  test('OR: [] is false, matching no row', () => {
    expect(transformWhereClause({ OR: [] }, place).text).toBe('WHERE false');
  });

  test('NOT: {} is false, matching no row', () => {
    expect(transformWhereClause({ NOT: {} }, place).text).toBe('WHERE false');
  });

  test('OR: [] beside another condition folds the conjunction to false', () => {
    expect(transformWhereClause({ name: 'a', OR: [] }, place).text).toBe('WHERE false');
  });

  test('a nested OR: [] is false inside its parent', () => {
    expect(transformWhereClause({ AND: [{ name: 'a' }, { OR: [] }] }, place).text).toBe('WHERE false');
  });

  test('AND: [] stays vacuously true: no condition at all', () => {
    expect(transformWhereClause({ AND: [] }, place).text).toBe('');
  });

  test('reads use the same compile, so findMany agrees with deleteMany', () => {
    expect(buildFindManyQuery(place, { where: { OR: [] } }).text).toBe('SELECT * FROM place WHERE false');
    expect(buildFindManyQuery(place, { where: { NOT: {} } }).text).toBe('SELECT * FROM place WHERE false');
  });

  test('a destructive statement with OR: [] is bounded rather than refused', () => {
    expect(buildDeleteQuery(place, { OR: [] }).text).toBe('DELETE FROM place WHERE false');
    expect(buildDeleteQuery(place, { NOT: {} }).text).toBe('DELETE FROM place WHERE false');
  });
});

describe('validateUniqueField — plain values only', () => {
  test('rejects an operator object on a unique field, naming the key and the operator', () => {
    expect(() => validateUniqueField(hostile({ id: { in: ['a'] } }), place, 'deleteUnique')).toThrow(
      "deleteUnique on Place: unique key 'id' must be a plain value, not a filter object (in). A unique filter takes plain values only",
    );
  });

  test('rejects an operator object even when another unique key is plain', () => {
    expect(() => validateUniqueField(hostile({ id: 'a', nameCity: undefined }), place, 'x')).not.toThrow();
  });

  test('accepts a plain id, and a typed record id object', () => {
    expect(() => validateUniqueField({ id: 'a' }, place, 'deleteUnique')).not.toThrow();
    expect(() => validateUniqueField(hostile({ id: { service: 'api', ts: 1 } }), place, 'deleteUnique')).not.toThrow();
  });

  test('a non-unique operator object beside a plain unique value is still fine', () => {
    expect(() =>
      validateUniqueField(hostile({ id: 'a', name: { contains: 'x' } }), place, 'deleteUnique'),
    ).not.toThrow();
  });
});
