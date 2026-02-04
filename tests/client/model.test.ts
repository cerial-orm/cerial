/**
 * Model class tests
 * Tests for callback array functionality and model name parameter
 */

import { describe, expect, mock, test } from 'bun:test';
import { Model, type BeforeQueryCallback } from '../../src/client/model/model';
import { parseModelRegistry } from '../test-helpers';

// Mock Surreal instance with proper query().collect() chain
const createMockSurreal = () => ({
  query: mock(() => ({
    collect: () => Promise.resolve([[]]),
  })),
});

// Parse model using DSL
const dsl = `
model User {
  id Record @id
  email Email @unique
  name String
  age Int?
}
`;

const registry = parseModelRegistry(dsl);
const userMetadata = registry['User']!;

describe('Model Class', () => {
  describe('BeforeQueryCallback', () => {
    test('callback receives model name as parameter', async () => {
      const mockSurreal = createMockSurreal();
      let receivedModelName: string | undefined;

      const callback: BeforeQueryCallback = async (modelName) => {
        receivedModelName = modelName;
      };

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: callback,
      });

      await model.findMany();

      expect(receivedModelName).toBe('User');
    });

    test('supports single callback function', async () => {
      const mockSurreal = createMockSurreal();
      let callCount = 0;

      const callback: BeforeQueryCallback = async () => {
        callCount++;
      };

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: callback,
      });

      await model.findMany();
      expect(callCount).toBe(1);

      await model.findOne();
      expect(callCount).toBe(2);
    });

    test('supports array of callback functions', async () => {
      const mockSurreal = createMockSurreal();
      const callOrder: string[] = [];

      const callback1: BeforeQueryCallback = async (modelName) => {
        callOrder.push(`callback1:${modelName}`);
      };

      const callback2: BeforeQueryCallback = async (modelName) => {
        callOrder.push(`callback2:${modelName}`);
      };

      const callback3: BeforeQueryCallback = async (modelName) => {
        callOrder.push(`callback3:${modelName}`);
      };

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: [callback1, callback2, callback3],
      });

      await model.findMany();

      expect(callOrder).toEqual(['callback1:User', 'callback2:User', 'callback3:User']);
    });

    test('callbacks execute sequentially in order', async () => {
      const mockSurreal = createMockSurreal();
      const executionOrder: number[] = [];

      const callback1: BeforeQueryCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(1);
      };

      const callback2: BeforeQueryCallback = async () => {
        executionOrder.push(2);
      };

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: [callback1, callback2],
      });

      await model.findMany();

      // callback2 should wait for callback1 to complete
      expect(executionOrder).toEqual([1, 2]);
    });

    test('callbacks called before every query method', async () => {
      const mockSurreal = createMockSurreal();
      const queriedMethods: string[] = [];

      const callback: BeforeQueryCallback = async () => {
        queriedMethods.push('called');
      };

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: callback,
      });

      await model.findMany();
      await model.findOne();
      await model.findUnique({ where: { id: 'test' } });
      await model.create({ data: { email: 'test@test.com', name: 'Test' } });
      await model.updateMany({ where: {}, data: {} });
      await model.deleteMany({ where: {} });

      expect(queriedMethods.length).toBe(6);
    });

    test('works without callbacks (undefined)', async () => {
      const mockSurreal = createMockSurreal();

      const model = new Model(mockSurreal as any, userMetadata);

      // Should not throw
      await expect(model.findMany()).resolves.toBeDefined();
    });

    test('works with empty callback array', async () => {
      const mockSurreal = createMockSurreal();

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: [],
      });

      // Should not throw
      await expect(model.findMany()).resolves.toBeDefined();
    });

    test('callback error propagates to caller', async () => {
      const mockSurreal = createMockSurreal();

      const callback: BeforeQueryCallback = async () => {
        throw new Error('Migration failed');
      };

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: callback,
      });

      await expect(model.findMany()).rejects.toThrow('Migration failed');
    });

    test('second callback not called if first throws', async () => {
      const mockSurreal = createMockSurreal();
      let secondCallbackCalled = false;

      const callback1: BeforeQueryCallback = async () => {
        throw new Error('First callback failed');
      };

      const callback2: BeforeQueryCallback = async () => {
        secondCallbackCalled = true;
      };

      const model = new Model(mockSurreal as any, userMetadata, undefined, {
        onBeforeQuery: [callback1, callback2],
      });

      await expect(model.findMany()).rejects.toThrow('First callback failed');
      expect(secondCallbackCalled).toBe(false);
    });
  });

  describe('Model metadata access', () => {
    test('getName returns model name', () => {
      const mockSurreal = createMockSurreal();
      const model = new Model(mockSurreal as any, userMetadata);

      expect(model.getName()).toBe('User');
    });

    test('getTableName returns table name', () => {
      const mockSurreal = createMockSurreal();
      const model = new Model(mockSurreal as any, userMetadata);

      expect(model.getTableName()).toBe('user');
    });

    test('getMetadata returns full metadata', () => {
      const mockSurreal = createMockSurreal();
      const model = new Model(mockSurreal as any, userMetadata);

      const metadata = model.getMetadata();
      expect(metadata.name).toBe('User');
      expect(metadata.tableName).toBe('user');
      expect(metadata.fields.length).toBeGreaterThan(0);
    });
  });
});
