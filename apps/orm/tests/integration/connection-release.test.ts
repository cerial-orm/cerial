/**
 * Integration tests for releasing pooled connections
 */

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { ConnectionManager, resetConnectionPool } from '../../src/client/connection';
import type { ConnectionConfig } from '../../src/types';
import { parseModelRegistry } from '../test-helpers';

const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}
`);

// WS URL: one pooled socket per manager, and its status is observable
const wsConfig: ConnectionConfig = {
  url: 'ws://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
};

describe('releasing pooled connections', () => {
  afterEach(async () => {
    await resetConnectionPool();
  });

  test('last release closes the socket and the next acquire opens a new one', async () => {
    const first = new ConnectionManager(registry);
    await first.connect(wsConfig);
    const released = first.getSurreal();
    expect(released?.status).toBe('connected');

    await first.disconnect();
    expect(released?.status).toBe('disconnected');

    const second = new ConnectionManager(registry);
    await second.connect(wsConfig);
    const reacquired = second.getSurreal();

    expect(reacquired).not.toBe(released);
    expect(reacquired?.status).toBe('connected');
    await second.disconnect();
  });

  test('a release while another client holds the connection keeps the socket open', async () => {
    const a = new ConnectionManager(registry);
    const b = new ConnectionManager(registry);
    await a.connect(wsConfig);
    await b.connect(wsConfig);
    const shared = a.getSurreal();
    expect(b.getSurreal()).toBe(shared);

    await a.disconnect();
    expect(shared?.status).toBe('connected');
    expect(b.getSurreal()).toBe(shared);

    await b.disconnect();
    expect(shared?.status).toBe('disconnected');
  });

  test('closeHttp closes the HTTP socket and leaves the WS socket open', async () => {
    const manager = new ConnectionManager(registry);
    await manager.connect({ ...wsConfig, url: 'http://127.0.0.1:8000' });
    const connection = manager.getConnection();
    const http = connection?.surreal;
    const ws = connection?.wsSurreal;

    await manager.closeHttp();

    expect(http?.status).toBe('disconnected');
    expect(ws?.status).toBe('connected');
    expect(manager.getSurreal()).toBe(ws);

    await manager.disconnect();
    expect(ws?.status).toBe('disconnected');
  });
});

describe('acquiring pooled connections', () => {
  afterEach(async () => {
    await resetConnectionPool();
  });

  test('a pooled socket whose session was invalidated is replaced on the next acquire', async () => {
    const first = new ConnectionManager(registry);
    await first.connect(wsConfig);
    const dead = first.getSurreal();
    await dead?.invalidate();

    const second = new ConnectionManager(registry);
    await second.connect(wsConfig);
    const fresh = second.getSurreal();

    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(dead);
    expect(dead?.status).toBe('disconnected');
    const [rows] = await (fresh?.query('RETURN 1;').collect<[number]>() ?? Promise.reject(new Error('no socket')));
    expect(rows).toBe(1);

    await second.disconnect();
  });

  test('the holder of a discarded socket can still disconnect without error', async () => {
    const first = new ConnectionManager(registry);
    await first.connect(wsConfig);
    await first.getSurreal()?.invalidate();
    const second = new ConnectionManager(registry);
    await second.connect(wsConfig);
    const fresh = second.getSurreal();

    await first.disconnect();
    expect(fresh?.status).toBe('connected');

    await second.disconnect();
    expect(fresh?.status).toBe('disconnected');
  });

  test('a healthy pooled socket is reused', async () => {
    const first = new ConnectionManager(registry);
    const second = new ConnectionManager(registry);
    await first.connect(wsConfig);
    await second.connect(wsConfig);

    expect(second.getSurreal()).toBe(first.getSurreal());
    expect(first.getSurreal()?.status).toBe('connected');

    await first.disconnect();
    await second.disconnect();
  });

  test('a socket that dies while another acquirer waits on the in-flight connect is replaced', async () => {
    const probe = spyOn(Surreal.prototype, 'query').mockRejectedValueOnce(new Error('session gone'));
    try {
      const first = new ConnectionManager(registry);
      const second = new ConnectionManager(registry);
      await Promise.all([first.connect(wsConfig), second.connect(wsConfig)]);

      expect(probe).toHaveBeenCalledTimes(1);
      expect(second.getSurreal()).not.toBe(first.getSurreal());
      expect(second.getSurreal()?.status).toBe('connected');
      await second.disconnect();
      await first.disconnect();
    } finally {
      probe.mockRestore();
    }
  });
});
