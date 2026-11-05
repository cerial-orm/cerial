/**
 * Proxy handler for dynamic model access
 */

import type { Surreal } from 'surrealdb';
import { CerialUnknownModelError } from '../../errors';
import type { ModelRegistry } from '../../types';
import { type BeforeQueryCallback, Model, type ModelOptions } from '../model/model';

/** Per-model callback configuration */
export interface PerModelCallbacks {
  [modelName: string]: BeforeQueryCallback | BeforeQueryCallback[];
}

/** Proxy options */
export interface ProxyOptions {
  /** Callback(s) to run before each query - can be single function or array (e.g., for lazy migrations) */
  onBeforeQuery?: BeforeQueryCallback | BeforeQueryCallback[];
  /** Per-model callbacks to run before queries to specific models */
  perModelCallbacks?: PerModelCallbacks;
  /** Attach the generated statement and its bound values to a wrapped database error (default: false) */
  includeStatementInErrors?: boolean;
  /** Registers a live handle with its connection so a deliberate `disconnect()` ends it. Set by the connection manager. */
  trackLive?: ModelOptions['trackLive'];
  /** Identifies the owning client for transaction routing. Set by the connection manager. */
  routeOwner?: object;
}

/** Stands in for the options of a client built without any, so those clients still share instances */
const NO_OPTIONS: ProxyOptions = {};

/**
 * Cache for model instances. Clients on one URL share a pooled connection, so the connection alone cannot
 * be the key: the ProxyOptions object each client owns is the second level. Keying on that object (not on
 * individual options) means an option added later is covered without touching the key.
 */
const modelCache = new WeakMap<Surreal, WeakMap<ProxyOptions, Map<string, Model>>>();

/** Get or create model instance */
function getOrCreateModel(
  db: Surreal,
  modelName: string,
  registry: ModelRegistry,
  proxyOptions: ProxyOptions | undefined,
  options?: ModelOptions,
): Model {
  let byOptions = modelCache.get(db);
  if (!byOptions) {
    byOptions = new WeakMap();
    modelCache.set(db, byOptions);
  }
  const optionsKey = proxyOptions ?? NO_OPTIONS;
  let cache = byOptions.get(optionsKey);
  if (!cache) {
    cache = new Map();
    byOptions.set(optionsKey, cache);
  }

  let model = cache.get(modelName);
  if (model) return model;

  // Get metadata from registry
  const metadata = registry[modelName];
  if (!metadata) {
    throw CerialUnknownModelError.forModel(modelName, Object.keys(registry));
  }

  // Create and cache model (pass registry for relation queries)
  model = new Model(db, metadata, registry, options);
  cache.set(modelName, model);

  return model;
}

/** Properties to ignore (used by Promise checks, JSON serialization, etc.) */
export const IGNORED_PROPERTIES = new Set([
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

/** Normalize callback(s) to array */
function normalizeCallbacks(callbacks: BeforeQueryCallback | BeforeQueryCallback[] | undefined): BeforeQueryCallback[] {
  if (!callbacks) return [];
  return Array.isArray(callbacks) ? callbacks : [callbacks];
}

/** Build model options by combining global and per-model callbacks */
function buildModelOptions(modelName: string, options?: ProxyOptions): ModelOptions | undefined {
  const globalCallbacks = normalizeCallbacks(options?.onBeforeQuery);
  const perModelCallbacks = normalizeCallbacks(options?.perModelCallbacks?.[modelName]);

  const allCallbacks = [...globalCallbacks, ...perModelCallbacks];

  if (allCallbacks.length === 0 && !options?.includeStatementInErrors && !options?.trackLive && !options?.routeOwner)
    return undefined;
  return {
    onBeforeQuery: allCallbacks,
    includeStatementInErrors: options?.includeStatementInErrors,
    trackLive: options?.trackLive,
    routeOwner: options?.routeOwner,
  };
}

/** Create proxy handler for model access */
export function createProxyHandler(
  db: Surreal,
  registry: ModelRegistry,
  options?: ProxyOptions,
): ProxyHandler<Record<string, Model>> {
  return {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;

      // Ignore special properties (Promise checks, JSON serialization, etc.)
      if (IGNORED_PROPERTIES.has(prop)) return undefined;

      // Must stay below the symbol and IGNORED_PROPERTIES checks, or every `await` on the client
      // throws. An unknown model falls through to getOrCreateModel, which names it.
      // Build model-specific options combining global and per-model callbacks
      const modelOptions = buildModelOptions(prop, options);

      // Return model for this property name
      return getOrCreateModel(db, prop, registry, options, modelOptions);
    },

    has(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return false;
      return prop in registry;
    },

    ownKeys(_target) {
      return Object.keys(registry);
    },

    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;
      if (!(prop in registry)) return undefined;

      // Build model-specific options combining global and per-model callbacks
      const modelOptions = buildModelOptions(prop, options);

      return {
        configurable: true,
        enumerable: true,
        value: getOrCreateModel(db, prop, registry, options, modelOptions),
      };
    },
  };
}

/** Clear model cache for a db instance */
export function clearModelCache(db: Surreal): void {
  modelCache.delete(db);
}
