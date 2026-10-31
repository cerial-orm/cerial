/**
 * Unit Tests: `$raw` on upsert
 *
 * An upsert skips the unique-field check, so a where made only of `$raw` would compile to
 * UPSERT table ... WHERE (fragment) and rewrite every row it matches. It refuses at any AND, OR and NOT
 * depth. `$raw` beside another condition stays allowed.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../../src/errors';
import { sql } from '../../../../src/query';
import { compileUpsert } from '../../../../src/query/builder';
import type { WhereClause } from '../../../../src/types';
import { author, registry } from '../relation-order-by-helpers';

const create = { name: 'n', address: { city: 'c' } };
const upsert = (where: unknown) =>
  compileUpsert(author, { where: where as WhereClause, create, update: { name: 'm' } }, registry);
const raw = sql`true`;

const rawOnly: Array<[string, unknown]> = [
  ['$raw alone', { $raw: raw }],
  ['inside AND', { AND: [{ $raw: raw }] }],
  ['inside NOT', { NOT: { $raw: raw } }],
  ['inside OR', { OR: [{ $raw: raw }] }],
  ['three levels down', { OR: [{ AND: [{ NOT: { $raw: raw } }] }] }],
  ['beside empty and undefined keys', { $raw: raw, name: undefined, AND: [] }],
];

describe('an upsert filtered only by $raw refuses (negative first)', () => {
  test.each(rawOnly)('%s', (_label, where) => {
    expect(() => upsert(where)).toThrow(CerialValidationError);
    expect(() => upsert(where)).toThrow('$raw');
  });

  test('the error names the model and the operation', () => {
    try {
      upsert({ $raw: raw });
    } catch (error) {
      expect((error as CerialValidationError).model).toBe('Author');
      expect((error as CerialValidationError).operation).toBe('upsert');
    }
    expect.assertions(2);
  });
});

describe('$raw beside another condition stays allowed', () => {
  const allowed: Array<[string, unknown]> = [
    ['beside an id', { id: 'a', $raw: raw }],
    ['beside a non-unique field', { name: 'a', $raw: raw }],
    ['beside a condition under AND', { AND: [{ $raw: raw }, { name: 'a' }] }],
    ['beside a condition under NOT', { name: 'a', NOT: { $raw: raw } }],
    ['no $raw at all', { name: 'a' }],
  ];

  test.each(allowed)('%s', (_label, where) => {
    expect(() => upsert(where)).not.toThrow();
  });
});
