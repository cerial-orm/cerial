import type { Surreal, SurrealTransaction } from 'surrealdb';
import { CerialTransactionError, CerialUnknownModelError } from '../errors';
import type { ModelRegistry } from '../types';
import { CerialQueryPromise } from '../query/cerial-query-promise';
import type { SqlFragment } from '../query/compile';
import { compileRawStatement, executeRawStatement } from '../query/raw-statement';
import { Model } from './model/model';
import { wrapDatabaseError } from './model/wrap-database-error';

export type TransactionState = 'active' | 'committed' | 'cancelled';

const IGNORED_PROPERTIES = new Set([
  'then',
  'catch',
  'finally',
  'toJSON',
  'valueOf',
  'toString',
  'constructor',
  '$$typeof',
  'asymmetricMatch',
  'nodeType',
  '_isMockFunction',
]);

const KNOWN_PROPERTIES = new Set([
  'commit',
  'cancel',
  'state',
  '_raw',
  '_registryRef',
  '_ensureActive',
  '$raw',
  '$live',
]);

export class CerialTransaction {
  private _state: TransactionState = 'active';
  private readonly _modelCache = new Map<string, unknown>();

  constructor(
    private readonly _txn: SurrealTransaction,
    private readonly _registry: ModelRegistry,
    private readonly _includeStatementInErrors = false,
  ) {}

  get state(): TransactionState {
    return this._state;
  }

  async commit(): Promise<void> {
    this._ensureActive();
    try {
      await this._txn.commit();
    } catch (error) {
      // A commit that threw leaves nothing live on the server, so the handle must not look usable.
      this._state = 'cancelled';
      throw wrapDatabaseError(error, undefined, 'commit');
    }
    this._state = 'committed';
  }

  async cancel(): Promise<void> {
    this._ensureActive();
    try {
      await this._txn.cancel();
    } catch (error) {
      // A cancel that threw leaves nothing live on the server, so the handle must not look usable.
      this._state = 'cancelled';
      throw wrapDatabaseError(error, undefined, 'cancel');
    }
    this._state = 'cancelled';
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this._state === 'active') {
      try {
        await this._txn.cancel();
        this._state = 'cancelled';
      } catch {
        // Ignore — transaction may already be ended
      }
    }
  }

  [Symbol.dispose](): void {
    if (this._state === 'active') {
      // Schedule cancel — can't await in sync dispose
      this._txn.cancel().catch(() => {});
      this._state = 'cancelled';
    }
  }

  /**
   * Run a whole raw statement inside this transaction and return the last statement's result as an array,
   * unmapped. Use a model's own `$raw` on the transaction client to map its rows.
   */
  $raw<T = unknown>(fragment: SqlFragment<T>): CerialQueryPromise<T[]> {
    this._ensureActive();
    const compiled = compileRawStatement(fragment);
    const dbLike = this._txn as unknown as Surreal;

    return new CerialQueryPromise<T[]>(
      async () => {
        this._ensureActive();
        try {
          return await executeRawStatement<T>(dbLike, compiled);
        } catch (error) {
          throw wrapDatabaseError(error, undefined, '$raw');
        }
      },
      compiled,
      undefined,
      'raw',
      undefined,
      [],
    );
  }

  /** A live query outlives the transaction that would own it, so a transaction refuses it. */
  $live(): never {
    throw new CerialTransactionError('$live is not available inside a transaction', { operation: '$live' });
  }

  /** @internal */
  get _raw(): SurrealTransaction {
    return this._txn;
  }

  /** @internal */
  get _registryRef(): ModelRegistry {
    return this._registry;
  }

  /** @internal */
  _ensureActive(): void {
    if (this._state !== 'active') {
      throw new CerialTransactionError('Transaction already ended');
    }
  }

  /** @internal */
  _getModel(name: string): unknown {
    let wrapped = this._modelCache.get(name);
    if (wrapped) return wrapped;

    const metadata = this._registry[name];
    if (!metadata) {
      throw CerialUnknownModelError.forModel(name, Object.keys(this._registry));
    }

    // SurrealTransaction extends SurrealQueryable which has query() —
    // same interface as Surreal for our query execution purposes
    const dbLike = this._txn as unknown as Surreal;
    const model = new Model(dbLike, metadata, this._registry, {
      includeStatementInErrors: this._includeStatementInErrors,
    });

    wrapped = createTransactionModelProxy(model, () => this._ensureActive());
    this._modelCache.set(name, wrapped);

    return wrapped;
  }
}

function createTransactionModelProxy(model: Model, ensureActive: () => void): unknown {
  return new Proxy(model, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;

      return (...args: unknown[]) => {
        ensureActive();
        const result = value.apply(target, args);

        if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
          return new Promise((resolve, reject) => {
            (result as PromiseLike<unknown>).then(resolve, reject);
          });
        }

        return result;
      };
    },
  });
}

export function createCerialTransactionProxy(
  txn: SurrealTransaction,
  registry: ModelRegistry,
  includeStatementInErrors = false,
): CerialTransaction {
  const cerialTxn = new CerialTransaction(txn, registry, includeStatementInErrors);

  return new Proxy(cerialTxn, {
    get(target, prop) {
      if (typeof prop === 'symbol') {
        // Bound like commit and cancel: dispose reads `this._state`, which through the proxy would
        // fall into _getModel and throw an unknown-model error instead of cancelling.
        const value = Reflect.get(target, prop);

        return typeof value === 'function' ? value.bind(target) : value;
      }

      if (prop === '$transaction') {
        throw new CerialTransactionError('Nested transactions are not supported', { operation: '$transaction' });
      }

      if (KNOWN_PROPERTIES.has(prop)) {
        const value = Reflect.get(target, prop);
        if (typeof value === 'function') return value.bind(target);

        return value;
      }

      if (IGNORED_PROPERTIES.has(prop)) return undefined;

      // Must stay below the symbol, KNOWN_PROPERTIES and IGNORED_PROPERTIES checks, or every `await`
      // on the transaction client throws. An unknown model falls through to _getModel, which names it.
      return target._getModel(prop);
    },

    has(target, prop) {
      if (typeof prop === 'symbol') return false;
      if (KNOWN_PROPERTIES.has(prop)) return true;
      if (prop === '$transaction') return true;

      return prop in target._registryRef;
    },

    ownKeys(target) {
      return [...KNOWN_PROPERTIES, ...Object.keys(target._registryRef)];
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'symbol') return undefined;

      if (KNOWN_PROPERTIES.has(prop)) {
        const value = Reflect.get(target, prop);

        return {
          configurable: true,
          enumerable: true,
          value: typeof value === 'function' ? value.bind(target) : value,
        };
      }

      if (prop in target._registryRef) {
        return {
          configurable: true,
          enumerable: true,
          value: target._getModel(prop),
        };
      }

      return undefined;
    },
  }) as CerialTransaction;
}
