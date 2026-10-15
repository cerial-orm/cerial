/**
 * Integration tests for migration functionality
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ConnectionManager } from '../../src/client/connection';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';
import type { ConnectionConfig } from '../../src/types';
import { parseModelRegistry } from '../test-helpers';

// Parse model using DSL to ensure correct behavior
const dsl = `
model TestUser {
  id Record @id
  email Email @unique
  name String
  age Int?
  isActive Bool
  createdAt Date @createdAt
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

describe('Migration', () => {
  let connectionManager: ConnectionManager<typeof testRegistry>;

  beforeEach(async () => {
    connectionManager = new ConnectionManager(testRegistry);
    await connectionManager.connect(testConfig);

    // Clean up test table before each test
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      const tableName = testRegistry.TestUser!.tableName;
      try {
        await surreal.query(`REMOVE TABLE IF EXISTS ${tableName};`);
      } catch {
        // Ignore errors
      }
    }
  });

  afterEach(async () => {
    // Clean up test table
    const surreal = connectionManager.getSurreal();
    if (surreal) {
      const tableName = testRegistry.TestUser!.tableName;
      try {
        await surreal.query(`REMOVE TABLE IF EXISTS ${tableName};`);
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
    // Optional fields use option<T> — null requires @nullable
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
    expect(uniqueIndex).toContain(`${model.tableName}_email_unique`);
    expect(uniqueIndex).toContain('UNIQUE');
  });

  test('should apply the generated statements against the database', async () => {
    const model = testRegistry.TestUser!;
    const statements = generateModelDefineStatements(model);

    const surreal = connectionManager.getSurreal();
    if (!surreal) throw new Error('No surreal instance');

    await surreal.query(statements.join('\n'));

    const result = await surreal.query('INFO FOR TABLE test_user;');
    expect(result).toBeDefined();
  });
});
