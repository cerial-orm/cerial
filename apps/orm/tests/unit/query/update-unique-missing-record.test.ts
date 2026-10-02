/**
 * Unit tests: updateUnique and upsert on a record that does not exist.
 *
 * SurrealDB 3.x answers UPDATE ONLY and UPSERT ONLY on a missing record with a null result, not an
 * error, so "not found" is the null path. The builders once also turned an error whose message
 * contained a SurrealDB 2.x sentence into null; that read prose, and it hid real failures.
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import { QueryBuilder } from '../../../src/query/builder';

const { ast } = parse(`
model User {
  id Record @id
  email Email @unique
  name String
}
`);
const registry = astToRegistry(ast);
const userModel = registry.User!;

const oldWording = 'Expected a single result output when using the ONLY keyword';

/** A database whose queries resolve with `result`, or reject with `failure` when given. */
function fakeDb(result: unknown, failure?: Error): Surreal {
  return {
    query: () => ({
      collect: async () => {
        if (failure) throw failure;

        return result;
      },
    }),
  } as unknown as Surreal;
}

describe('updateUnique by id', () => {
  const where = { id: 'missing' };
  const data = { name: 'Bob' };

  test('returns null when the database reports no record', async () => {
    const builder = new QueryBuilder(fakeDb([null]), userModel, registry);

    expect(await builder.updateUnique({ where, data })).toBeNull();
  });

  test('returns false for return: true when the database reports no record', async () => {
    const builder = new QueryBuilder(fakeDb([null]), userModel, registry);

    expect(await builder.updateUnique({ where, data, return: true })).toBe(false);
  });

  test('propagates an error whose message reads like the old not-found sentence', async () => {
    const failure = new Error(oldWording);
    const builder = new QueryBuilder(fakeDb(undefined, failure), userModel, registry);

    await expect(builder.updateUnique({ where, data })).rejects.toBe(failure);
  });

  test('propagates an unrelated database error', async () => {
    const failure = new Error('Database index `u` already contains a value');
    const builder = new QueryBuilder(fakeDb(undefined, failure), userModel, registry);

    await expect(builder.updateUnique({ where, data })).rejects.toBe(failure);
  });
});

describe('upsert on a unique key', () => {
  const args = { where: { email: 'a@b.c' }, create: { email: 'a@b.c', name: 'A' }, update: { name: 'A' } };

  test('propagates an error whose message reads like the old not-found sentence', async () => {
    const failure = new Error(oldWording);
    const builder = new QueryBuilder(fakeDb(undefined, failure), userModel, registry);

    await expect(builder.upsert(args)).rejects.toBe(failure);
  });

  test('propagates an unrelated database error', async () => {
    const failure = new Error('connection reset');
    const builder = new QueryBuilder(fakeDb(undefined, failure), userModel, registry);

    await expect(builder.upsert(args)).rejects.toBe(failure);
  });
});
