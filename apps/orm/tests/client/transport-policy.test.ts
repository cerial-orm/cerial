/**
 * Over an http(s) URL, migrations, raw queries, transactions and the model proxy share one socket,
 * and closeHttp() / reopenHttp() never move them. The `Surreal` client is stubbed through a module
 * mock, so no database is needed.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import * as realSurreal from 'surrealdb';
import type { ConnectionManager as ConnectionManagerClass } from '../../src/client/connection';
import { parseModelRegistry } from '../test-helpers';

class StubSurreal extends realSurreal.Surreal {
  override async connect(): Promise<true> {
    return true;
  }

  override async use(): Promise<{ namespace: string; database: string }> {
    return { namespace: 'main', database: 'main' };
  }

  override async close(): Promise<true> {
    return true;
  }

  // The pool probes a pooled socket with a query before reuse.
  override query(): never {
    return Promise.resolve([1]) as never;
  }
}

let createConnectionManager: typeof import('../../src/client/connection').createConnectionManager;
let resetConnectionPool: typeof import('../../src/client/connection').resetConnectionPool;

beforeAll(async () => {
  mock.module('surrealdb', () => ({ ...realSurreal, Surreal: StubSurreal }));
  ({ createConnectionManager, resetConnectionPool } = await import('../../src/client/connection'));
});

afterAll(() => {
  // mock.module is process-wide; hand the real client back to every later test file.
  mock.module('surrealdb', () => realSurreal);
});

afterEach(async () => {
  await resetConnectionPool();
});

const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}
`);

const config = { url: 'http://127.0.0.1:8000', namespace: 'main', database: 'main' };

async function connected(url: string): Promise<ConnectionManagerClass> {
  const manager = createConnectionManager(registry);
  await manager.connect({ ...config, url });

  return manager;
}

describe('DDL and DML transport', () => {
  test('http URL: DDL, raw queries and transactions use the socket the proxy uses, not the HTTP one', async () => {
    const manager = await connected(config.url);
    const ws = manager.getTransactionSurreal();

    expect(manager.getDdlSurreal()).toBe(ws!);
    expect(manager.getQuerySurreal()).toBe(ws!);
    expect(manager.getSurreal()).not.toBe(ws!);
  });

  test('http URL: the DDL socket stays the same instance across closeHttp() and reopenHttp()', async () => {
    const manager = await connected(config.url);
    const ddl = manager.getDdlSurreal();

    await manager.closeHttp();
    expect(manager.getDdlSurreal()).toBe(ddl!);
    expect(manager.getQuerySurreal()).toBe(ddl!);
    // The primary accessor is the one that moves: it falls back to the WS socket.
    expect(manager.getSurreal()).toBe(ddl!);

    await manager.reopenHttp();
    expect(manager.getDdlSurreal()).toBe(ddl!);
    expect(manager.getSurreal()).not.toBe(ddl!);
  });

  test('ws URL: one socket serves every accessor', async () => {
    const manager = await connected('ws://127.0.0.1:8000');
    const only = manager.getSurreal();

    expect(manager.getDdlSurreal()).toBe(only!);
    expect(manager.getQuerySurreal()).toBe(only!);
    expect(manager.getTransactionSurreal()).toBe(only!);
  });

  test('accessors return undefined for an unknown connection', () => {
    const manager = createConnectionManager(registry);

    expect(manager.getDdlSurreal('missing')).toBeUndefined();
    expect(manager.getQuerySurreal('missing')).toBeUndefined();
  });
});
