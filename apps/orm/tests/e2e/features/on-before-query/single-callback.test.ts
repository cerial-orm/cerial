/**
 * E2E Tests for onBeforeQuery — Single Callback
 *
 * Verifies that a single callback fires before each query
 * and receives the correct model name.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialClient, cleanupTables, tables, testConfig, truncateTables } from '../../test-helper';

describe('onBeforeQuery — Single Callback', () => {
  describe('global callback via constructor', () => {
    let client: CerialClient;
    const calls: string[] = [];

    beforeAll(async () => {
      client = new CerialClient({
        onBeforeQuery: async (modelName: string) => {
          calls.push(modelName);
        },
      });
      await client.connect(testConfig);
      await cleanupTables(client, tables.core);
      // Clear any calls from migration
      calls.length = 0;
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(async () => {
      await truncateTables(client, tables.core);
      calls.length = 0;
    });

    test('should call callback before findMany', async () => {
      await client.db.User.findMany();

      expect(calls).toContain('User');
    });

    test('should call callback before create', async () => {
      await client.db.User.create({
        data: {
          email: 'callback@example.com',
          name: 'Callback User',
          isActive: true,
        },
      });

      expect(calls).toContain('User');
    });

    test('should call callback before findOne', async () => {
      await client.db.User.findOne({
        where: { email: 'nonexistent@example.com' },
      });

      expect(calls).toContain('User');
    });

    test('should receive correct model name for different models', async () => {
      await client.db.User.findMany();
      await client.db.Post.findMany();

      expect(calls).toContain('User');
      expect(calls).toContain('Post');
    });

    test('should call callback for each query', async () => {
      await client.db.User.findMany();
      await client.db.User.findMany();
      await client.db.User.findMany();

      const userCalls = calls.filter((c) => c === 'User');
      expect(userCalls.length).toBe(3);
    });

    test('should call callback before count', async () => {
      await client.db.User.count();

      expect(calls).toContain('User');
    });

    test('should call callback before exists', async () => {
      await client.db.User.exists();

      expect(calls).toContain('User');
    });

    test('should call callback before deleteMany', async () => {
      await client.db.User.deleteMany({
        where: { email: 'nonexistent@example.com' },
      });

      expect(calls).toContain('User');
    });

    test('should call callback before updateMany', async () => {
      await client.db.User.updateMany({
        where: { email: 'nonexistent@example.com' },
        data: { name: 'Updated' },
      });

      expect(calls).toContain('User');
    });
  });

  describe('per-model callback via connect config', () => {
    let client: CerialClient;
    const userCalls: string[] = [];

    beforeAll(async () => {
      client = new CerialClient();
      await client.connect({
        ...testConfig,
        perModelCallbacks: {
          User: async (modelName: string) => {
            userCalls.push(modelName);
          },
        },
      });
      await cleanupTables(client, tables.core);
      // Clear any calls from migration
      userCalls.length = 0;
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(async () => {
      await truncateTables(client, tables.core);
      userCalls.length = 0;
    });

    test('should fire per-model callback only for that model', async () => {
      await client.db.User.findMany();

      expect(userCalls).toContain('User');
    });

    test('should NOT fire per-model callback for other models', async () => {
      await client.db.Post.findMany();

      expect(userCalls.length).toBe(0);
    });

    test('should fire per-model callback with correct model name', async () => {
      await client.db.User.create({
        data: {
          email: 'permodel@example.com',
          name: 'PerModel User',
          isActive: true,
        },
      });

      expect(userCalls.length).toBeGreaterThanOrEqual(1);
      expect(userCalls.every((c) => c === 'User')).toBe(true);
    });
  });
});
