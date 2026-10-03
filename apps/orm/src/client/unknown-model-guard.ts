import { CerialUnknownModelError } from '../errors';
import type { ModelRegistry } from '../types';
import { IGNORED_PROPERTIES } from './proxy/handler';

/**
 * Wraps a generated client so a name that is neither a member of the client nor a model throws,
 * instead of reading as `undefined`. Covers `client.Uesr` for consumers the type checker does not
 * reach. The wrapped client keeps its own type, so the typed accessors are unchanged.
 */
export function guardUnknownModels<T extends object>(client: T, registry: ModelRegistry): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      // Order matters: symbols, protocol probes and real members must pass before the throw, or
      // `await client`, `JSON.stringify(client)` and every method call break.
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
      if (prop in target) return Reflect.get(target, prop, receiver);
      if (IGNORED_PROPERTIES.has(prop)) return undefined;

      throw CerialUnknownModelError.forModel(prop, Object.keys(registry));
    },
  });
}
