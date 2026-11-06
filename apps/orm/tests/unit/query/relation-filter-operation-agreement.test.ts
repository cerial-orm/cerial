/**
 * Unit Tests: the six operations agree on a relation filter that carries a logical operator
 *
 * Before the operators compiled on the forward-relation path, findMany and findOne accepted the
 * shape while count, exists, updateMany and deleteMany refused it. All six now compile the same
 * condition, and the no-filter guard still refuses a where that genuinely resolves to nothing.
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
import { place, placeRegistry } from './where-validation-helpers';

const condition = '(ownerId.name = $ownerId_name_eq_0 OR ownerId.name = $ownerId_name_eq_1)';
const where: WhereClause = { owner: { OR: [{ name: 'a' }, { name: 'b' }] } };
const vars = { ownerId_name_eq_0: 'a', ownerId_name_eq_1: 'b' };

const operations: Array<[string, () => { query: { text: string; vars: Record<string, unknown> } }]> = [
  ['findMany', () => compileFindMany(place, { where }, placeRegistry)],
  ['findOne', () => compileFindOne(place, { where }, placeRegistry)],
  ['count', () => compileCount(place, where, placeRegistry)],
  ['exists', () => compileExists(place, where, placeRegistry)],
  ['updateMany', () => compileUpdateMany(place, { where, data: { name: 'x' } }, placeRegistry)],
  ['deleteMany', () => compileDeleteMany(place, { where }, placeRegistry)],
];

describe('relation filter with OR: all six operations agree', () => {
  test.each(operations)('%s accepts it and filters on the condition', (_name, compile) => {
    const { query } = compile();

    expect(query.text).toContain(`WHERE ${condition}`);
    expect(query.vars).toMatchObject(vars);
  });

  test('every operation emits the same WHERE clause and variables', () => {
    const wheres = operations.map(([, compile]) => {
      const { query } = compile();

      return {
        clause: query.text.slice(query.text.indexOf('WHERE')).split(/\)?;| (?:LIMIT|GROUP|RETURN)/)[0],
        vars: query.vars,
      };
    });

    for (const w of wheres) {
      expect(w.clause).toBe(`WHERE ${condition}`);
      expect(w.vars).toMatchObject(vars);
    }
  });
});

describe('the no-filter guard still refuses a where that resolves to nothing', () => {
  const vanished: WhereClause = { owner: {} };

  test.each([
    ['updateMany', () => compileUpdateMany(place, { where: vanished, data: { name: 'x' } }, placeRegistry)],
    ['deleteMany', () => compileDeleteMany(place, { where: vanished }, placeRegistry)],
  ])('%s throws instead of touching every row', (_name, compile) => {
    expect(compile).toThrow();
  });

  test('a top-level vanishing where is refused by deleteMany', () => {
    expect(() => compileDeleteMany(place, { where: { AND: [] } }, placeRegistry)).toThrow(
      'the where filter resolved to no conditions',
    );
  });
});

describe('an empty OR inside a relation filter', () => {
  test('matches nothing rather than everything, so deleteMany cannot widen', () => {
    const { query } = compileDeleteMany(place, { where: { owner: { OR: [] } } }, placeRegistry);

    expect(query.text).toContain('WHERE false');
  });
});
