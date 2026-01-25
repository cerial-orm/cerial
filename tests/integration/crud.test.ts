/**
 * Integration tests for CRUD operations
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ConnectionManager } from '../../src/client/connection';
import { Model } from '../../src/client/model/model';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';
import type { ConnectionConfig, ModelRegistry } from '../../src/types';

// Test user interface
interface TestUser {
  id: string;
  email: string;
  name: string;
  age?: number;
  isActive: boolean;
  createdAt: Date;
  [key: string]: unknown;
}

// Test model registry
const testRegistry: ModelRegistry = {
  TestUser: {
    name: 'TestUser',
    tableName: 'test_user_crud',
    fields: [
      { name: 'id', type: 'record', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
      { name: 'email', type: 'email', isId: false, isUnique: true, hasNowDefault: false, isRequired: true },
      { name: 'name', type: 'string', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
      { name: 'age', type: 'int', isId: false, isUnique: false, hasNowDefault: false, isRequired: false },
      { name: 'isActive', type: 'bool', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
      { name: 'createdAt', type: 'date', isId: false, isUnique: false, hasNowDefault: true, isRequired: true },
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

describe('CRUD Operations', () => {
  let connectionManager: ConnectionManager<typeof testRegistry>;
  let userModel: Model<TestUser>;

  beforeEach(async () => {
    connectionManager = new ConnectionManager(testRegistry);
    await connectionManager.connect(testConfig);

    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    // Clean up and run migrations
    try {
      await surreal.query('REMOVE TABLE IF EXISTS test_user_crud;');
    } catch {
      // Ignore errors
    }

    const statements = generateModelDefineStatements(testRegistry.TestUser!);
    await connectionManager.migrate(statements);

    // Create model instance
    userModel = new Model<TestUser>(surreal, testRegistry.TestUser!);
  });

  afterEach(async () => {
    // Clean up
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      try {
        await surreal.query('REMOVE TABLE IF EXISTS test_user_crud;');
      } catch {
        // Ignore errors
      }
    }
    await connectionManager.disconnectAll();
  });

  describe('Create', () => {
    test('should create a new record', async () => {
      const result = await userModel.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.email).toBe('test@example.com');
      expect(result?.name).toBe('Test User');
      expect(result?.isActive).toBe(true);
      expect(result?.id).toBeDefined();
    });

    test('should create a record with optional fields', async () => {
      const result = await userModel.create({
        data: {
          email: 'test2@example.com',
          name: 'Test User 2',
          age: 25,
          isActive: false,
        },
      });

      expect(result).toBeDefined();
      expect(result?.age).toBe(25);
    });

    test('should apply default values', async () => {
      const result = await userModel.create({
        data: {
          email: 'test3@example.com',
          name: 'Test User 3',
          isActive: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.createdAt).toBeDefined();
    });

    test('should create record with user-provided id (RecordId)', async () => {
      const customId = 'custom-user-id';
      const result = await userModel.create({
        data: {
          id: customId,
          email: 'custom@example.com',
          name: 'Custom ID User',
          isActive: true,
        },
      });

      expect(result).toBeDefined();
      // The id should contain the custom id we provided
      expect(String(result?.id)).toContain(customId);
    });

    test('should create record with user-provided datetime (overriding @now default)', async () => {
      const customDate = new Date('2020-01-15T10:30:00.000Z');
      const result = await userModel.create({
        data: {
          email: 'datetime@example.com',
          name: 'Custom Date User',
          isActive: true,
          createdAt: customDate,
        },
      });

      expect(result).toBeDefined();
      // The createdAt should match our custom date, not use the database default
      const resultDate = new Date(result?.createdAt as Date);
      expect(resultDate.toISOString()).toBe(customDate.toISOString());
    });

    test('should create record with date string (converted to Date)', async () => {
      const dateStr = '2021-06-20T14:45:00.000Z';
      const result = await userModel.create({
        data: {
          email: 'datestr@example.com',
          name: 'Date String User',
          isActive: true,
          createdAt: dateStr as unknown as Date, // Data transformer converts string to Date
        },
      });

      expect(result).toBeDefined();
      const resultDate = new Date(result?.createdAt as Date);
      expect(resultDate.toISOString()).toBe(dateStr);
    });
  });

  describe('Read', () => {
    beforeEach(async () => {
      // Create test data
      await userModel.create({ data: { email: 'user1@example.com', name: 'User 1', isActive: true } });
      await userModel.create({ data: { email: 'user2@example.com', name: 'User 2', isActive: false } });
      await userModel.create({ data: { email: 'user3@example.com', name: 'User 3', age: 30, isActive: true } });
    });

    test('should find all records', async () => {
      const results = await userModel.findAll();
      expect(results.length).toBe(3);
    });

    test('should find records with where clause', async () => {
      const results = await userModel.findMany({
        where: { isActive: true },
      });

      expect(results.length).toBe(2);
      results.forEach((r) => expect(r.isActive).toBe(true));
    });

    test('should find one record', async () => {
      const result = await userModel.findOne({
        where: { email: 'user1@example.com' },
      });

      expect(result).toBeDefined();
      expect(result?.email).toBe('user1@example.com');
    });

    test('should return null when record not found', async () => {
      const result = await userModel.findOne({
        where: { email: 'nonexistent@example.com' },
      });

      expect(result).toBeNull();
    });

    test('should count records', async () => {
      const count = await userModel.count({ isActive: true });
      expect(count).toBe(2);
    });

    test('should check if record exists', async () => {
      const exists = await userModel.exists({ email: 'user1@example.com' });
      expect(exists).toBe(true);

      const notExists = await userModel.exists({ email: 'nonexistent@example.com' });
      expect(notExists).toBe(false);
    });
  });

  describe('Update', () => {
    beforeEach(async () => {
      await userModel.create({ data: { email: 'update@example.com', name: 'Update Me', isActive: false } });
    });

    test('should update a record', async () => {
      const results = await userModel.update({
        where: { email: 'update@example.com' },
        data: { isActive: true, name: 'Updated' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.isActive).toBe(true);
      expect(results[0]!.name).toBe('Updated');
    });

    test('should update one record', async () => {
      const result = await userModel.updateOne({
        where: { email: 'update@example.com' },
        data: { name: 'Single Update' },
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Single Update');
    });

    test('should return empty array when no records match', async () => {
      const results = await userModel.update({
        where: { email: 'nonexistent@example.com' },
        data: { name: 'No Match' },
      });

      expect(results.length).toBe(0);
    });
  });

  describe('Delete', () => {
    beforeEach(async () => {
      await userModel.create({ data: { email: 'delete1@example.com', name: 'Delete 1', isActive: true } });
      await userModel.create({ data: { email: 'delete2@example.com', name: 'Delete 2', isActive: true } });
      await userModel.create({ data: { email: 'keep@example.com', name: 'Keep', isActive: false } });
    });

    test('should delete records matching where clause', async () => {
      const count = await userModel.delete({
        where: { isActive: true },
      });

      expect(count).toBe(2);

      const remaining = await userModel.findAll();
      expect(remaining.length).toBe(1);
      expect(remaining[0]!.email).toBe('keep@example.com');
    });

    test('should return 0 when no records match', async () => {
      const count = await userModel.delete({
        where: { email: 'nonexistent@example.com' },
      });

      expect(count).toBe(0);
    });
  });
});
