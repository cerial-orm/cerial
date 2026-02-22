import type { Surreal, SurrealTransaction } from 'surrealdb';
import type { ModelRegistry } from '../types';
import { Model } from './model/model';

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

const KNOWN_PROPERTIES = new Set(['commit', 'cancel', 'state', '_raw', '_registryRef', '_ensureActive']);

export class CerialTransaction {
  private _state: TransactionState = 'active';
  private readonly _modelCache = new Map<string, unknown>();

  constructor(
    private readonly _txn: SurrealTransaction,
    private readonly _registry: ModelRegistry,
  ) {}

  get state(): TransactionState {
    return this._state;
  }

  async commit(): Promise<void> {
    this._ensureActive();
    await this._txn.commit();
    this._state = 'committed';
  }

  async cancel(): Promise<void> {
    this._ensureActive();
    await this._txn.cancel();
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
      throw new Error('Transaction already ended');
    }
  }

  /** @internal */
  _getModel(name: string): unknown {
    let wrapped = this._modelCache.get(name);
    if (wrapped) return wrapped;

    const metadata = this._registry[name];
    if (!metadata) {
      throw new Error(`Model "${name}" not found in registry`);
    }

    // SurrealTransaction extends SurrealQueryable which has query() —
    // same interface as Surreal for our query execution purposes
    const dbLike = this._txn as unknown as Surreal;
    const model = new Model(dbLike, metadata, this._registry);

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

export function createCerialTransactionProxy(txn: SurrealTransaction, registry: ModelRegistry): CerialTransaction {
  const cerialTxn = new CerialTransaction(txn, registry);

  return new Proxy(cerialTxn, {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop);

      if (prop === '$transaction') {
        throw new Error('Nested transactions are not supported');
      }

      if (KNOWN_PROPERTIES.has(prop)) {
        const value = Reflect.get(target, prop);
        if (typeof value === 'function') return value.bind(target);

        return value;
      }

      if (IGNORED_PROPERTIES.has(prop)) return undefined;

      if (prop in target._registryRef) {
        return target._getModel(prop);
      }

      return undefined;
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
