/**
 * Unit tests: a where that is not a plain object, and null on a reverse relation
 *
 * `[]`, `5`, `true` and `null` used to read as an empty filter, so a write guarded by one ran against every row.
 * `posts: null` on a reverse relation was dropped by the condition builder, widening the filter the same way.
 * Both are refused with a named error; `undefined` still means no filter, and null on a forward relation still
 * means "the foreign key is null".
 */

import { describe, expect, test } from 'bun:test';
import {
  compileCount,
  compileDeleteMany,
  compileExists,
  compileFindMany,
  compileFindOne,
  compileUpdateMany,
} from '../../../src/query/builder';
import { buildFindManyQuery } from '../../../src/query/builders';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { transformWhere } from '../../../src/query/filters/transformer';
import { buildConditionsChecked, transformWhereChecked } from '../../../src/query/filters/checked-where';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { author, post, registry } from './relation-order-by-helpers';
import { owner, place, placeRegistry } from './where-validation-helpers';

const hostile = (value: unknown): WhereClause => value as WhereClause;

const NON_OBJECTS: Array<[string, unknown]> = [
  ['an empty array', []],
  ['an array', [{ name: 'a' }]],
  ['a number', 5],
  ['a boolean', true],
  ['false', false],
  ['zero', 0],
  ['a string', 'abc'],
  ['an empty string', ''],
  ['null', null],
];

describe('validateWhere: a where must be an object', () => {
  test.each(NON_OBJECTS)('refuses %s', (_label, value) => {
    const result = validateWhere(hostile(value), owner, placeRegistry);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.path).toBe('where');
    expect(result.errors[0]?.message).toContain('where must be an object');
  });

  test('undefined means no filter', () => {
    expect(validateWhere(undefined, owner, placeRegistry)).toEqual({ valid: true, errors: [] });
  });

  test('an empty object and a valid object pass', () => {
    expect(validateWhere({}, owner, placeRegistry).valid).toBe(true);
    expect(validateWhere({ name: 'a' }, owner, placeRegistry).valid).toBe(true);
  });
});

describe('every compile entry point refuses a non-object where', () => {
  const entries: Array<[string, (where: WhereClause) => unknown]> = [
    ['findMany', (where) => compileFindMany(owner, { where }, placeRegistry)],
    ['findOne', (where) => compileFindOne(owner, { where }, placeRegistry)],
    ['count', (where) => compileCount(owner, where, placeRegistry)],
    ['exists', (where) => compileExists(owner, where, placeRegistry)],
    ['updateMany', (where) => compileUpdateMany(owner, { where, data: { name: 'x' } }, placeRegistry)],
    ['deleteMany', (where) => compileDeleteMany(owner, { where }, placeRegistry)],
  ];

  for (const [name, run] of entries) {
    test.each(NON_OBJECTS)(`${name} refuses %s`, (_label, value) => {
      expect(() => run(hostile(value))).toThrow('where must be an object');
    });

    test(`${name} accepts a valid where`, () => {
      expect(() => run({ name: 'a' })).not.toThrow();
    });
  }

  test('findMany and count still accept an omitted where', () => {
    expect(compileFindMany(owner, {}, placeRegistry).query.text).not.toContain('WHERE');
    expect(compileCount(owner, undefined, placeRegistry).query.text).not.toContain('WHERE');
  });
});

describe('the checked helpers refuse a non-object where', () => {
  test.each(NON_OBJECTS)('%s', (_label, value) => {
    expect(() => transformWhereChecked(hostile(value), owner, placeRegistry)).toThrow('where must be an object');
    expect(() => buildConditionsChecked(createCompileContext(), hostile(value), owner, placeRegistry)).toThrow(
      'where must be an object',
    );
  });

  test('undefined and a valid object still compile', () => {
    expect(transformWhereChecked(undefined, owner, placeRegistry).text).toBe('');
    expect(transformWhereChecked({ name: 'a' }, owner, placeRegistry).text).toContain('name');
  });
});

describe('include where must be an object', () => {
  const include = (where: unknown) => () =>
    buildFindManyQuery(author, { include: { posts: { where } } } as never, registry);

  test.each(NON_OBJECTS)('refuses %s', (_label, value) => {
    expect(include(value)).toThrow('where must be an object');
  });

  test('an empty object and an omitted where still build', () => {
    expect(include({})).not.toThrow();
    expect(include(undefined)).not.toThrow();
  });
});

describe('null on a reverse relation', () => {
  const nullPosts: Array<[string, unknown]> = [
    ['alone', { places: null }],
    ['beside a valid key', { name: 'a', places: null }],
    ['inside AND', { AND: [{ name: 'a' }, { places: null }] }],
    ['inside OR', { OR: [{ name: 'a' }, { places: null }] }],
    ['inside NOT', { NOT: { places: null } }],
    ['inside a nested NOT in OR', { OR: [{ NOT: { places: null } }] }],
  ];

  test.each(nullPosts)('validateWhere refuses it %s and points to isEmpty', (_label, where) => {
    const result = validateWhere(hostile(where), owner, placeRegistry);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain("'places' is a reverse relation on Owner");
    expect(result.errors[0]?.message).toContain('isEmpty: true');
  });

  test.each(nullPosts)('deleteMany and updateMany refuse it %s', (_label, where) => {
    expect(() => compileDeleteMany(owner, { where: hostile(where) }, placeRegistry)).toThrow('reverse relation');
    expect(() => compileUpdateMany(owner, { where: hostile(where), data: { name: 'x' } }, placeRegistry)).toThrow(
      'reverse relation',
    );
    expect(() => compileFindMany(owner, { where: hostile(where) }, placeRegistry)).toThrow('reverse relation');
  });

  test('the condition builder fails closed when the validator is bypassed', () => {
    expect(() => buildConditions(createCompileContext(), hostile({ places: null }), owner, placeRegistry)).toThrow(
      'reverse relation',
    );
    expect(() => transformWhere(hostile({ name: 'a', places: null }), owner, placeRegistry)).toThrow(
      'reverse relation',
    );
  });

  test('the checked helpers refuse it', () => {
    expect(() => transformWhereChecked(hostile({ places: null }), owner, placeRegistry)).toThrow('reverse relation');
  });

  test('a relation filter inside an include where refuses it too', () => {
    expect(() =>
      buildFindManyQuery(author, { include: { posts: { where: { author: { posts: null } } } } } as never, registry),
    ).toThrow();
  });

  test('isEmpty: true still compiles', () => {
    expect(validateWhere({ places: { isEmpty: true } }, owner, placeRegistry).valid).toBe(true);
    expect(compileDeleteMany(owner, { where: { places: { isEmpty: true } } }, placeRegistry).query.text).toContain(
      'DELETE',
    );
  });

  test('null on a forward relation keeps compiling to the foreign key', () => {
    expect(validateWhere(hostile({ owner: null }), place, placeRegistry).valid).toBe(true);
    const text = transformWhere(hostile({ owner: null }), place, placeRegistry).text;

    expect(text).toContain('ownerId');
    expect(post).toBeDefined();
  });
});
