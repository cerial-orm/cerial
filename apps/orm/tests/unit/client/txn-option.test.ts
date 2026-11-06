/**
 * Unit tests for the `txn` option: a value that is not a Cerial transaction is refused with a
 * CerialValidationError naming `txn` before any connection is touched.
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { Model } from '../../../src/client/model/model';
import { CerialValidationError } from '../../../src/errors';
import { sql } from '../../../src/query/compile';
import { parseModelRegistry } from '../../test-helpers';

const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}
`);

// Any use of the connection is a failure: the refusal comes first
const touched: string[] = [];
const db = new Proxy(
  {},
  {
    get: (_t, prop) => {
      touched.push(String(prop));

      return undefined;
    },
  },
) as unknown as Surreal;
const model = new Model(db, registry.User!, registry);

const where = { name: 'a' };
const data = { name: 'a' };
const calls = (txn: unknown): [string, () => PromiseLike<unknown>][] => {
  const t = txn as never;

  return [
    ['findMany', () => model.findMany({ where, txn: t })],
    ['findOne', () => model.findOne({ where, txn: t })],
    ['findUnique', () => model.findUnique({ where: { id: 'x' }, txn: t })],
    ['count', () => model.count(where, t)],
    ['exists', () => model.exists(where, t)],
    ['groupBy', () => model.groupBy({ by: { name: true } }, t)],
    ['create', () => model.create({ data, txn: t })],
    ['updateMany', () => model.updateMany({ where, data, txn: t })],
    ['updateUnique', () => model.updateUnique({ where: { id: 'x' }, data, txn: t })],
    ['upsert', () => model.upsert({ where: { id: 'x' }, create: data, update: data, txn: t })],
    ['deleteMany', () => model.deleteMany({ where, txn: t })],
    ['deleteUnique', () => model.deleteUnique({ where: { id: 'x' }, txn: t })],
    ['$raw', () => model.$raw(sql`SELECT 1`, { txn: t })],
  ];
};

const bad: [string, unknown][] = [
  ['an empty object', {}],
  ['a $raw object', { $raw: 'x' }],
  ['null', null],
  ['a string', 'txn'],
  ['a number', 1],
  ['a forged object', { _assertOpen: () => {}, _raw: {}, _track: (f: () => unknown) => f() }],
];

describe.each(bad)('txn is %s', (_name, value) => {
  test.each(calls(value))('%s refuses it', async (op, run) => {
    let error: unknown;
    try {
      await run();
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialValidationError).field).toBe('txn');
    expect((error as CerialValidationError).operation).toBe(op);
    expect((error as Error).message).toContain('txn');
    expect(touched).toEqual([]);
  });
});
