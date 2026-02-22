/**
 * E2E Tests for onBeforeQuery — Multiple Callbacks
 *
 * Verifies that multiple callbacks fire in order and
 * global callbacks fire before per-model callbacks.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialClient, cleanupTables, tables, testConfig, truncateTables } from '../../test-helper';

describe('onBeforeQuery — Multiple Callbacks', () => {
  describe('multiple global callbacks fire in order', () => {
    let client: CerialClient;
    const order: string[] = [];

    beforeAll(async () => {
      client = new CerialClient({
        onBeforeQuery: [
          async (_modelName: string) => {
            order.push('first');
          },
          async (_modelName: string) => {
            order.push('second');
          },
          async (_modelName: string) => {
            order.push('third');
          },
        ],
      });
      await client.connect(testConfig);
      await cleanupTables(client, tables.core);
      order.length = 0;
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(async () => {
      await truncateTables(client, tables.core);
      order.length = 0;
    });

    test('should fire all three callbacks in registration order', async () => {
      await client.db.User.findMany();

      expect(order).toEqual(['first', 'second', 'third']);
    });

    test('should fire all callbacks for each query', async () => {
      await client.db.User.findMany();
      await client.db.User.findMany();

      expect(order).toEqual(['first', 'second', 'third', 'first', 'second', 'third']);
    });

    test('should pass correct model name to all callbacks', async () => {
      const receivedNames: string[] = [];
      const trackingClient = new CerialClient({
        onBeforeQuery: [
          async (modelName: string) => {
            receivedNames.push(`cb1:${modelName}`);
          },
          async (modelName: string) => {
            receivedNames.push(`cb2:${modelName}`);
          },
        ],
      });
      await trackingClient.connect(testConfig);
      // Clear migration calls
      receivedNames.length = 0;

      await trackingClient.db.Post.findMany();

      expect(receivedNames).toEqual(['cb1:Post', 'cb2:Post']);

      await trackingClient.disconnect();
    });
  });

  describe('global callbacks fire before per-model callbacks', () => {
    let client: CerialClient;
    const order: string[] = [];

    beforeAll(async () => {
      client = new CerialClient({
        onBeforeQuery: async (_modelName: string) => {
          order.push('global');
        },
      });
      await client.connect({
        ...testConfig,
        perModelCallbacks: {
          User: async (_modelName: string) => {
            order.push('per-model-user');
          },
        },
      });
      await cleanupTables(client, tables.core);
      order.length = 0;
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(async () => {
      await truncateTables(client, tables.core);
      order.length = 0;
    });

    test('should fire global before per-model for User queries', async () => {
      await client.db.User.findMany();

      expect(order).toEqual(['global', 'per-model-user']);
    });

    test('should fire only global for non-User queries', async () => {
      await client.db.Post.findMany();

      expect(order).toEqual(['global']);
    });

    test('should maintain order across multiple queries', async () => {
      await client.db.User.findMany();
      await client.db.Post.findMany();
      await client.db.User.findMany();

      expect(order).toEqual(['global', 'per-model-user', 'global', 'global', 'per-model-user']);
    });
  });

  describe('multiple global + multiple per-model callbacks', () => {
    test('should fire all in correct order: globals then per-model', async () => {
      const order: string[] = [];

      const client = new CerialClient({
        onBeforeQuery: [
          async (_modelName: string) => {
            order.push('global-1');
          },
          async (_modelName: string) => {
            order.push('global-2');
          },
        ],
      });
      await client.connect({
        ...testConfig,
        perModelCallbacks: {
          User: [
            async (_modelName: string) => {
              order.push('per-user-1');
            },
            async (_modelName: string) => {
              order.push('per-user-2');
            },
          ],
        },
      });
      // Clear migration calls
      order.length = 0;

      await client.db.User.findMany();

      expect(order).toEqual(['global-1', 'global-2', 'per-user-1', 'per-user-2']);

      await client.disconnect();
    });
  });
});
