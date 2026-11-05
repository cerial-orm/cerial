import { AsyncLocalStorage } from 'node:async_hooks';
import type { Surreal } from 'surrealdb';
import { CerialTransactionError } from '../errors';
import type { CerialTransaction } from './cerial-transaction';

/** The transaction a function item or callback attempt runs in, and the one Surreal instance it began on. */
export interface TransactionScope {
  readonly owner: object;
  readonly txn: CerialTransaction;
}

// Created on the first $transaction, not at module load: on Node 22 an existing AsyncLocalStorage turns
// on promise hooks for the whole process, which a program that never opens a transaction should not pay for.
let storage: AsyncLocalStorage<TransactionScope> | undefined;

/** Run `fn` with `scope` active for it and everything it awaits. */
export function runInTransactionScope<T>(scope: TransactionScope, fn: () => T): T {
  storage ??= new AsyncLocalStorage<TransactionScope>();

  return storage.run(scope, fn);
}

/**
 * The transaction an unbound query of `owner` belongs to, if one is active. The owner is a client's own
 * token, not its socket: clients with the same config share one pooled socket and must not share a scope.
 */
export function resolveRouted(owner: object): CerialTransaction | undefined {
  const scope = storage?.getStore();

  return scope?.owner === owner ? scope.txn : undefined;
}

/** A client cannot open a second transaction on the connection its scope already runs on. */
export function refuseNestedTransaction(owner: object | undefined): void {
  if (owner && resolveRouted(owner)) {
    throw new CerialTransactionError('Nested transactions are not supported', { operation: '$transaction' });
  }
}

/**
 * Run a client-level query: inside an active scope on `owner` it runs on that transaction and is tracked
 * so commit and cancel wait for it; a query that starts after the transaction ended is refused unsent.
 */
export function runRouted<R>(
  owner: object,
  db: Surreal,
  operation: string,
  run: (db: Surreal) => PromiseLike<R>,
): Promise<R> {
  const bound = resolveRouted(owner);
  if (!bound) return Promise.resolve(run(db));
  bound._assertOpen(operation);

  return bound._track(() => run(bound._raw as unknown as Surreal));
}
