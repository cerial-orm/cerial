/**
 * E2E Tests for onBeforeQuery — Error Propagation
 *
 * Verifies that a throwing callback prevents query execution
 * and that subsequent callbacks don't fire after failure.
 *
 * Each describe block uses its own CerialClient in beforeAll/afterAll
 * to avoid connection pool model cache sharing between clients.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialClient, cleanupTables, tables, testConfig, truncateTables } from '../../test-helper';

describe('onBeforeQuery — Error Propagation', () => {
  describe('throwing callback prevents query execution', () => {
    let client: CerialClient;

    beforeAll(async () => {
      client = new CerialClient({
        onBeforeQuery: async (_modelName: string) => {
          throw new Error('Before query failed');
        },
      });
      await client.connect(testConfig);
      await cleanupTables(client, tables.core);
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(async () => {
      await truncateTables(client, tables.core);
    });

    test('should propagate error from callback on findMany', async () => {
      await expect(
        (async () => {
          await client.db.User.findMany();
        })(),
      ).rejects.toThrow('Before query failed');
    });

    test('should propagate error from callback on create', async () => {
      await expect(
        (async () => {
          await client.db.User.create({
            data: {
              email: 'error@example.com',
              name: 'Error User',
              isActive: true,
            },
          });
        })(),
      ).rejects.toThrow('Before query failed');
    });

    test('should prevent data from being written to the database', async () => {
      try {
        await (async () => {
          await client.db.User.create({
            data: {
              email: 'should-not-exist@example.com',
              name: 'Ghost',
              isActive: true,
            },
          });
        })();
      } catch {
        // Expected — callback throws before query executes
      }

      const surreal = client.getSurreal();
      const result = await surreal!.query<[{ count: number }[]]>(
        'SELECT count() AS count FROM user WHERE email = $email GROUP ALL',
        { email: 'should-not-exist@example.com' },
      );
      expect(result[0]?.[0]?.count ?? 0).toBe(0);
    });
  });

  describe('subsequent callbacks stop at first failure', () => {
    let client: CerialClient;
    const calls: string[] = [];

    beforeAll(async () => {
      client = new CerialClient({
        onBeforeQuery: [
          async (_modelName: string) => {
            calls.push('first');
          },
          async (_modelName: string) => {
            calls.push('second-throws');
            throw new Error('Second callback failed');
          },
          async (_modelName: string) => {
            calls.push('third-should-not-run');
          },
        ],
      });
      await client.connect(testConfig);
      calls.length = 0;
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(() => {
      calls.length = 0;
    });

    test('should stop at first throwing callback', async () => {
      await expect(
        (async () => {
          await client.db.User.findMany();
        })(),
      ).rejects.toThrow('Second callback failed');

      expect(calls).toEqual(['first', 'second-throws']);
      expect(calls).not.toContain('third-should-not-run');
    });
  });

  describe('throwing global callback stops before per-model', () => {
    let client: CerialClient;
    const calls: string[] = [];

    beforeAll(async () => {
      client = new CerialClient({
        onBeforeQuery: async (_modelName: string) => {
          calls.push('global-throws');
          throw new Error('Global callback failed');
        },
      });
      await client.connect({
        ...testConfig,
        perModelCallbacks: {
          User: async (_modelName: string) => {
            calls.push('per-model-should-not-run');
          },
        },
      });
      calls.length = 0;
    });

    afterAll(async () => {
      await client.disconnect();
    });

    beforeEach(() => {
      calls.length = 0;
    });

    test('should fire global but not per-model callback', async () => {
      await expect(
        (async () => {
          await client.db.User.findMany();
        })(),
      ).rejects.toThrow('Global callback failed');

      expect(calls).toEqual(['global-throws']);
      expect(calls).not.toContain('per-model-should-not-run');
    });
  });

  describe('per-model callback error propagates', () => {
    let client: CerialClient;

    beforeAll(async () => {
      client = new CerialClient();
      await client.connect({
        ...testConfig,
        perModelCallbacks: {
          User: async (_modelName: string) => {
            throw new Error('Per-model User failed');
          },
        },
      });
    });

    afterAll(async () => {
      await client.disconnect();
    });

    test('should propagate per-model callback error', async () => {
      await expect(
        (async () => {
          await client.db.User.findMany();
        })(),
      ).rejects.toThrow('Per-model User failed');
    });

    test('should not affect other models when per-model callback throws', async () => {
      const posts = await client.db.Post.findMany();
      expect(posts).toBeDefined();
    });
  });
});
