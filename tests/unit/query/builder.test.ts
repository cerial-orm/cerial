/**
 * Unit Tests: Query Builder Base
 *
 * Tests base query building utilities.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { astToRegistry } from '../../../src/parser/model-metadata';

// Simple test schema
const schema = `
model User {
  id Record @id
  email Email @unique
  name String
  age Int?
  active Bool
}
`;

const { ast } = parse(schema);
const registry = astToRegistry(ast);
const userModel = registry['User']!;

describe('Query Builder Base', () => {
  describe('Model Metadata', () => {
    test('should have correct model name', () => {
      expect(userModel.name).toBe('User');
    });

    test('should have correct table name', () => {
      expect(userModel.tableName).toBe('user');
    });

    test('should have all fields', () => {
      const fieldNames = userModel.fields.map((f) => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('email');
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('age');
      expect(fieldNames).toContain('active');
    });

    test('should identify id field', () => {
      const idField = userModel.fields.find((f) => f.name === 'id');
      expect(idField?.isId).toBe(true);
    });

    test('should identify unique field', () => {
      const emailField = userModel.fields.find((f) => f.name === 'email');
      expect(emailField?.isUnique).toBe(true);
    });

    test('should identify optional field', () => {
      const ageField = userModel.fields.find((f) => f.name === 'age');
      expect(ageField?.isRequired).toBe(false);
    });

    test('should identify required field', () => {
      const nameField = userModel.fields.find((f) => f.name === 'name');
      expect(nameField?.isRequired).toBe(true);
    });
  });
});
