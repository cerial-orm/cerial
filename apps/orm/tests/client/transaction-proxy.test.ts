/**
 * Transaction proxy tests
 * The get trap must name an unknown model without breaking `await` or serialisation
 */

import { describe, expect, mock, test } from 'bun:test';
import type { SurrealTransaction } from 'surrealdb';
import { type CerialTransaction, createCerialTransactionProxy } from '../../src/client/cerial-transaction';
import { CerialTransactionError, CerialUnknownModelError } from '../../src/errors';
import { parseModelRegistry } from '../test-helpers';

const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}

model Post {
  id Record @id
  title String
}
`);

// Implements only the members these tests exercise.
const createMockTransaction = (): SurrealTransaction =>
  ({
    commit: mock(() => Promise.resolve()),
    cancel: mock(() => Promise.resolve()),
  }) as unknown as SurrealTransaction;

const createProxy = (): CerialTransaction => createCerialTransactionProxy(createMockTransaction(), registry);

describe('createCerialTransactionProxy', () => {
  describe('get trap', () => {
    test('throws an unknown-model error naming the model and the valid ones', () => {
      const proxy = createProxy() as unknown as Record<string, unknown>;

      let caught: unknown;
      try {
        proxy.Uesr;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(CerialUnknownModelError);
      const error = caught as CerialUnknownModelError;
      expect(error.code).toBe('C2000');
      expect(error.model).toBe('Uesr');
      expect(error.message).toBe('Unknown model "Uesr". Valid models: User, Post.');
    });

    test('a typo throws before any method is reached', () => {
      const proxy = createProxy() as unknown as Record<string, { findMany(): unknown }>;

      expect(() => proxy.Uesr?.findMany()).toThrow(CerialUnknownModelError);
    });

    test('returns a model that is in the registry', () => {
      const proxy = createProxy() as unknown as Record<string, { getName(): string }>;

      expect(proxy.User?.getName()).toBe('User');
      expect(proxy.Post?.getName()).toBe('Post');
    });

    test('symbol access returns undefined without throwing', () => {
      const proxy = createProxy() as unknown as Record<symbol, unknown>;

      expect(proxy[Symbol.iterator]).toBeUndefined();
      expect(proxy[Symbol.toPrimitive]).toBeUndefined();
      expect(proxy[Symbol.for('nodejs.util.inspect.custom')]).toBeUndefined();
    });

    test('await on the proxy resolves to the proxy itself', async () => {
      const proxy = createProxy();

      expect(await proxy).toBe(proxy);
      expect(await Promise.resolve(proxy)).toBe(proxy);
    });

    test('every ignored property returns undefined without throwing', () => {
      const proxy = createProxy() as unknown as Record<string, unknown>;

      for (const prop of [
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
      ]) {
        expect(proxy[prop]).toBeUndefined();
      }
    });

    test('JSON.stringify does not throw', () => {
      expect(() => JSON.stringify(createProxy())).not.toThrow();
    });

    test('known properties stay reachable', () => {
      const proxy = createProxy();

      expect(proxy.state).toBe('active');
      expect(typeof proxy.commit).toBe('function');
      expect(typeof proxy.cancel).toBe('function');
    });

    test('$transaction still throws the nested-transaction error', () => {
      const proxy = createProxy() as unknown as Record<string, unknown>;

      expect(() => proxy.$transaction).toThrow(CerialTransactionError);
    });
  });

  describe('has trap', () => {
    test('is false for an unknown name and never throws', () => {
      const proxy = createProxy();

      expect('Uesr' in proxy).toBe(false);
      expect(Symbol.iterator in proxy).toBe(false);
    });

    test('is true for models, known properties and $transaction', () => {
      const proxy = createProxy();

      expect('User' in proxy).toBe(true);
      expect('commit' in proxy).toBe(true);
      expect('$transaction' in proxy).toBe(true);
    });
  });

  describe('ownKeys trap', () => {
    test('lists the known properties then the registry models', () => {
      const proxy = createProxy();

      expect(Reflect.ownKeys(proxy)).toEqual([
        'commit',
        'cancel',
        'state',
        '_raw',
        '_registryRef',
        '_ensureActive',
        '$raw',
        '$live',
        'User',
        'Post',
      ]);
    });
  });

  describe('getOwnPropertyDescriptor trap', () => {
    test('describes a known model and is undefined for an unknown one', () => {
      const proxy = createProxy();

      const descriptor = Object.getOwnPropertyDescriptor(proxy, 'User');
      expect(descriptor?.enumerable).toBe(true);
      expect(descriptor?.configurable).toBe(true);
      expect((descriptor!.value as { getName(): string }).getName()).toBe('User');
      expect(Object.getOwnPropertyDescriptor(proxy, 'Uesr')).toBeUndefined();
    });

    test('describes a known property and ignores symbols', () => {
      const proxy = createProxy();

      expect(Object.getOwnPropertyDescriptor(proxy, 'state')?.value).toBe('active');
      expect(Object.getOwnPropertyDescriptor(proxy, Symbol.iterator)).toBeUndefined();
    });
  });
});
