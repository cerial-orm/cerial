/**
 * Proxy handler tests
 * Tests for per-model callbacks and callback array merging
 */

import { describe, expect, test, mock } from 'bun:test';
import {
  createProxyHandler,
  clearModelCache,
  type ProxyOptions,
  type PerModelCallbacks,
} from '../../src/client/proxy/handler';
import type { BeforeQueryCallback } from '../../src/client/model/model';
import { parseModelRegistry } from '../test-helpers';

// Mock Surreal instance with proper query().collect() chain
const createMockSurreal = () => ({
  query: mock(() => ({
    collect: () => Promise.resolve([[]]),
  })),
});

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
  content String?
}
`;

const registry = parseModelRegistry(multiModelDsl);

describe('Proxy Handler', () => {
  describe('createProxyHandler', () => {
    test('returns model for valid model name', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const handler = createProxyHandler(mockSurreal as any, registry);
      const proxy = new Proxy({}, handler);

      const userModel = (proxy as any).User;
      expect(userModel).toBeDefined();
      expect(userModel.getName()).toBe('User');
    });

    test('returns undefined for invalid model name', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const handler = createProxyHandler(mockSurreal as any, registry);
      const proxy = new Proxy({}, handler);

      const invalidModel = (proxy as any).InvalidModel;
      expect(invalidModel).toBeUndefined();
    });

    test('caches model instances', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const handler = createProxyHandler(mockSurreal as any, registry);
      const proxy = new Proxy({}, handler);

      const user1 = (proxy as any).User;
      const user2 = (proxy as any).User;

      expect(user1).toBe(user2); // Same instance
    });
  });

  describe('Global callbacks', () => {
    test('passes single callback to all models', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const calledModels: string[] = [];
      const globalCallback: BeforeQueryCallback = async (modelName) => {
        calledModels.push(modelName);
      };

      const options: ProxyOptions = {
        onBeforeQuery: globalCallback,
      };

      const handler = createProxyHandler(mockSurreal as any, registry, options);
      const proxy = new Proxy({}, handler);

      await (proxy as any).User.findMany();
      await (proxy as any).Post.findMany();

      expect(calledModels).toContain('User');
      expect(calledModels).toContain('Post');
    });

    test('passes callback array to all models', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const callOrder: string[] = [];

      const callback1: BeforeQueryCallback = async (modelName) => {
        callOrder.push(`cb1:${modelName}`);
      };

      const callback2: BeforeQueryCallback = async (modelName) => {
        callOrder.push(`cb2:${modelName}`);
      };

      const options: ProxyOptions = {
        onBeforeQuery: [callback1, callback2],
      };

      const handler = createProxyHandler(mockSurreal as any, registry, options);
      const proxy = new Proxy({}, handler);

      await (proxy as any).User.findMany();

      expect(callOrder).toEqual(['cb1:User', 'cb2:User']);
    });
  });

  describe('Per-model callbacks', () => {
    test('calls per-model callback only for specific model', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const calledModels: string[] = [];

      const perModelCallbacks: PerModelCallbacks = {
        User: async (modelName) => {
          calledModels.push(`userCallback:${modelName}`);
        },
      };

      const options: ProxyOptions = {
        perModelCallbacks,
      };

      const handler = createProxyHandler(mockSurreal as any, registry, options);
      const proxy = new Proxy({}, handler);

      await (proxy as any).User.findMany();
      await (proxy as any).Post.findMany();

      expect(calledModels).toEqual(['userCallback:User']);
    });

    test('supports per-model callback array', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

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

      const handler = createProxyHandler(mockSurreal as any, registry, options);
      const proxy = new Proxy({}, handler);

      await (proxy as any).User.findMany();

      expect(callOrder).toEqual(['userCb1', 'userCb2']);
    });
  });

  describe('Combined callbacks', () => {
    test('merges global and per-model callbacks', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const callOrder: string[] = [];

      const globalCallback: BeforeQueryCallback = async (modelName) => {
        callOrder.push(`global:${modelName}`);
      };

      const perModelCallbacks: PerModelCallbacks = {
        User: async (modelName) => {
          callOrder.push(`perModel:${modelName}`);
        },
      };

      const options: ProxyOptions = {
        onBeforeQuery: globalCallback,
        perModelCallbacks,
      };

      const handler = createProxyHandler(mockSurreal as any, registry, options);
      const proxy = new Proxy({}, handler);

      await (proxy as any).User.findMany();

      // Global callback should be called first, then per-model
      expect(callOrder).toEqual(['global:User', 'perModel:User']);
    });

    test('global callbacks run for all models, per-model only for specific', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const callOrder: string[] = [];

      const globalCallback: BeforeQueryCallback = async (modelName) => {
        callOrder.push(`global:${modelName}`);
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

      const handler = createProxyHandler(mockSurreal as any, registry, options);
      const proxy = new Proxy({}, handler);

      await (proxy as any).User.findMany();
      await (proxy as any).Post.findMany();

      expect(callOrder).toEqual([
        'global:User',
        'userOnly',
        'global:Post',
        // No 'userOnly' for Post
      ]);
    });

    test('merges global array with per-model array', async () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

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

      const handler = createProxyHandler(mockSurreal as any, registry, options);
      const proxy = new Proxy({}, handler);

      await (proxy as any).User.findMany();

      expect(callOrder).toEqual(['global1', 'global2', 'user1', 'user2']);
    });
  });

  describe('Proxy traps', () => {
    test('has() returns true for valid model names', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const handler = createProxyHandler(mockSurreal as any, registry);
      const proxy = new Proxy({}, handler);

      expect('User' in proxy).toBe(true);
      expect('Post' in proxy).toBe(true);
      expect('InvalidModel' in proxy).toBe(false);
    });

    test('ownKeys() returns all model names', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const handler = createProxyHandler(mockSurreal as any, registry);
      const proxy = new Proxy({}, handler);

      const keys = Object.keys(proxy);
      expect(keys).toContain('User');
      expect(keys).toContain('Post');
    });

    test('ignores special properties', () => {
      const mockSurreal = createMockSurreal();
      clearModelCache(mockSurreal as any);

      const handler = createProxyHandler(mockSurreal as any, registry);
      const proxy = new Proxy({}, handler);

      // These should return undefined, not throw
      expect((proxy as any).then).toBeUndefined();
      expect((proxy as any).catch).toBeUndefined();
      expect((proxy as any).toJSON).toBeUndefined();
      expect((proxy as any).constructor).toBeUndefined();
    });
  });
});
