/**
 * Integration tests for migration functionality
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ConnectionManager } from '../../src/client/connection';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';
import type { ConnectionConfig, ModelRegistry } from '../../src/types';

// Test model registry
const testRegistry: ModelRegistry = {
  TestUser: {
    name: 'TestUser',
    tableName: 'test_user',
    fields: [
      { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
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

describe('Migration', () => {
  let connectionManager: ConnectionManager<typeof testRegistry>;

  beforeEach(async () => {
    connectionManager = new ConnectionManager(testRegistry);
    await connectionManager.connect(testConfig);

    // Clean up test table before each test
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      try {
        await surreal.query('REMOVE TABLE IF EXISTS test_user;');
      } catch {
        // Ignore errors
      }
    }
  });

  afterEach(async () => {
    // Clean up test table
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      try {
        await surreal.query('REMOVE TABLE IF EXISTS test_user;');
      } catch {
        // Ignore errors
      }
    }
    await connectionManager.disconnectAll();
  });

  test('should generate DEFINE TABLE statement', () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    expect(statements).toContain('DEFINE TABLE OVERWRITE test_user SCHEMAFULL;');
  });

  test('should generate DEFINE FIELD statements', () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    // Check for email field with assertion
    const emailField = statements.find((s) => s.includes('DEFINE FIELD') && s.includes('email'));
    expect(emailField).toBeDefined();
    expect(emailField).toContain('TYPE string');
    expect(emailField).toContain('ASSERT string::is_email($value)');

    // Check for name field
    const nameField = statements.find((s) => s.includes('DEFINE FIELD') && s.includes('name'));
    expect(nameField).toBeDefined();
    expect(nameField).toContain('TYPE string');

    // Check for optional age field
    const ageField = statements.find((s) => s.includes('DEFINE FIELD') && s.includes('age'));
    expect(ageField).toBeDefined();
    expect(ageField).toContain('TYPE option<int>');

    // Check for createdAt field with default
    const createdAtField = statements.find((s) => s.includes('DEFINE FIELD') && s.includes('createdAt'));
    expect(createdAtField).toBeDefined();
    expect(createdAtField).toContain('DEFAULT time::now()');
  });

  test('should generate DEFINE INDEX statement for unique fields', () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    const uniqueIndex = statements.find((s) => s.includes('DEFINE INDEX'));
    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex).toContain('test_user_email_unique');
    expect(uniqueIndex).toContain('UNIQUE');
  });

  test('should execute migration statements', async () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    // Execute migration
    await connectionManager.migrate(statements);

    // Verify migration was tracked
    expect(connectionManager.isMigrated()).toBe(true);

    // Verify table was created by querying table info
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      const result = await surreal.query('INFO FOR TABLE test_user;');
      expect(result).toBeDefined();
    }
  });

  test('should skip migration if already migrated', async () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    // First migration
    await connectionManager.migrate(statements);
    expect(connectionManager.isMigrated()).toBe(true);

    // Second migration should skip
    await connectionManager.migrate(statements);
    expect(connectionManager.isMigrated()).toBe(true);
  });

  test('should track migration status per connection', async () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    // Create second connection
    await connectionManager.connect(testConfig, 'secondary');

    // Migrate only default connection
    await connectionManager.migrate(statements);

    expect(connectionManager.isMigrated()).toBe(true);
    expect(connectionManager.isMigrated('secondary')).toBe(false);
  });

  test('should use ensureMigrated for lazy migration', async () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    expect(connectionManager.isMigrated()).toBe(false);

    // ensureMigrated should run migrations
    await connectionManager.ensureMigrated(statements);
    expect(connectionManager.isMigrated()).toBe(true);

    // Second call should skip
    await connectionManager.ensureMigrated(statements);
    expect(connectionManager.isMigrated()).toBe(true);
  });
});
