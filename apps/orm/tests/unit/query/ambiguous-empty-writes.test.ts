/**
 * Unit Tests: a write refuses the empty shapes a read gives a meaning
 *
 * `owner: {}` (and the bodies equivalent to it) and an empty operator object select rows by a rule a write
 * should not guess, so every destructive entry and the exported where helpers throw a named
 * CerialValidationError. The same shapes still compile on reads, quantifier `{}` and `isEmpty` stay allowed on
 * writes, and the explicit forms pass.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../src/errors';
import {
  compileCount,
  compileDeleteMany,
  compileDeleteUnique,
  compileExists,
  compileFindMany,
  compileUpdateMany,
  compileUpdateUnique,
} from '../../../src/query/builder';
import { buildDeleteQueryChecked, buildUpdateManyQueryChecked } from '../../../src/query/builders/checked';
import { transformDestructiveWhere } from '../../../src/query/filters';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import {
  buildConditionsChecked,
  transformWhereChecked,
  transformWhereClauseChecked,
} from '../../../src/query/filters/checked-where';
import type { WhereClause } from '../../../src/types';
import { place, placeRegistry } from './where-validation-helpers';

const MESSAGE = /ambiguous on a write/;

const shapes: Array<[string, WhereClause]> = [
  ['owner: {}', { owner: {} }],
  ['owner: { AND: [] }', { owner: { AND: [] } }],
  ['owner: { name: undefined }', { owner: { name: undefined } }],
  ['owner: { name: {} }', { owner: { name: {} } }],
  ['owner: { AND: [{}] }', { owner: { AND: [{}] } }],
  ['name: {}', { name: {} }],
  ['name: { eq: undefined }', { name: { eq: undefined } }],
  ['beside a real condition', { name: 'a', owner: {} }],
  ['under NOT', { NOT: { owner: {} } }],
  ['under OR', { OR: [{ name: 'a' }, { owner: {} }] }],
  ['inside a reverse body', { owner: { places: { some: { owner: {} } } } }],
  ['at depth 2 in a to-one body', { owner: { places: { some: { name: {} } } } }],
];

const writes: Array<[string, (where: WhereClause) => unknown]> = [
  ['updateMany', (where) => compileUpdateMany(place, { where, data: { name: 'x' } }, placeRegistry)],
  ['deleteMany', (where) => compileDeleteMany(place, { where }, placeRegistry)],
  [
    'updateUnique',
    (where) => compileUpdateUnique(place, { where: { id: 'p1', ...where }, data: { name: 'x' } }, placeRegistry),
  ],
  ['deleteUnique', (where) => compileDeleteUnique(place, { where: { id: 'p1', ...where } }, placeRegistry)],
  ['upsert (destructive where)', (where) => transformDestructiveWhere(where, place, 'upsert', placeRegistry)],
  [
    'buildUpdateManyQueryChecked',
    (where) => buildUpdateManyQueryChecked(place, where, { name: 'x' }, undefined, undefined, placeRegistry),
  ],
  ['buildDeleteQueryChecked', (where) => buildDeleteQueryChecked(place, where, placeRegistry)],
  ['transformWhereChecked', (where) => transformWhereChecked(where, place, placeRegistry)],
  ['transformWhereClauseChecked', (where) => transformWhereClauseChecked(where, place, placeRegistry)],
  ['buildConditionsChecked', (where) => buildConditionsChecked(createCompileContext(), where, place, placeRegistry)],
];

describe('every destructive entry and exported helper refuses an ambiguous empty shape', () => {
  for (const [entry, run] of writes) {
    test.each(shapes)(`${entry}: %s`, (_label, where) => {
      expect(() => run(where)).toThrow(CerialValidationError);
      expect(() => run(where)).toThrow(MESSAGE);
    });
  }

  test('the message names the explicit forms', () => {
    expect(() => compileDeleteMany(place, { where: { owner: {} } }, placeRegistry)).toThrow(/owner: null/);
    expect(() => compileDeleteMany(place, { where: { owner: {} } }, placeRegistry)).toThrow(/NOT: \{ owner: null \}/);
  });
});

describe('reads keep the meaning of the same shapes', () => {
  test.each(shapes)('findMany, count and exists accept %s', (_label, where) => {
    expect(() => compileFindMany(place, { where }, placeRegistry)).not.toThrow();
    expect(() => compileCount(place, where, placeRegistry)).not.toThrow();
    expect(() => compileExists(place, where, placeRegistry)).not.toThrow();
  });

  test('owner: {} reads as "has an owner"', () => {
    expect(compileFindMany(place, { where: { owner: {} } }, placeRegistry).query.text).toContain(
      'WHERE (ownerId.id != NONE)',
    );
  });
});

describe('the explicit forms and quantifier bodies stay allowed on writes', () => {
  const allowed: Array<[string, WhereClause]> = [
    ['owner: null', { owner: null }],
    ['NOT: { owner: null }', { NOT: { owner: null } }],
    ['a real operator', { name: { eq: 'a' } }],
    ['a real owner condition', { owner: { name: 'a' } }],
    ['places: { some: {} }', { name: { neq: 'zz' }, owner: { places: { some: {} } } }],
    ['places: { none: {} }', { owner: { places: { none: {} } } }],
    ['places: { every: {} }', { owner: { places: { every: {} } } }],
    ['places: { isEmpty: true }', { owner: { places: { isEmpty: true } } }],
  ];

  for (const [entry, run] of writes) {
    test.each(allowed)(`${entry}: %s`, (_label, where) => {
      expect(() => run(where)).not.toThrow();
    });
  }
});

describe('a different failure is not masked', () => {
  test('an unknown key in a relation body still raises its own error', () => {
    expect(() => compileDeleteMany(place, { where: { owner: { nope: 1 } as WhereClause } }, placeRegistry)).toThrow(
      /nope/,
    );
  });
});
