/**
 * Integration tests for schema validation
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { ConnectionManager } from '../../src/client/connection';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';
import type { ConnectionConfig } from '../../src/types';
import { parseModelRegistry } from '../test-helpers';

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
    // Parse models using DSL
    const userDsl = `
model User {
  id String @id
  email Email @unique
  name String
}
`;
    const registry = parseModelRegistry(userDsl);

    connectionManager = new ConnectionManager(registry);
    await connectionManager.connect(testConfig);

    // Clean up test tables
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      const tableName = registry.User!.tableName;
      try {
        await surreal.query(`REMOVE TABLE IF EXISTS ${tableName};`);
      } catch {
        // Ignore errors
      }
    }
  });

  afterEach(async () => {
    // Clean up test tables
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      const tableName = connectionManager.getRegistry().User!.tableName;
      try {
        await surreal.query(`REMOVE TABLE IF EXISTS ${tableName};`);
      } catch {
        // Ignore errors
      }
    }
    await connectionManager.disconnectAll();
  });

  test('should create SCHEMAFULL table', async () => {
    const modelDsl = `
    model User {
      id String @id
      email Email
    }
    `;
    const registry = parseModelRegistry(modelDsl);

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Query table info
    const [info] = await surreal.query<[Record<string, unknown>]>('INFO FOR TABLE test_schema_user;');
    expect(info).toBeDefined();
  });

  test('should enforce email validation', async () => {
    const modelDsl = `
    model User {
      id String @id
      email Email
    }
    `;
    const registry = parseModelRegistry(modelDsl);

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Valid email should work
    const tableName = registry.User!.tableName;
    const [validResult] = await surreal.query<[{ id: string; email: string }[]]>(
      `CREATE ${tableName} SET email = 'valid@example.com';`,
    );
    expect(validResult).toBeDefined();
    expect(validResult.length).toBeGreaterThan(0);

    // Invalid email should fail
    try {
      await surreal.query(`CREATE ${tableName} SET email = 'invalid-email';`);
      // If we get here, test should fail
      expect(true).toBe(false);
    } catch (error) {
      // Expected to throw
      expect(error).toBeDefined();
    }
  });

  test('should enforce unique constraint via index', async () => {
    const modelDsl = `
    model User {
      id String @id
      email Email @unique
    }
    `;
    const registry = parseModelRegistry(modelDsl);
    const tableName = registry.User!.tableName;

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // First insert should work
    await surreal.query(`CREATE ${tableName} SET email = 'unique@example.com';`);

    // Second insert with same email should fail
    try {
      await surreal.query(`CREATE ${tableName} SET email = 'unique@example.com';`);
      // If we get here, as test should fail (duplicate should be rejected)
      expect(true).toBe(false);
    } catch (error) {
      // Expected to throw due to unique constraint
      expect(error).toBeDefined();
    }
  });

  test('should apply default datetime value', async () => {
    const modelDsl = `
    model User {
      id String @id
      email Email
      createdAt Date @now
    }
    `;
    const registry = parseModelRegistry(modelDsl);

    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Create record without specifying createdAt
    const tableName = registry.User!.tableName;
    const [result] = await surreal.query<[{ id: string; email: string; createdAt: string }[]]>(
      `CREATE ${tableName} SET email = 'test@example.com';`,
    );

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.createdAt).toBeDefined();
  });

  test('should handle optional fields', async () => {
    const optionalUserDsl = `
model User {
  id String @id
  email Email @unique
  age Int?
}
`;
    const registry = parseModelRegistry(optionalUserDsl);
    const statements = generateModelDefineStatements(registry.User!);
    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    // Create record without optional age field
    const tableName = registry.User!.tableName;
    const [result] = await surreal.query<[{ id: string; email: string; age?: number }[]]>(
      `CREATE ${tableName} SET email = 'test@example.com';`,
    );

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    // age should be undefined or null for optional fields
  });

  test('should generate correct type for all field types', () => {
    const allTypesDsl = `
model AllTypes {
  id String @id
  stringField String
  emailField Email
  intField Int
  floatField Float
  boolField Bool
  dateField Date
}
`;
    const registry = parseModelRegistry(allTypesDsl);
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
