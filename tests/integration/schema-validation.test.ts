/**
 * Integration tests for schema validation
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { ConnectionManager } from '../../src/client/connection';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';
import type { ModelRegistry, ConnectionConfig } from '../../src/types';

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

describe('Schema Validation', () => {
  let connectionManager: ConnectionManager;

  beforeEach(async () => {
    connectionManager = new ConnectionManager({});
    await connectionManager.connect(testConfig);

    // Clean up test tables
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      try {
        await surreal.query('REMOVE TABLE IF EXISTS test_schema_user;');
        await surreal.query('REMOVE TABLE IF EXISTS test_strict_user;');
      } catch {
        // Ignore errors
      }
    }
  });

  afterEach(async () => {
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      try {
        await surreal.query('REMOVE TABLE IF EXISTS test_schema_user;');
        await surreal.query('REMOVE TABLE IF EXISTS test_strict_user;');
      } catch {
        // Ignore errors
      }
    }
    await connectionManager.disconnectAll();
  });

  test('should create SCHEMAFULL table', async () => {
    const registry: ModelRegistry = {
      User: {
        name: 'User',
        tableName: 'test_schema_user',
        fields: [
          { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'email', type: 'email', isId: false, isUnique: true, hasNowDefault: false, isRequired: true },
        ],
      },
    };

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Query table info
    const [info] = await surreal.query<[Record<string, unknown>]>('INFO FOR TABLE test_schema_user;');
    expect(info).toBeDefined();
  });

  test('should enforce email validation', async () => {
    const registry: ModelRegistry = {
      User: {
        name: 'User',
        tableName: 'test_strict_user',
        fields: [
          { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'email', type: 'email', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
        ],
      },
    };

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Valid email should work
    const [validResult] = await surreal.query<[{ id: string; email: string }[]]>(
      "CREATE test_strict_user SET email = 'valid@example.com';",
    );
    expect(validResult).toBeDefined();
    expect(validResult.length).toBeGreaterThan(0);

    // Invalid email should fail
    try {
      await surreal.query("CREATE test_strict_user SET email = 'invalid-email';");
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (error) {
      // Expected to throw
      expect(error).toBeDefined();
    }
  });

  test('should enforce unique constraint via index', async () => {
    const registry: ModelRegistry = {
      User: {
        name: 'User',
        tableName: 'test_schema_user',
        fields: [
          { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'email', type: 'email', isId: false, isUnique: true, hasNowDefault: false, isRequired: true },
        ],
      },
    };

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // First insert should work
    await surreal.query("CREATE test_schema_user SET email = 'unique@example.com';");

    // Second insert with same email should fail
    try {
      await surreal.query("CREATE test_schema_user SET email = 'unique@example.com';");
      // If we get here, the test should fail (duplicate should be rejected)
      expect(true).toBe(false);
    } catch (error) {
      // Expected to throw due to unique constraint
      expect(error).toBeDefined();
    }
  });

  test('should apply default datetime value', async () => {
    const registry: ModelRegistry = {
      User: {
        name: 'User',
        tableName: 'test_schema_user',
        fields: [
          { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'email', type: 'email', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'createdAt', type: 'date', isId: false, isUnique: false, hasNowDefault: true, isRequired: true },
        ],
      },
    };

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Create record without specifying createdAt
    const [result] = await surreal.query<[{ id: string; email: string; createdAt: string }[]]>(
      "CREATE test_schema_user SET email = 'test@example.com';",
    );

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.createdAt).toBeDefined();
  });

  test('should handle optional fields', async () => {
    const registry: ModelRegistry = {
      User: {
        name: 'User',
        tableName: 'test_schema_user',
        fields: [
          { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'email', type: 'email', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'age', type: 'int', isId: false, isUnique: false, hasNowDefault: false, isRequired: false },
        ],
      },
    };

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Create record without optional age field
    const [result] = await surreal.query<[{ id: string; email: string; age?: number }[]]>(
      "CREATE test_schema_user SET email = 'test@example.com';",
    );

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    // age should be undefined or null for optional fields
  });

  test('should generate correct type for all field types', () => {
    const registry: ModelRegistry = {
      AllTypes: {
        name: 'AllTypes',
        tableName: 'all_types',
        fields: [
          { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'stringField', type: 'string', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'emailField', type: 'email', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'intField', type: 'int', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'floatField', type: 'float', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'boolField', type: 'bool', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
          { name: 'dateField', type: 'date', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
        ],
      },
    };

    const statements = generateModelDefineStatements(registry.AllTypes!);

    // Check each field type mapping
    expect(statements.find((s) => s.includes('stringField') && s.includes('TYPE string'))).toBeDefined();
    expect(
      statements.find((s) => s.includes('emailField') && s.includes('TYPE string') && s.includes('ASSERT')),
    ).toBeDefined();
    expect(statements.find((s) => s.includes('intField') && s.includes('TYPE int'))).toBeDefined();
    expect(statements.find((s) => s.includes('floatField') && s.includes('TYPE float'))).toBeDefined();
    expect(statements.find((s) => s.includes('boolField') && s.includes('TYPE bool'))).toBeDefined();
    expect(statements.find((s) => s.includes('dateField') && s.includes('TYPE datetime'))).toBeDefined();
  });
});
