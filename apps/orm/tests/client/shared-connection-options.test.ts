/**
 * Two clients on one URL share a pooled Surreal. Each must keep its own callbacks and options.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import type { BeforeQueryCallback, Model } from '../../src/client/model/model';
import { clearModelCache, createModelProxy } from '../../src/client/proxy';
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

const createMockSurreal = (): Surreal =>
  ({ query: mock(() => ({ collect: () => Promise.resolve([[]]) })) }) as unknown as Surreal;

const recorder = (): { calls: string[]; callback: BeforeQueryCallback } => {
  const calls: string[] = [];

  return {
    calls,
    callback: async (names) => {
      calls.push(...names);
    },
  };
};

const asModels = (proxy: object): Record<string, Model> => proxy as Record<string, Model>;

describe('Model cache across clients on one connection', () => {
  test('each client runs its own onBeforeQuery and not the other', async () => {
    const shared = createMockSurreal();
    clearModelCache(shared);
    const a = recorder();
    const b = recorder();
    const clientA = asModels(createModelProxy(shared, registry, { onBeforeQuery: a.callback }));
    const clientB = asModels(createModelProxy(shared, registry, { onBeforeQuery: b.callback }));

    await clientA.User!.findMany();
    expect(a.calls).toEqual(['User']);
    expect(b.calls).toEqual([]);

    await clientB.User!.findMany();
    expect(a.calls).toEqual(['User']);
    expect(b.calls).toEqual(['User']);
  });

  test('each client runs its own per-model callbacks and not the other', async () => {
    const shared = createMockSurreal();
    clearModelCache(shared);
    const a = recorder();
    const b = recorder();
    const clientA = asModels(createModelProxy(shared, registry, { perModelCallbacks: { Post: a.callback } }));
    const clientB = asModels(createModelProxy(shared, registry, { perModelCallbacks: { Post: b.callback } }));

    await clientA.Post!.findMany();
    await clientB.Post!.findMany();
    await clientB.Post!.findMany();

    expect(a.calls).toEqual(['Post']);
    expect(b.calls).toEqual(['Post', 'Post']);
  });

  test('a client with callbacks does not leak them to a client with none', async () => {
    const shared = createMockSurreal();
    clearModelCache(shared);
    const a = recorder();
    const withCallbacks = asModels(createModelProxy(shared, registry, { onBeforeQuery: a.callback }));
    const plain = asModels(createModelProxy(shared, registry));

    await plain.User!.findMany();
    expect(a.calls).toEqual([]);

    await withCallbacks.User!.findMany();
    expect(a.calls).toEqual(['User']);
  });

  test('one client keeps returning the same model instance', () => {
    const shared = createMockSurreal();
    clearModelCache(shared);
    const options = { onBeforeQuery: recorder().callback };
    const client = asModels(createModelProxy(shared, registry, options));

    expect(client.User).toBe(client.User);
  });

  test('clients built without options still share instances on one connection', () => {
    const shared = createMockSurreal();
    clearModelCache(shared);
    const first = asModels(createModelProxy(shared, registry));
    const second = asModels(createModelProxy(shared, registry));

    expect(first.User).toBe(second.User);
  });
});
