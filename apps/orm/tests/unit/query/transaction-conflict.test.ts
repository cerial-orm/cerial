/**
 * Unit tests: transaction-conflict detection.
 *
 * A conflict is recognised from the structured `TransactionConflict` detail the server sends, never
 * from the wording of the message. Retrying on prose broke whenever the server reworded it, and
 * retried unrelated errors that happened to contain the same words.
 */

import { describe, expect, test } from 'bun:test';
import { QueryError, ServerError, type Surreal } from 'surrealdb';
import { executeQuerySingle, isTransactionConflict } from '../../../src/query/executor';

const conflict = (message = 'There was a problem with the key-value store'): QueryError =>
  new QueryError({ kind: 'Query', message, details: { kind: 'TransactionConflict' } });

/** A database whose every query rejects with the next queued outcome, then resolves with `[[{ id: 'ok' }]]`. */
function fakeDb(outcomes: unknown[]): { db: Surreal; calls: () => number } {
  let calls = 0;
  const db = {
    query: () => ({
      collect: async () => {
        const outcome = outcomes[calls++];
        if (outcome !== undefined) throw outcome;

        return [[{ id: 'ok' }]];
      },
    }),
  } as unknown as Surreal;

  return { db, calls: () => calls };
}

const query = { text: 'UPDATE user:1 SET name = $name', vars: { name: 'a' } };

describe('isTransactionConflict', () => {
  test('is true for a QueryError carrying the TransactionConflict detail', () => {
    expect(isTransactionConflict(conflict())).toBe(true);
  });

  test('does not read the message: a conflict with reworded prose is still a conflict', () => {
    expect(isTransactionConflict(conflict('the store asked us to try again'))).toBe(true);
  });

  test('is false for a plain Error whose message uses the old wording', () => {
    expect(isTransactionConflict(new Error('Transaction conflict: Write conflict, retry the transaction'))).toBe(false);
    expect(isTransactionConflict(new Error('write conflict'))).toBe(false);
  });

  test('is false for a QueryError that is not a conflict', () => {
    const timedOut = new QueryError({ kind: 'Query', message: 'timed out', details: { kind: 'TimedOut' } });

    expect(isTransactionConflict(timedOut)).toBe(false);
  });

  test('is false for a server error of another kind with conflict wording', () => {
    const other = new ServerError({ kind: 'Internal', message: 'Transaction conflict: Write conflict' });

    expect(isTransactionConflict(other)).toBe(false);
  });

  test('is false for non-errors', () => {
    expect(isTransactionConflict(undefined)).toBe(false);
    expect(isTransactionConflict('transaction conflict')).toBe(false);
    expect(isTransactionConflict(null)).toBe(false);
  });
});

describe('executeQuerySingle retries', () => {
  test('retries a structured conflict and returns the retried result', async () => {
    const { db, calls } = fakeDb([conflict(), conflict()]);

    const result = await executeQuerySingle(db, query, { maxRetries: 2 });

    expect(result).toEqual({ id: 'ok' });
    expect(calls()).toBe(3);
  });

  test('gives up after maxRetries and rethrows the conflict', async () => {
    const { db, calls } = fakeDb([conflict(), conflict(), conflict()]);

    await expect(executeQuerySingle(db, query, { maxRetries: 1 })).rejects.toBeInstanceOf(QueryError);
    expect(calls()).toBe(2);
  });

  test('does not retry an error that only reads like a conflict', async () => {
    const lookalike = new Error('Transaction conflict: Write conflict, retry the transaction');
    const { db, calls } = fakeDb([lookalike]);

    await expect(executeQuerySingle(db, query, { maxRetries: 3 })).rejects.toBe(lookalike);
    expect(calls()).toBe(1);
  });

  test('does not retry when retries are off, even for a real conflict', async () => {
    const { db, calls } = fakeDb([conflict()]);

    await expect(executeQuerySingle(db, query)).rejects.toBeInstanceOf(QueryError);
    expect(calls()).toBe(1);
  });
});
