/**
 * Integration tests for connection functionality
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { ConnectionManager, createConnectionManager } from '../../src/client/connection';
import type { ConnectionConfig, ModelRegistry } from '../../src/types';

// Test model registry
const testRegistry: ModelRegistry = {
  User: {
    name: 'User',
    tableName: 'user',
    fields: [
      { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
      { name: 'email', type: 'email', isId: false, isUnique: true, hasNowDefault: false, isRequired: true },
      { name: 'name', type: 'string', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
    ],
  },
};

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
