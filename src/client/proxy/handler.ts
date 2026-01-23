/**
 * Proxy handler for dynamic model access
 */

import type { Surreal } from 'surrealdb';
import type { ModelRegistry } from '../../types';
import { Model } from '../model/model';

/** Cache for model instances */
const modelCache = new WeakMap<Surreal, Map<string, Model>>();

/** Get or create model instance */
function getOrCreateModel(db: Surreal, modelName: string, registry: ModelRegistry): Model {
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
  model = new Model(db, metadata);
  cache.set(modelName, model);

  return model;
}

/** Create proxy handler for model access */
export function createProxyHandler(
  db: Surreal,
  registry: ModelRegistry,
): ProxyHandler<Record<string, Model>> {
  return {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;

      // Return model for this property name
      return getOrCreateModel(db, prop, registry);
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
        value: getOrCreateModel(db, prop, registry),
      };
    },
  };
}

/** Clear model cache for a db instance */
export function clearModelCache(db: Surreal): void {
  modelCache.delete(db);
}
