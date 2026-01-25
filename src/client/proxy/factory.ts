/**
 * Proxy factory for creating model proxies
 */

import type { Surreal } from 'surrealdb';
import type { ModelRegistry } from '../../types';
import type { Model } from '../model/model';
import { createProxyHandler, type ProxyOptions } from './handler';

/** Database proxy type - dynamic access to models */
export type DatabaseProxy<R extends ModelRegistry = ModelRegistry> = {
  [K in keyof R]: Model<Record<string, unknown>>;
};

/** Create a model proxy for dynamic model access */
export function createModelProxy<R extends ModelRegistry>(
  db: Surreal,
  registry: R,
  options?: ProxyOptions,
): DatabaseProxy<R> {
  return new Proxy({} as Record<string, Model>, createProxyHandler(db, registry, options)) as DatabaseProxy<R>;
}
