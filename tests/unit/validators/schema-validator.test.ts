/**
 * Unit Tests: Schema Validator
 *
 * Tests validation of schema AST.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateFieldNames,
  validateModelNames,
  validateRelations,
  validateSchema,
} from '../../../src/cli/validators/schema-validator';
import type { ASTField, ASTModel, SchemaAST } from '../../../src/types';

// Helper to create a minimal ASTField
function createASTField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
    ...overrides,
  };
}

// Helper to create a minimal ASTModel
function createASTModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
    ...overrides,
  };
}

describe('Schema Validator', () => {
  describe('validateModelNames', () => {
    test('should pass for valid PascalCase model names', () => {
      const ast: SchemaAST = {
        source: '',
        models: [createASTModel({ name: 'User' }), createASTModel({ name: 'UserProfile' })],
      };

      const errors = validateModelNames(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for duplicate model names', () => {
      const ast: SchemaAST = {
        source: '',
        models: [createASTModel({ name: 'User' }), createASTModel({ name: 'User' })],
      };

      const errors = validateModelNames(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    });

    test('should fail for invalid model names', () => {
      const ast: SchemaAST = {
        source: '',
        models: [createASTModel({ name: 'user' })], // lowercase
      };

      const errors = validateModelNames(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Invalid model name'))).toBe(true);
    });
  });

  describe('validateFieldNames', () => {
    test('should pass for valid field names', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({ name: 'id' }),
              createASTField({ name: 'userName' }),
              createASTField({ name: 'user_name' }),
            ],
          }),
        ],
      };

      const errors = validateFieldNames(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for duplicate field names', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [createASTField({ name: 'email' }), createASTField({ name: 'email' })],
          }),
        ],
      };

      const errors = validateFieldNames(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    });
  });

  describe('validateRelations', () => {
    test('should fail for Relation without @model', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                decorators: [], // Missing @model
              }),
            ],
          }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('@model'))).toBe(true);
    });

    test('should fail for Relation referencing non-existent model', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                decorators: [
                  {
                    type: 'model',
                    value: 'NonExistent',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                  },
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('non-existent'))).toBe(true);
    });

    test('should pass for valid Relation with existing target', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [
                  {
                    type: 'model',
                    value: 'Post',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                  },
                ],
              }),
            ],
          }),
          createASTModel({ name: 'Post' }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @field referencing non-existent Record field', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  {
                    type: 'model',
                    value: 'User',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                  },
                  {
                    type: 'field',
                    value: 'authorId', // This field doesn't exist
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                  },
                ],
              }),
            ],
          }),
          createASTModel({ name: 'User' }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateSchema', () => {
    test('should return valid:true for valid schema', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [createASTField({ name: 'id', type: 'string' }), createASTField({ name: 'name', type: 'string' })],
          }),
        ],
      };

      const result = validateSchema(ast);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should return valid:false for invalid schema', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({ name: 'user' }), // Invalid: lowercase
        ],
      };

      const result = validateSchema(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
