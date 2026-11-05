/**
 * Unit tests: array-mode `$transaction` function items.
 *
 * A function item's returned query is lazy: awaiting it runs it on the default connection, outside the
 * transaction. The executor must take the query itself and run it on the transaction connection.
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { CerialQueryPromise } from '../../../src/query/cerial-query-promise';
import { executeClientTransaction } from '../../../src/query/executor';

interface Trace {
  standalone: string[];
  inTransaction: string[];
  ended: string[];
}

/** A database whose own `query` is the standalone path and whose transaction records what it ran. */
function fakeDb(): { db: Surreal; trace: Trace } {
  const trace: Trace = { standalone: [], inTransaction: [], ended: [] };
  const run = (into: string[]) => (bound: { query: string }) => {
    into.push(bound.query);

    return { collect: async () => [[{ ok: true }]] };
  };
  const txn = {
    query: run(trace.inTransaction),
    commit: async () => void trace.ended.push('commit'),
    cancel: async () => void trace.ended.push('cancel'),
  };
  const db = { query: run(trace.standalone), beginTransaction: async () => txn } as unknown as Surreal;

  return { db, trace };
}

const lazyQuery = (db: Surreal, text: string, trace: Trace): CerialQueryPromise<unknown> =>
  new CerialQueryPromise(
    async () => {
      trace.standalone.push(text);

      return undefined;
    },
    { text, vars: {} },
    undefined,
    'array',
  );

describe('executeClientTransaction function items', () => {
  test('a sync function item returning a query runs it on the transaction, not standalone', async () => {
    const { db, trace } = fakeDb();

    await executeClientTransaction(db, [() => lazyQuery(db, 'SELECT * FROM t', trace)]);

    expect(trace.inTransaction).toEqual(['SELECT * FROM t']);
    expect(trace.standalone).toEqual([]);
    expect(trace.ended).toEqual(['commit']);
  });

  test('the query the function builds from prevResults also runs on the transaction', async () => {
    const { db, trace } = fakeDb();

    const results = await executeClientTransaction(db, [
      () => lazyQuery(db, 'SELECT * FROM a', trace),
      (prev) => lazyQuery(db, `SELECT * FROM b -- ${prev.length}`, trace),
    ]);

    expect(trace.inTransaction).toEqual(['SELECT * FROM a', 'SELECT * FROM b -- 1']);
    expect(trace.standalone).toEqual([]);
    expect(results).toHaveLength(2);
  });

  test('a later throwing item cancels the transaction and the earlier function query never ran standalone', async () => {
    const { db, trace } = fakeDb();

    await expect(
      executeClientTransaction(db, [
        () => lazyQuery(db, 'CREATE t', trace),
        () => {
          throw new Error('boom');
        },
      ]),
    ).rejects.toThrow('boom');

    expect(trace.standalone).toEqual([]);
    expect(trace.ended).toEqual(['cancel']);
  });

  test('plain values and real promises are still awaited into the results', async () => {
    const { db, trace } = fakeDb();

    const results = await executeClientTransaction(db, [() => 5, async () => 'later', () => undefined]);

    expect(results).toEqual([5, 'later', undefined]);
    expect(trace.standalone).toEqual([]);
  });
});
