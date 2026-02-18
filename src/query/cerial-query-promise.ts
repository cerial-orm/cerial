/**
 * CerialQueryPromise - A thenable query descriptor
 *
 * Returned by all model methods (findOne, create, etc.). Auto-executes when awaited,
 * but can be collected into client.$transaction([...]) for batched execution.
 *
 * Implements PromiseLike<T> (not extends Promise) to preserve lazy execution — the
 * query only runs when `.then()` is called (i.e., when awaited or chained).
 *
 * Note: Bun's `expect().rejects` requires `instanceof Promise`, so tests that check
 * for rejected CerialQueryPromise must wrap in an async arrow:
 *   await expect(async () => { await query; }).rejects.toThrow()
 */

import type { ModelMetadata, ModelRegistry } from '../types';
import type { CompiledQuery } from './compile/types';

/** Result type classification for transaction result mapping */
export type QueryResultType = 'single' | 'array' | 'count' | 'boolean' | 'number' | 'void';

/** Symbol used to identify CerialQueryPromise instances */
const CERIAL_QUERY_SYMBOL = Symbol.for('cerial.query');

/**
 * A thenable query object that auto-executes when awaited but can be
 * collected by $transaction for batched execution.
 *
 * Implements PromiseLike<T> so it works seamlessly with `await`.
 */
export class CerialQueryPromise<T> implements PromiseLike<T> {
  /** Marker for identifying CerialQueryPromise instances */
  readonly [CERIAL_QUERY_SYMBOL] = true;

  constructor(
    private readonly _executor: () => Promise<T>,
    private readonly _compiledQuery: CompiledQuery,
    private readonly _metadata: ModelMetadata,
    private readonly _resultType: QueryResultType,
    private readonly _registry?: ModelRegistry,
  ) {}

  /**
   * PromiseLike implementation - auto-executes the query when awaited.
   * This ensures backward compatibility: `await client.db.User.findMany()` works unchanged.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._executor().then(onfulfilled, onrejected);
  }

  /**
   * Support for catch() - delegates to the executor promise
   */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this._executor().then(undefined, onrejected);
  }

  /**
   * Support for finally() - delegates to the executor promise
   */
  finally(onfinally?: (() => void) | null): Promise<T> {
    return this._executor().then(
      (value) => {
        onfinally?.();

        return value;
      },
      (reason) => {
        onfinally?.();
        throw reason;
      },
    );
  }

  /** Get the compiled query (used by $transaction) */
  get compiledQuery(): CompiledQuery {
    return this._compiledQuery;
  }

  /** Get the model metadata (used by $transaction for result mapping) */
  get metadata(): ModelMetadata {
    return this._metadata;
  }

  /** Get the result type classification (used by $transaction for result mapping) */
  get resultType(): QueryResultType {
    return this._resultType;
  }

  /** Get the model registry (used by $transaction for result mapping) */
  get registry(): ModelRegistry | undefined {
    return this._registry;
  }

  /**
   * Static type guard to identify CerialQueryPromise instances.
   * Used by $transaction to validate that only CerialQueryPromise objects are passed.
   */
  static isCerialQueryPromise(value: unknown): value is CerialQueryPromise<unknown> {
    return (
      value !== null &&
      value !== undefined &&
      typeof value === 'object' &&
      CERIAL_QUERY_SYMBOL in value &&
      (value as Record<symbol, unknown>)[CERIAL_QUERY_SYMBOL] === true
    );
  }
}
