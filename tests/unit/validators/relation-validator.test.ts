/**
 * Unit Tests: Relation Validator
 *
 * Tests validation of relation field rules.
 */

import { describe, expect, test } from 'bun:test';
import {
  validatePKStructure,
  validateOnDeletePlacement,
  validateCardinalityMatch,
  validateKeyRequired,
  validateKeyPairing,
  validateRecordDecorators,
} from '../../../src/cli/validators/relation-validator';
import type { ASTField, ASTModel, SchemaAST, SchemaDecorator, ASTDecorator } from '../../../src/types';

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

// Helper to create a decorator
function createDecorator(type: SchemaDecorator, value?: unknown): ASTDecorator {
  return {
    type,
    value,
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
  };
}

describe('Relation Validator', () => {
  describe('validatePKStructure', () => {
    test('should pass when Relation @field references existing Record', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
        ],
      };

      const errors = validatePKStructure(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail when Relation @field references non-existent field', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'missingField')],
              }),
            ],
          }),
        ],
      };

      const errors = validatePKStructure(ast);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateOnDeletePlacement', () => {
    test('should pass for @onDelete on optional singular Relation', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record', isOptional: true }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: true,
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'authorId'),
                  createDecorator('onDelete', 'SetNull'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateOnDeletePlacement(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @onDelete on required Relation', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: false, // Required
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'authorId'),
                  createDecorator('onDelete', 'Cascade'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateOnDeletePlacement(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('optional'))).toBe(true);
    });

    test('should fail for @onDelete on array Relation', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({ name: 'postIds', type: 'record', isArray: true }),
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [
                  createDecorator('model', 'Post'),
                  createDecorator('field', 'postIds'),
                  createDecorator('onDelete', 'Cascade'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateOnDeletePlacement(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('array'))).toBe(true);
    });

    test('should fail for @onDelete on reverse Relation', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isOptional: true,
                isArray: false,
                decorators: [
                  createDecorator('model', 'Post'),
                  // No @field - this is a reverse relation
                  createDecorator('onDelete', 'Cascade'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateOnDeletePlacement(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('reverse'))).toBe(true);
    });
  });

  describe('validateCardinalityMatch', () => {
    test('should pass for matching Record + Relation cardinality', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
        ],
      };

      const errors = validateCardinalityMatch(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for matching Record[] + Relation[] cardinality', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'tagIds',
                type: 'record',
                isArray: true,
              }),
              createASTField({
                name: 'tags',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Tag'), createDecorator('field', 'tagIds')],
              }),
            ],
          }),
        ],
      };

      const errors = validateCardinalityMatch(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for mismatched cardinality (Relation[] with Record)', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'tagIds',
                type: 'record',
                isArray: false, // Singular
              }),
              createASTField({
                name: 'tags',
                type: 'relation',
                isArray: true, // Array
                decorators: [createDecorator('model', 'Tag'), createDecorator('field', 'tagIds')],
              }),
            ],
          }),
        ],
      };

      const errors = validateCardinalityMatch(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('mismatch'))).toBe(true);
    });

    test('should fail for mismatched optionality', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'authorId',
                type: 'record',
                isOptional: false, // Required
              }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: true, // Optional
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
        ],
      };

      const errors = validateCardinalityMatch(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Optionality'))).toBe(true);
    });
  });

  describe('validateKeyRequired', () => {
    test('should pass for single relation to target model', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyRequired(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for multiple relations to same model without @key', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Document',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'authorId'),
                  // Missing @key
                ],
              }),
              createASTField({ name: 'reviewerId', type: 'record', isOptional: true }),
              createASTField({
                name: 'reviewer',
                type: 'relation',
                isOptional: true,
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'reviewerId'),
                  // Missing @key
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyRequired(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('@key'))).toBe(true);
    });

    test('should pass for multiple relations to same model with @key', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Document',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'authorId'),
                  createDecorator('key', 'author'),
                ],
              }),
              createASTField({ name: 'reviewerId', type: 'record', isOptional: true }),
              createASTField({
                name: 'reviewer',
                type: 'relation',
                isOptional: true,
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'reviewerId'),
                  createDecorator('key', 'reviewer'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyRequired(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateRecordDecorators', () => {
    test('should pass for Record without relation decorators', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'authorId',
                type: 'record',
                decorators: [], // No relation decorators
              }),
            ],
          }),
        ],
      };

      const errors = validateRecordDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for Record with @model decorator', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'authorId',
                type: 'record',
                decorators: [createDecorator('model', 'User')],
              }),
            ],
          }),
        ],
      };

      const errors = validateRecordDecorators(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('@model'))).toBe(true);
    });

    test('should fail for Record with @field decorator', () => {
      const ast: SchemaAST = {
        source: '',
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'authorId',
                type: 'record',
                decorators: [createDecorator('field', 'someField')],
              }),
            ],
          }),
        ],
      };

      const errors = validateRecordDecorators(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('@field'))).toBe(true);
    });
  });
});
