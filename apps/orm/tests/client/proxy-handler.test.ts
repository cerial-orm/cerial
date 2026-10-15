/**
 * Proxy handler tests
 * Tests for per-model callbacks and callback array merging
 */

import { describe, expect, test } from 'bun:test';
import type { BeforeQueryCallback, Model } from '../../src/client/model/model';
import { clearModelCache, createModelProxy, type PerModelCallbacks, type ProxyOptions } from '../../src/client/proxy';
import { CerialUnknownModelError } from '../../src/errors';
import { parseModelRegistry } from '../test-helpers';
import { createMockSurreal } from './helpers';

// Parse models using DSL
const multiModelDsl = `
model User {
  id Record @id
  email Email @unique
  name String
}

model Post {
  id Record @id
  title String
  body String?
}
`;

const registry = parseModelRegistry(multiModelDsl);

describe('Proxy Handler', () => {
  describe('createProxyHandler', () => {
    test('returns model for valid model name', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      const userModel = proxy.User;
      expect(userModel).toBeDefined();
      expect(userModel!.getName()).toBe('User');
    });

    test('throws an unknown-model error for an invalid model name', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      let caught: unknown;
      try {
        proxy.InvalidModel;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(CerialUnknownModelError);
      const error = caught as CerialUnknownModelError;
      expect(error.code).toBe('C2000');
      expect(error.model).toBe('InvalidModel');
      expect(error.message).toBe('Unknown model "InvalidModel". Valid models: User, Post.');
    });

    test('a typo on a model access throws before any method is reached', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      expect(() => proxy.Uesr?.findMany()).toThrow(CerialUnknownModelError);
    });

    test('caches model instances', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      const user1 = proxy.User;
      const user2 = proxy.User;

      expect(user1).toBe(user2); // Same instance
    });
  });

  describe('Global callbacks', () => {
    test('passes single callback to all models', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const calledModels: string[] = [];
      const globalCallback: BeforeQueryCallback = async (modelNames) => {
        calledModels.push(...modelNames);
      };

      const options: ProxyOptions = {
        onBeforeQuery: globalCallback,
      };

      const proxy = createModelProxy(mockSurreal, registry, options);

      await proxy.User!.findMany();
      await proxy.Post!.findMany();

      expect(calledModels).toContain('User');
      expect(calledModels).toContain('Post');
    });

    test('passes callback array to all models', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const callOrder: string[] = [];

      const callback1: BeforeQueryCallback = async (modelNames) => {
        callOrder.push(`cb1:${modelNames.join(',')}`);
      };

      const callback2: BeforeQueryCallback = async (modelNames) => {
        callOrder.push(`cb2:${modelNames.join(',')}`);
      };

      const options: ProxyOptions = {
        onBeforeQuery: [callback1, callback2],
      };

      const proxy = createModelProxy(mockSurreal, registry, options);

      await proxy.User!.findMany();

      expect(callOrder).toEqual(['cb1:User', 'cb2:User']);
    });
  });

  describe('Per-model callbacks', () => {
    test('calls per-model callback only for specific model', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const calledModels: string[] = [];

      const perModelCallbacks: PerModelCallbacks = {
        User: async (modelNames) => {
          calledModels.push(`userCallback:${modelNames.join(',')}`);
        },
      };

      const options: ProxyOptions = {
        perModelCallbacks,
      };

      const proxy = createModelProxy(mockSurreal, registry, options);

      await proxy.User!.findMany();
      await proxy.Post!.findMany();

      expect(calledModels).toEqual(['userCallback:User']);
    });

    test('supports per-model callback array', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const callOrder: string[] = [];

      const perModelCallbacks: PerModelCallbacks = {
        User: [
          async () => {
            callOrder.push('userCb1');
          },
          async () => {
            callOrder.push('userCb2');
          },
        ],
      };

      const options: ProxyOptions = {
        perModelCallbacks,
      };

      const proxy = createModelProxy(mockSurreal, registry, options);

      await proxy.User!.findMany();

      expect(callOrder).toEqual(['userCb1', 'userCb2']);
    });
  });

  describe('Combined callbacks', () => {
    test('merges global and per-model callbacks', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const callOrder: string[] = [];

      const globalCallback: BeforeQueryCallback = async (modelNames) => {
        callOrder.push(`global:${modelNames.join(',')}`);
      };

      const perModelCallbacks: PerModelCallbacks = {
        User: async (modelNames) => {
          callOrder.push(`perModel:${modelNames.join(',')}`);
        },
      };

      const options: ProxyOptions = {
        onBeforeQuery: globalCallback,
        perModelCallbacks,
      };

      const proxy = createModelProxy(mockSurreal, registry, options);

      await proxy.User!.findMany();

      // Global callback should be called first, then per-model
      expect(callOrder).toEqual(['global:User', 'perModel:User']);
    });

    test('global callbacks run for all models, per-model only for specific', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const callOrder: string[] = [];

      const globalCallback: BeforeQueryCallback = async (modelNames) => {
        callOrder.push(`global:${modelNames.join(',')}`);
      };

      const perModelCallbacks: PerModelCallbacks = {
        User: async () => {
          callOrder.push('userOnly');
        },
      };

      const options: ProxyOptions = {
        onBeforeQuery: globalCallback,
        perModelCallbacks,
      };

      const proxy = createModelProxy(mockSurreal, registry, options);

      await proxy.User!.findMany();
      await proxy.Post!.findMany();

      expect(callOrder).toEqual([
        'global:User',
        'userOnly',
        'global:Post',
        // No 'userOnly' for Post
      ]);
    });

    test('merges global array with per-model array', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const callOrder: string[] = [];

      const options: ProxyOptions = {
        onBeforeQuery: [
          async () => {
            callOrder.push('global1');
          },
          async () => {
            callOrder.push('global2');
          },
        ],
        perModelCallbacks: {
          User: [
            async () => {
              callOrder.push('user1');
            },
            async () => {
              callOrder.push('user2');
            },
          ],
        },
      };

      const proxy = createModelProxy(mockSurreal, registry, options);

      await proxy.User!.findMany();

      expect(callOrder).toEqual(['global1', 'global2', 'user1', 'user2']);
    });
  });

  describe('Proxy traps', () => {
    test('has() returns true for valid model names', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      expect('User' in proxy).toBe(true);
      expect('Post' in proxy).toBe(true);
      expect('InvalidModel' in proxy).toBe(false);
    });

    test('ownKeys() returns all model names', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      const keys = Object.keys(proxy);
      expect(keys).toContain('User');
      expect(keys).toContain('Post');
    });

    test('ignores special properties', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      // These should return undefined, not throw
      expect(proxy.then).toBeUndefined();
      expect(proxy.catch).toBeUndefined();
      expect(proxy.toJSON).toBeUndefined();
      expect(proxy.constructor).toBeUndefined();
    });

    test('symbol access returns undefined without throwing', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry) as Record<symbol, unknown>;

      expect(proxy[Symbol.iterator]).toBeUndefined();
      expect(proxy[Symbol.toPrimitive]).toBeUndefined();
      expect(proxy[Symbol.for('nodejs.util.inspect.custom')]).toBeUndefined();
    });

    test('await on the proxy resolves to the proxy itself', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      expect(await proxy).toBe(proxy);
      expect(await Promise.resolve(proxy)).toBe(proxy);
    });

    test('JSON.stringify does not throw', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      expect(() => JSON.stringify(proxy)).not.toThrow();
    });

    test('has() is false for an unknown name and never throws', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      expect('Uesr' in proxy).toBe(false);
      expect(Symbol.iterator in proxy).toBe(false);
    });

    test('ownKeys() lists exactly the registry models', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      expect(Reflect.ownKeys(proxy)).toEqual(['User', 'Post']);
    });

    test('getOwnPropertyDescriptor() describes a known model and is undefined for an unknown one', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      const descriptor = Object.getOwnPropertyDescriptor(proxy, 'User');
      expect(descriptor?.enumerable).toBe(true);
      expect(descriptor?.configurable).toBe(true);
      expect((descriptor!.value as Model).getName()).toBe('User');
      expect(Object.getOwnPropertyDescriptor(proxy, 'Uesr')).toBeUndefined();
    });

    test('spreading enumerates the models and does not throw', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal);

      const proxy = createModelProxy(mockSurreal, registry);

      const spread = { ...proxy };
      expect(Object.keys(spread)).toEqual(['User', 'Post']);
      expect(spread.User?.getName()).toBe('User');
    });
  });
});
