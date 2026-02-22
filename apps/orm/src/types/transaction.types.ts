/**
 * Transaction-specific type definitions for callback mode and transaction client
 */

import type { CerialQueryPromise } from '../query/cerial-query-promise';

/**
 * Callback function for transaction callback mode.
 * Receives a TransactionClient and returns a promise or value.
 *
 * @template R - The return type of the callback
 */
export type TransactionCallbackFn<R> = (tx: TransactionClient) => Promise<R> | R;

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  /** Optional timeout in milliseconds for the transaction */
  timeout?: number;
  /** Number of retry attempts on transaction conflict (default: 0 — no retry) */
  retries?: number;
  /**
   * Custom backoff function: receives 0-based attempt number, returns delay in ms.
   * Only used when retries > 0.
   * Default: exponential backoff with jitter — `(attempt) => 2 ** attempt * 10 + Math.random() * 10`
   */
  backoff?: (attempt: number) => number;
}

/**
 * Transaction client - mirrors TypedDb but without $transaction method.
 * Used as the parameter type for transaction callback functions.
 *
 * This is a generic interface that represents the model-access pattern.
 * The actual implementation is generated per-project with model-specific properties.
 */
export interface TransactionClient {
  [key: string]: any;
}

/**
 * Extract the result type from a transaction array item.
 * Handles CerialQueryPromise, sync/async functions returning values or CerialQueryPromise.
 *
 * Used in arity-specific $transaction overloads for typed prev parameters.
 */
export type TransactionItemResult<T> =
  T extends CerialQueryPromise<infer R>
    ? R
    : T extends (...args: any[]) => CerialQueryPromise<infer R>
      ? R
      : T extends (...args: any[]) => Promise<infer R>
        ? R
        : T extends (...args: any[]) => infer R
          ? R
          : unknown;
