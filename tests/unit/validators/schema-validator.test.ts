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
  validateTupleObjectCombination,
} from '../../../src/cli/validators/schema-validator';
import type { ASTField, ASTModel, ASTTuple, ASTTupleElement, SchemaAST } from '../../../src/types';

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
        objects: [],
        tuples: [],
        literals: [],
        models: [createASTModel({ name: 'User' }), createASTModel({ name: 'UserProfile' })],
      };

      const errors = validateModelNames(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for duplicate model names', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        models: [createASTModel({ name: 'User' }), createASTModel({ name: 'User' })],
      };

      const errors = validateModelNames(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    });

    test('should fail for invalid model names', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
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
        objects: [],
        tuples: [],
        literals: [],
        models: [
          createASTModel({ name: 'user' }), // Invalid: lowercase
        ],
      };

      const result = validateSchema(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateTupleObjectCombination', () => {
    const defaultRange = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

    function createTupleElement(overrides: Partial<ASTTupleElement> = {}): ASTTupleElement {
      return { type: 'string', isOptional: false, ...overrides };
    }

    function createTuple(overrides: Partial<ASTTuple> = {}): ASTTuple {
      return { name: 'TestTuple', elements: [], range: defaultRange, ...overrides };
    }

    test('passes when model has no optional objects', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [createTupleElement({ type: 'string' }), createTupleElement({ type: 'float', isOptional: true })],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 'data', type: 'tuple', tupleName: 'MyTuple', isOptional: true }),
              createASTField({ name: 'addr', type: 'object', objectName: 'Addr', isOptional: false }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(0);
    });

    test('passes when optional tuple has no optional elements', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [createTupleElement({ type: 'string' }), createTupleElement({ type: 'float' })],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 'data', type: 'tuple', tupleName: 'MyTuple', isOptional: true }),
              createASTField({ name: 'addr', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(0);
    });

    test('passes when optional tuple has optional elements but no decorated required elements', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [
              createTupleElement({ type: 'string' }), // required, no decorator → safe
              createTupleElement({ type: 'float', isOptional: true }),
            ],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 'data', type: 'tuple', tupleName: 'MyTuple', isOptional: true }),
              createASTField({ name: 'addr', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(0);
    });

    test('errors when optional tuple has decorated required element + optional object', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [
              createTupleElement({
                type: 'string',
                decorators: [{ type: 'default', value: 'hello', range: defaultRange }],
              }),
              createTupleElement({ type: 'float', isOptional: true }),
            ],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 'data', type: 'tuple', tupleName: 'MyTuple', isOptional: true }),
              createASTField({ name: 'addr', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('SurrealDB bug');
      expect(errors[0]!.model).toBe('Test');
      expect(errors[0]!.field).toBe('data');
    });

    test('errors with @defaultAlways on required element', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [
              createTupleElement({
                type: 'date',
                decorators: [{ type: 'updatedAt', range: defaultRange }],
              }),
              createTupleElement({ type: 'float', isOptional: true }),
            ],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 'data', type: 'tuple', tupleName: 'MyTuple', isOptional: true }),
              createASTField({ name: 'shipping', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('decorated required element');
    });

    test('passes when tuple field is required (not optional)', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [
              createTupleElement({
                type: 'string',
                decorators: [{ type: 'default', value: 'x', range: defaultRange }],
              }),
              createTupleElement({ type: 'float', isOptional: true }),
            ],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 'data', type: 'tuple', tupleName: 'MyTuple', isOptional: false }),
              createASTField({ name: 'addr', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(0);
    });

    test('lists all optional object fields in error message', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [
              createTupleElement({
                type: 'string',
                decorators: [{ type: 'default', value: 'x', range: defaultRange }],
              }),
              createTupleElement({ type: 'float', isOptional: true }),
            ],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 'data', type: 'tuple', tupleName: 'MyTuple', isOptional: true }),
              createASTField({ name: 'addr', type: 'object', objectName: 'Addr', isOptional: true }),
              createASTField({ name: 'ship', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('addr, ship');
    });

    test('errors for multiple problematic tuples on same model', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [
          createTuple({
            name: 'Tuple1',
            elements: [
              createTupleElement({
                type: 'string',
                decorators: [{ type: 'default', value: 'a', range: defaultRange }],
              }),
              createTupleElement({ type: 'int', isOptional: true }),
            ],
          }),
          createTuple({
            name: 'Tuple2',
            elements: [
              createTupleElement({
                type: 'date',
                decorators: [{ type: 'createdAt', range: defaultRange }],
              }),
              createTupleElement({ type: 'float', isOptional: true }),
            ],
          }),
        ],
        literals: [],
        models: [
          createASTModel({
            name: 'Test',
            fields: [
              createASTField({ name: 't1', type: 'tuple', tupleName: 'Tuple1', isOptional: true }),
              createASTField({ name: 't2', type: 'tuple', tupleName: 'Tuple2', isOptional: true }),
              createASTField({ name: 'obj', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateTupleObjectCombination(ast);
      expect(errors).toHaveLength(2);
    });
  });
});
