/**
 * Integration tests: a pooled socket reconnects when its transport drops
 *
 * The transport is dropped through a TCP relay owned by this file, so the shared database is never
 * stopped. The relay keeps accepting connections, which lets the driver's reconnect succeed. A
 * restart is the one thing that loses the session, so that test runs only when a container is named.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { createConnectionManager, resetConnectionPool, type ConnectionManager } from '../../src/client/connection';
import { parseModelRegistry } from '../test-helpers';
import { RESTARTABLE_CONTAINER, restartContainer } from './restartable-container';
import { type Relay, startRelay } from './tcp-relay';

const registry = parseModelRegistry(`
model ReconnectUser {
  id Record @id
  name String
}
`);

const within = async (ms: number, wait: Promise<void>, what: string): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms waiting for ${what}`)), ms);
  });
  try {
    await Promise.race([wait, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const statusReaches = (surreal: Surreal, status: 'reconnecting' | 'connected'): Promise<void> =>
  new Promise((resolve) => {
    if (surreal.status === status) return resolve();
    const off = surreal.subscribe(status, () => {
      off();
      resolve();
    });
  });

describe('pooled socket reconnect', () => {
  let relay: Relay;
  let manager: ConnectionManager;
  let config: { url: string; auth: { username: string; password: string }; namespace: string; database: string };

  beforeEach(async () => {
    relay = await startRelay();
    config = {
      url: `ws://127.0.0.1:${relay.port}`,
      auth: { username: 'root', password: 'root' },
      namespace: 'main',
      database: 'main',
    };
    manager = createConnectionManager(registry);
    await manager.connect(config);
  });

  afterEach(async () => {
    await manager.disconnectAll();
    await resetConnectionPool();
    relay.sever();
  });

  test('the status reaches reconnecting, then connected, after the transport drops', async () => {
    const surreal = manager.getSurreal()!;
    const reconnecting = statusReaches(surreal, 'reconnecting');
    relay.drop();

    await within(5000, reconnecting, 'reconnecting');
    expect(surreal.status).toBe('reconnecting');

    // The relay is still listening, so the retries find it again.
    await within(10_000, statusReaches(surreal, 'connected'), 'connected');
  });

  // A relay drop preserves the session (the server process still remembers it), so the reconnected
  // socket is healthy and the pool correctly keeps it. Only a server restart loses the session.
  test.skipIf(!RESTARTABLE_CONTAINER)(
    'after a server restart the next acquire opens a fresh socket (needs CERIAL_RESTARTABLE_CONTAINER)',
    async () => {
      const direct = { ...config, url: 'ws://127.0.0.1:8000' };
      const first = createConnectionManager(registry);
      await first.connect(direct);
      const stale = first.getSurreal()!;

      await restartContainer(RESTARTABLE_CONTAINER!);
      if (stale.status !== 'connected') await within(15_000, statusReaches(stale, 'connected'), 'connected');

      const second = createConnectionManager(registry);
      try {
        await second.connect(direct);

        expect(second.getSurreal()).not.toBe(stale);
        const [one] = await second.getSurreal()!.query<[number]>('RETURN 1').collect();
        expect(one).toBe(1);
      } finally {
        await second.disconnectAll();
        await first.disconnectAll();
      }
    },
    60_000,
  );
});
