/**
 * Unit Tests: logical operators inside a reverse-relation quantifier
 *
 * A bare AND/OR/NOT directly under a reverse relation is refused by the validator (the quantifier
 * says what is being quantified). Inside some/every/none the body is a where on the target model,
 * and its logical operators used to be skipped as unknown fields, widening the match silently.
 */

import { describe, expect, test } from 'bun:test';
import { compileFindMany } from '../../../src/query/builder';
import type { WhereClause } from '../../../src/types';
import { owner, placeRegistry } from './where-validation-helpers';

const compile = (where: WhereClause) => compileFindMany(owner, { where }, placeRegistry).query;
const sub = 'SELECT VALUE ownerId FROM place';
const orBody = '(name = $name_eq_0 OR name = $name_eq_1)';
const orVars = { name_eq_0: 'a', name_eq_1: 'b' };
const orWhere = { OR: [{ name: 'a' }, { name: 'b' }] };

describe('logical operators inside a quantifier', () => {
  test('some + OR', () => {
    const q = compile({ places: { some: orWhere } });

    expect(q.text).toBe(`SELECT * FROM owner WHERE id IN (${sub} WHERE ${orBody})`);
    expect(q.vars).toEqual(orVars);
  });

  test('none + OR', () => {
    const q = compile({ places: { none: orWhere } });

    expect(q.text).toBe(`SELECT * FROM owner WHERE id NOT IN (${sub} WHERE ${orBody})`);
    expect(q.vars).toEqual(orVars);
  });

  test('every + OR keeps the OR as the condition negated for counter-examples', () => {
    const q = compile({ places: { every: orWhere } });

    expect(q.text).toContain(`id NOT IN (${sub} WHERE NOT (${orBody}))`);
    expect(q.text).toContain(`AND id IN (${sub}))`);
    expect(q.vars).toEqual(orVars);
  });

  test('some + AND', () => {
    const q = compile({ places: { some: { AND: [{ name: 'a' }, { name: 'b' }] } } });

    expect(q.text).toContain(`WHERE (name = $name_eq_0 AND name = $name_eq_1))`);
  });

  test('some + NOT', () => {
    const q = compile({ places: { some: { NOT: { name: 'a' } } } });

    expect(q.text).toContain('WHERE NOT (name = $name_eq_0))');
    expect(q.vars).toEqual({ name_eq_0: 'a' });
  });

  test('a field filter beside OR is ANDed with it, not replaced by it', () => {
    const q = compile({ places: { some: { name: 'z', ...orWhere } } });

    expect(q.text).toContain('WHERE name = $name_eq_0 AND (name = $name_eq_1 OR name = $name_eq_2))');
    expect(q.vars).toEqual({ name_eq_0: 'z', name_eq_1: 'a', name_eq_2: 'b' });
  });

  test('nested logical operators compose', () => {
    const q = compile({ places: { some: { OR: [{ NOT: { name: 'a' } }, { AND: [{ name: 'b' }, { name: 'c' }] }] } } });

    expect(q.text).toContain('WHERE (NOT (name = $name_eq_0) OR (name = $name_eq_1 AND name = $name_eq_2)))');
  });
});

describe('bare logical operator directly under a reverse relation', () => {
  test.each(['AND', 'OR', 'NOT'])('%s is refused, not skipped', (op) => {
    const value = op === 'NOT' ? { name: 'a' } : [{ name: 'a' }];

    expect(() => compile({ places: { [op]: value } } as WhereClause)).toThrow(/Unknown key/);
  });

  test('a quantifier whose body is only an unknown key still raises', () => {
    expect(() => compile({ places: { some: { nope: 1 } } } as WhereClause)).toThrow();
  });
});
