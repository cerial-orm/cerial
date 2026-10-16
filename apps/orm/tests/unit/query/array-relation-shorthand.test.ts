/**
 * Unit Tests: a plain array-relation filter is shorthand for `some`, and `isEmpty` is an existence check
 *
 * Owner.places is a reverse array relation. Every operation that takes a filter must compile the
 * shorthand to exactly the text and bindings of the explicit `some`, because a form that works on
 * findMany and not on deleteMany is the defect this guards against. Destructive paths keep refusing
 * a filter that resolves to nothing.
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
import type { WhereClause } from '../../../src/types';
import { owner, placeRegistry } from './where-validation-helpers';

type Compiled = { text: string; vars: Record<string, unknown> };

const operations: Array<[string, (where: WhereClause) => Compiled]> = [
  ['findMany', (where) => compileFindMany(owner, { where }, placeRegistry).query],
  ['findOne', (where) => compileFindOne(owner, { where }, placeRegistry).query],
  ['count', (where) => compileCount(owner, where, placeRegistry).query],
  ['exists', (where) => compileExists(owner, where, placeRegistry).query],
  ['updateMany', (where) => compileUpdateMany(owner, { where, data: { name: 'x' } }, placeRegistry).query],
  ['deleteMany', (where) => compileDeleteMany(owner, { where }, placeRegistry).query],
];

const SUB = 'SELECT VALUE ownerId FROM place';

describe('plain array-relation filter compiles exactly as some', () => {
  const pairs: Array<[string, WhereClause, WhereClause]> = [
    ['a direct value', { places: { name: 'Hub' } }, { places: { some: { name: 'Hub' } } }],
    [
      'an operator object',
      { places: { name: { contains: 'H', startsWith: 'a' } } },
      { places: { some: { name: { contains: 'H', startsWith: 'a' } } } },
    ],
    ['two fields', { places: { name: 'Hub', ownerId: 1 } }, { places: { some: { name: 'Hub', ownerId: 1 } } }],
    [
      'an undefined sibling key',
      { places: { name: 'Hub', ownerId: undefined } },
      { places: { some: { name: 'Hub' } } },
    ],
  ];

  describe.each(operations)('%s', (_name, compile) => {
    test.each(pairs)('%s: same query text and bindings', (_label, plain, explicit) => {
      const a = compile(plain);
      const b = compile(explicit);

      expect(a.text).toBe(b.text);
      expect(a.vars).toEqual(b.vars);
    });
  });

  test('the shorthand filters on the subquery rather than dropping the clause', () => {
    const { text, vars } = compileFindMany(owner, { where: { places: { name: 'Hub' } } }, placeRegistry).query;

    expect(text).toBe(`SELECT * FROM owner WHERE id IN (${SUB} WHERE name = $name_eq_0)`);
    expect(vars).toEqual({ name_eq_0: 'Hub' });
  });

  test('deleteMany deletes parents with a matching child and carries the same condition', () => {
    const { text, vars } = compileDeleteMany(owner, { where: { places: { name: 'Hub' } } }, placeRegistry).query;

    expect(text).toContain(`WHERE id IN (${SUB} WHERE name = $name_eq_0)`);
    expect(vars).toMatchObject({ name_eq_0: 'Hub' });
  });
});

describe('what stays refused', () => {
  test.each(operations)('%s refuses shorthand keys mixed with a quantifier', (_name, compile) => {
    expect(() => compile({ places: { name: 'a', some: { name: 'b' } } })).toThrow('mixes the field keys');
    expect(() => compile({ places: { name: 'a', none: { name: 'b' } } })).toThrow('mixes the field keys');
    expect(() => compile({ places: { name: 'a', isEmpty: false } })).toThrow('mixes the field keys');
  });

  test.each(operations)('%s refuses an unknown shorthand key', (_name, compile) => {
    expect(() => compile({ places: { nope: 'a' } } as WhereClause)).toThrow();
  });

  test.each(['AND', 'OR', 'NOT'])('%s directly under an array relation is still refused', (op) => {
    const value = op === 'NOT' ? { name: 'a' } : [{ name: 'a' }];

    for (const [, compile] of operations) {
      expect(() => compile({ places: { [op]: value } } as WhereClause)).toThrow(/Unknown key/);
      expect(() => compile({ places: { [op]: value, name: 'a' } } as WhereClause)).toThrow(/Unknown key/);
    }
  });

  test.each(['some', 'every', 'none'])('a lone empty %s throws on every operation', (quantifier) => {
    for (const [, compile] of operations) {
      expect(() => compile({ places: { [quantifier]: {} } })).toThrow(
        `Relation filter on Owner.places produced no conditions from '${quantifier}'`,
      );
    }
  });

  test('an empty array-relation filter and a plain filter of only undefined values are not shorthand', () => {
    const { text } = compileFindMany(owner, { where: { places: { name: undefined } } }, placeRegistry).query;

    expect(text).toBe('SELECT * FROM owner');
    expect(() => compileDeleteMany(owner, { where: { places: { name: undefined } } }, placeRegistry)).toThrow(
      'the where filter resolved to no conditions',
    );
  });
});

describe('isEmpty on an array relation', () => {
  test.each(operations)('%s: isEmpty true means no related rows', (_name, compile) => {
    const { text, vars } = compile({ places: { isEmpty: true } });

    expect(text).toContain(`WHERE id NOT IN (${SUB})`);
    expect(vars).toEqual(expect.not.objectContaining({ name_eq_0: expect.anything() }));
  });

  test.each(operations)('%s: isEmpty false means at least one related row', (_name, compile) => {
    expect(compile({ places: { isEmpty: false } }).text).toContain(`WHERE id IN (${SUB})`);
  });

  test('isEmpty composes with a quantifier by AND', () => {
    const { text } = compileFindMany(
      owner,
      { where: { places: { isEmpty: false, none: { name: 'x' } } } },
      placeRegistry,
    ).query;

    expect(text).toBe(`SELECT * FROM owner WHERE id IN (${SUB}) AND id NOT IN (${SUB} WHERE name = $name_eq_0)`);
  });

  test('isEmpty undefined is skipped like any other undefined key', () => {
    expect(compileFindMany(owner, { where: { places: { isEmpty: undefined } } }, placeRegistry).query.text).toBe(
      'SELECT * FROM owner',
    );
  });

  test('isEmpty must be a boolean', () => {
    expect(() => compileFindMany(owner, { where: { places: { isEmpty: 'yes' } } } as never, placeRegistry)).toThrow(
      'must be a boolean',
    );
  });

  test('deleteMany with isEmpty is a real condition, so the no-filter guard stays quiet', () => {
    expect(() => compileDeleteMany(owner, { where: { places: { isEmpty: true } } }, placeRegistry)).not.toThrow();
  });
});
