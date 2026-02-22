/**
 * Integration tests for connection functionality
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { ConnectionManager, createConnectionManager } from '../../src/client/connection';
import type { ConnectionConfig } from '../../src/types';
import { parseModelRegistry } from '../test-helpers';

// Parse model using DSL to ensure correct behavior
const dsl = `
model User {
  id Record @id
  email Email @unique
  name String
}
`;

const testRegistry = parseModelRegistry(dsl);

// Default test config
const testConfig: ConnectionConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: {
    username: 'root',
    password: 'root',
  },
};

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager<typeof testRegistry>;

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.disconnectAll();
    }
  });

  test('should create a connection manager with registry', () => {
    connectionManager = new ConnectionManager(testRegistry);
    expect(connectionManager).toBeDefined();
    expect(connectionManager.getRegistry()).toBe(testRegistry);
  });

  test('should connect to the database', async () => {
    connectionManager = new ConnectionManager(testRegistry);
    const proxy = await connectionManager.connect(testConfig);

    expect(proxy).toBeDefined();
    expect(connectionManager.isConnected()).toBe(true);
  });

  test('should return existing proxy on duplicate connect', async () => {
    connectionManager = new ConnectionManager(testRegistry);
    const proxy1 = await connectionManager.connect(testConfig);
    const proxy2 = await connectionManager.connect(testConfig);

    expect(proxy1).toBe(proxy2);
  });

  test('should disconnect from the database', async () => {
    connectionManager = new ConnectionManager(testRegistry);
    await connectionManager.connect(testConfig);
    expect(connectionManager.isConnected()).toBe(true);

    await connectionManager.disconnect();
    expect(connectionManager.isConnected()).toBe(false);
  });

  test('should support multiple named connections', async () => {
    connectionManager = new ConnectionManager(testRegistry);

    await connectionManager.connect(testConfig, 'primary');
    await connectionManager.connect(testConfig, 'secondary');

    expect(connectionManager.isConnected('primary')).toBe(true);
    expect(connectionManager.isConnected('secondary')).toBe(true);

    const names = connectionManager.getConnectionNames();
    expect(names).toContain('primary');
    expect(names).toContain('secondary');
  });

  test('should get surreal instance for a connection', async () => {
    connectionManager = new ConnectionManager(testRegistry);
    await connectionManager.connect(testConfig);

    const surreal = connectionManager.getSurreal();
    expect(surreal).toBeDefined();
  });

  test('should throw error when using non-existent connection', () => {
    connectionManager = new ConnectionManager(testRegistry);

    expect(() => connectionManager.useConnection('nonexistent')).toThrow('Connection "nonexistent" not found');
  });

  test('should use createConnectionManager factory', async () => {
    connectionManager = createConnectionManager(testRegistry);
    expect(connectionManager).toBeDefined();

    const proxy = await connectionManager.connect(testConfig);
    expect(proxy).toBeDefined();
  });
});

const httpConfig: ConnectionConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
};

const wsConfig: ConnectionConfig = {
  url: 'ws://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
};

describe('Dual WS/HTTP Connection Strategy', () => {
  let cm: ConnectionManager<typeof testRegistry>;

  afterEach(async () => {
    if (cm) {
      await cm.disconnectAll();
    }
  });

  describe('WS-only mode (ws:// URL)', () => {
    test('should connect successfully with WS URL', async () => {
      cm = new ConnectionManager(testRegistry);
      const proxy = await cm.connect(wsConfig);

      expect(proxy).toBeDefined();
      expect(cm.isConnected()).toBe(true);
    });

    test('getSurreal and getTransactionSurreal should return the same instance', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(wsConfig);

      const surreal = cm.getSurreal();
      const txSurreal = cm.getTransactionSurreal();

      expect(surreal).toBeDefined();
      expect(txSurreal).toBeDefined();
      expect(surreal).toBe(txSurreal);
    });

    test('getTransactionSurreal should return a valid Surreal instance', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(wsConfig);

      const txSurreal = cm.getTransactionSurreal();
      expect(txSurreal).toBeInstanceOf(Surreal);
    });

    test('closeHttp should be a no-op for WS-only connections', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(wsConfig);

      const surrealBefore = cm.getSurreal();
      await cm.closeHttp();
      const surrealAfter = cm.getSurreal();

      expect(surrealAfter).toBe(surrealBefore);
      expect(cm.isConnected()).toBe(true);
    });

    test('reopenHttp should be a no-op for WS-only connections', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(wsConfig);

      const surrealBefore = cm.getSurreal();
      await cm.reopenHttp();
      const surrealAfter = cm.getSurreal();

      expect(surrealAfter).toBe(surrealBefore);
      expect(cm.isConnected()).toBe(true);
    });

    test('queries should work via WS connection', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(wsConfig);

      const surreal = cm.getSurreal()!;
      const result = await surreal.query<[number]>('RETURN 42;');
      expect(result[0]).toBe(42);
    });

    test('disconnect should close WS connection', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(wsConfig);
      expect(cm.isConnected()).toBe(true);

      await cm.disconnect();
      expect(cm.isConnected()).toBe(false);
      expect(cm.getSurreal()).toBeUndefined();
      expect(cm.getTransactionSurreal()).toBeUndefined();
    });
  });

  describe('HTTP dual mode (http:// URL)', () => {
    test('should connect successfully with HTTP URL', async () => {
      cm = new ConnectionManager(testRegistry);
      const proxy = await cm.connect(httpConfig);

      expect(proxy).toBeDefined();
      expect(cm.isConnected()).toBe(true);
    });

    test('getSurreal should return HTTP instance', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const surreal = cm.getSurreal();
      expect(surreal).toBeDefined();
      expect(surreal).toBeInstanceOf(Surreal);
    });

    test('getTransactionSurreal should return a different instance than getSurreal', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const surreal = cm.getSurreal();
      const txSurreal = cm.getTransactionSurreal();

      expect(surreal).toBeDefined();
      expect(txSurreal).toBeDefined();
      expect(txSurreal).not.toBe(surreal);
    });

    test('getTransactionSurreal should return a valid Surreal instance', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const txSurreal = cm.getTransactionSurreal();
      expect(txSurreal).toBeInstanceOf(Surreal);
    });

    test('queries should work via HTTP surreal', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const surreal = cm.getSurreal()!;
      const result = await surreal.query<[number]>('RETURN 42;');
      expect(result[0]).toBe(42);
    });

    test('queries should work via transaction (WS) surreal', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const txSurreal = cm.getTransactionSurreal()!;
      const result = await txSurreal.query<[number]>('RETURN 42;');
      expect(result[0]).toBe(42);
    });
  });

  describe('closeHttp', () => {
    test('getSurreal should fall back to WS after closeHttp', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const httpSurreal = cm.getSurreal();
      const txSurreal = cm.getTransactionSurreal();

      await cm.closeHttp();

      const fallbackSurreal = cm.getSurreal();
      expect(fallbackSurreal).toBe(txSurreal);
      expect(fallbackSurreal).not.toBe(httpSurreal);
    });

    test('getTransactionSurreal should be unaffected by closeHttp', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const txSurrealBefore = cm.getTransactionSurreal();
      await cm.closeHttp();
      const txSurrealAfter = cm.getTransactionSurreal();

      expect(txSurrealAfter).toBe(txSurrealBefore);
    });

    test('connection should remain active after closeHttp', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      await cm.closeHttp();
      expect(cm.isConnected()).toBe(true);
    });

    test('queries should still work after closeHttp (via WS fallback)', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      await cm.closeHttp();

      const surreal = cm.getSurreal()!;
      const result = await surreal.query<[number]>('RETURN 42;');
      expect(result[0]).toBe(42);
    });

    test('closeHttp should be idempotent', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      await cm.closeHttp();
      const surrealAfterFirst = cm.getSurreal();

      await cm.closeHttp();
      const surrealAfterSecond = cm.getSurreal();

      expect(surrealAfterSecond).toBe(surrealAfterFirst);
    });
  });

  describe('reopenHttp', () => {
    test('getSurreal should return HTTP again after reopenHttp', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const txSurreal = cm.getTransactionSurreal();

      await cm.closeHttp();
      expect(cm.getSurreal()).toBe(txSurreal);

      await cm.reopenHttp();
      const reopenedSurreal = cm.getSurreal();
      expect(reopenedSurreal).not.toBe(txSurreal);
      expect(reopenedSurreal).toBeDefined();
    });

    test('queries should work via reopened HTTP connection', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      await cm.closeHttp();
      await cm.reopenHttp();

      const surreal = cm.getSurreal()!;
      const result = await surreal.query<[number]>('RETURN 42;');
      expect(result[0]).toBe(42);
    });

    test('reopenHttp should be a no-op if HTTP was never closed', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const surrealBefore = cm.getSurreal();
      await cm.reopenHttp();
      const surrealAfter = cm.getSurreal();

      expect(surrealAfter).toBe(surrealBefore);
    });

    test('getTransactionSurreal should be unaffected by reopenHttp', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const txSurrealBefore = cm.getTransactionSurreal();
      await cm.closeHttp();
      await cm.reopenHttp();
      const txSurrealAfter = cm.getTransactionSurreal();

      expect(txSurrealAfter).toBe(txSurrealBefore);
    });

    test('close-reopen cycle should be repeatable', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      const txSurreal = cm.getTransactionSurreal();

      await cm.closeHttp();
      expect(cm.getSurreal()).toBe(txSurreal);
      await cm.reopenHttp();
      expect(cm.getSurreal()).not.toBe(txSurreal);

      await cm.closeHttp();
      expect(cm.getSurreal()).toBe(txSurreal);
      await cm.reopenHttp();
      expect(cm.getSurreal()).not.toBe(txSurreal);

      const surreal = cm.getSurreal()!;
      const result = await surreal.query<[number]>('RETURN 42;');
      expect(result[0]).toBe(42);
    });
  });

  describe('disconnect', () => {
    test('disconnect should close both HTTP and WS connections', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      expect(cm.isConnected()).toBe(true);
      expect(cm.getSurreal()).toBeDefined();
      expect(cm.getTransactionSurreal()).toBeDefined();

      await cm.disconnect();

      expect(cm.isConnected()).toBe(false);
      expect(cm.getSurreal()).toBeUndefined();
      expect(cm.getTransactionSurreal()).toBeUndefined();
    });

    test('disconnect should work after closeHttp', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig);

      await cm.closeHttp();
      expect(cm.isConnected()).toBe(true);

      await cm.disconnect();
      expect(cm.isConnected()).toBe(false);
      expect(cm.getSurreal()).toBeUndefined();
    });

    test('disconnectAll should close all dual-mode connections', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig, 'conn1');
      await cm.connect(httpConfig, 'conn2');

      expect(cm.isConnected('conn1')).toBe(true);
      expect(cm.isConnected('conn2')).toBe(true);

      await cm.disconnectAll();

      expect(cm.isConnected('conn1')).toBe(false);
      expect(cm.isConnected('conn2')).toBe(false);
      expect(cm.getSurreal('conn1')).toBeUndefined();
      expect(cm.getSurreal('conn2')).toBeUndefined();
    });
  });

  describe('named connections with dual mode', () => {
    test('should support named connections with HTTP dual mode', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig, 'primary');

      expect(cm.isConnected('primary')).toBe(true);
      expect(cm.getSurreal('primary')).toBeDefined();
      expect(cm.getTransactionSurreal('primary')).toBeDefined();
      expect(cm.getTransactionSurreal('primary')).not.toBe(cm.getSurreal('primary'));
    });

    test('closeHttp/reopenHttp should work on named connections', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig, 'named');

      const txSurreal = cm.getTransactionSurreal('named');

      await cm.closeHttp('named');
      expect(cm.getSurreal('named')).toBe(txSurreal);

      await cm.reopenHttp('named');
      expect(cm.getSurreal('named')).not.toBe(txSurreal);
    });

    test('closeHttp on one connection should not affect another', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.connect(httpConfig, 'conn-a');
      await cm.connect(httpConfig, 'conn-b');

      const httpSurrealB = cm.getSurreal('conn-b');

      await cm.closeHttp('conn-a');

      expect(cm.getSurreal('conn-b')).toBe(httpSurrealB);
    });
  });

  describe('edge cases', () => {
    test('getSurreal on non-existent connection returns undefined', () => {
      cm = new ConnectionManager(testRegistry);
      expect(cm.getSurreal('nonexistent')).toBeUndefined();
    });

    test('getTransactionSurreal on non-existent connection returns undefined', () => {
      cm = new ConnectionManager(testRegistry);
      expect(cm.getTransactionSurreal('nonexistent')).toBeUndefined();
    });

    test('closeHttp on non-existent connection should not throw', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.closeHttp('nonexistent');
    });

    test('reopenHttp on non-existent connection should not throw', async () => {
      cm = new ConnectionManager(testRegistry);
      await cm.reopenHttp('nonexistent');
    });

    test('proxy should work regardless of closeHttp/reopenHttp (backed by WS)', async () => {
      cm = new ConnectionManager(testRegistry);
      const proxy = await cm.connect(httpConfig);

      expect(proxy).toBeDefined();

      await cm.closeHttp();
      expect(cm.getProxy()).toBeDefined();

      await cm.reopenHttp();
      expect(cm.getProxy()).toBeDefined();
    });
  });
});
