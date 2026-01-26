/**
 * Integration tests for CRUD operations
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ConnectionManager } from '../../src/client/connection';
import { Model } from '../../src/client/model/model';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';
import type { ConnectionConfig } from '../../src/types';
import { parseModelRegistry } from '../test-helpers';

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

// Parse model using DSL to ensure correct behavior
const dsl = `
model TestUser {
  id String @id
  email Email @unique
  name String
  age Int?
  isActive Bool
  createdAt Date @now
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

describe('CRUD Operations', () => {
  let connectionManager: ConnectionManager<typeof testRegistry>;
  let userModel: Model<TestUser>;

  beforeEach(async () => {
    connectionManager = new ConnectionManager(testRegistry);
    await connectionManager.connect(testConfig);

    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    // Clean up and run migrations
    const tableName = testRegistry.TestUser!.tableName;
    try {
      await surreal.query(`REMOVE TABLE IF EXISTS ${tableName};`);
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

  describe('Find Unique', () => {
    beforeEach(async () => {
      // Create test user with known id
      await userModel.create({
        data: {
          id: 'unique1@example.com',
          email: 'unique1@example.com',
          name: 'Unique User 1',
          isActive: true,
        },
      });
    });

    test('should find a record by id', async () => {
      const result = await userModel.findUnique({
        where: { id: 'unique1@example.com' },
      });

      expect(result).toBeDefined();
      expect(result?.email).toBe('unique1@example.com');
      expect(result?.name).toBe('Unique User 1');
    });

    test('should find a record by id with additional conditions', async () => {
      const result = await userModel.findUnique({
        where: { id: 'unique1@example.com', isActive: true },
      });

      expect(result).toBeDefined();
      expect(result?.email).toBe('unique1@example.com');
      expect(result?.isActive).toBe(true);
    });

    test('should return null when record not found', async () => {
      const result = await userModel.findUnique({
        where: { id: 'nonexistent@example.com' },
      });

      expect(result).toBeNull();
    });

    test('should throw error when id is missing from where clause', async () => {
      await expect(
        userModel.findUnique({
          where: {} as any,
        }),
      ).rejects.toThrow('id is required in where clause for findUnique');
    });

    test('should find a record by id with select', async () => {
      const result = await userModel.findUnique({
        where: { id: 'unique1@example.com' },
        select: { name: true, email: true },
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Unique User 1');
      expect(result?.email).toBe('unique1@example.com');
      expect(result?.isActive).toBeUndefined();
    });

    test('should throw error when table in RecordId does not match', async () => {
      // This test is conceptual - in practice you can't pass wrong table via where
      // since we construct RecordId from the id value
      await expect(
        userModel.findUnique({
          where: { id: 'wrong_table:id123' },
        }),
      ).rejects.toThrow('RecordId table "wrong_table" does not start with expected table');
    });
  });

  describe('Update', () => {
    beforeEach(async () => {
      await userModel.create({ data: { email: 'update@example.com', name: 'Update Me', isActive: false } });
    });

    test('should update records', async () => {
      const results = await userModel.updateMany({
        where: { email: 'update@example.com' },
        data: { isActive: true, name: 'Updated' },
      });

      expect(results.length).toBe(1);
      expect(results[0]!.isActive).toBe(true);
      expect(results[0]!.name).toBe('Updated');
    });

    test('should return empty array when no records match', async () => {
      const results = await userModel.updateMany({
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
