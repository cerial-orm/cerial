/**
 * Proxy handler for dynamic model access
 */

import type { Surreal } from 'surrealdb';
import type { ModelRegistry } from '../../types';
import { Model, type BeforeQueryCallback, type ModelOptions } from '../model/model';

/** Proxy options */
export interface ProxyOptions {
  /** Callback to run before each query (e.g., for lazy migrations) */
  onBeforeQuery?: BeforeQueryCallback;
}

/** Cache key combining db instance and options */
interface CacheKey {
  db: Surreal;
  onBeforeQuery?: BeforeQueryCallback;
}

/** Cache for model instances */
const modelCache = new WeakMap<Surreal, Map<string, Model>>();

/** Get or create model instance */
function getOrCreateModel(
  db: Surreal,
  modelName: string,
  registry: ModelRegistry,
  options?: ModelOptions,
): Model {
  // Get or create cache for this db instance
  let cache = modelCache.get(db);
  if (!cache) {
    cache = new Map();
    modelCache.set(db, cache);
  }

  // Check cache
  let model = cache.get(modelName);
  if (model) return model;

  // Get metadata from registry
  const metadata = registry[modelName];
  if (!metadata) {
    throw new Error(`Model "${modelName}" not found in registry`);
  }

  // Create and cache model
  model = new Model(db, metadata, options);
  cache.set(modelName, model);

  return model;
}

/** Properties to ignore (used by Promise checks, JSON serialization, etc.) */
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

/** Create proxy handler for model access */
export function createProxyHandler(
  db: Surreal,
  registry: ModelRegistry,
  options?: ProxyOptions,
): ProxyHandler<Record<string, Model>> {
  const modelOptions: ModelOptions | undefined = options?.onBeforeQuery
    ? { onBeforeQuery: options.onBeforeQuery }
    : undefined;

  return {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;

      // Ignore special properties (Promise checks, JSON serialization, etc.)
      if (IGNORED_PROPERTIES.has(prop)) return undefined;

      // Only return model if it exists in registry
      if (!(prop in registry)) return undefined;

      // Return model for this property name
      return getOrCreateModel(db, prop, registry, modelOptions);
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

      return {
        configurable: true,
        enumerable: true,
        value: getOrCreateModel(db, prop, registry, modelOptions),
      };
    },
  };
}

/** Clear model cache for a db instance */
export function clearModelCache(db: Surreal): void {
  modelCache.delete(db);
}
