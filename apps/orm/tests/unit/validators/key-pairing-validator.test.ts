/**
 * Unit Tests: Key Pairing Validator
 *
 * Tests validation of @key decorator pairing between forward and reverse relations.
 */

import { describe, expect, test } from 'bun:test';
import { validateKeyPairing } from '../../../src/cli/validators/relation-validator';
import type { ASTDecorator, ASTField, ASTModel, SchemaAST, SchemaDecorator } from '../../../src/types';

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

describe('validateKeyPairing', () => {
  describe('positive cases', () => {
    test('should pass when forward relation with @key matches reverse with same @key', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when reverse relation with @key matches forward with same @key', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when multiple keyed pairs all match correctly', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
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
                  createDecorator('field', 'postIds'),
                  createDecorator('model', 'Post'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
              createASTField({ name: 'commentIds', type: 'record', isArray: true }),
              createASTField({
                name: 'comments',
                type: 'relation',
                isArray: true,
                decorators: [
                  createDecorator('field', 'commentIds'),
                  createDecorator('model', 'Comment'),
                  createDecorator('key', 'authorCommentKey'),
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
          createASTModel({
            name: 'Comment',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('key', 'authorCommentKey')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when relation has no @key decorator', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  // No @key decorator
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [
                  createDecorator('model', 'Post'),
                  // No @key decorator
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when target model does not exist', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'NonExistentUser'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass with empty AST', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when @model decorator is missing', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('key', 'authorKey'),
                  // No @model decorator
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('negative cases - forward relation errors', () => {
    test('should fail when forward relation with @key has no matching reverse in target', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [
                  createDecorator('model', 'Post'),
                  // Missing @key decorator
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('@key(authorKey)');
      expect(errors[0]?.message).toContain('forward');
      expect(errors[0]?.message).toContain('reverse');
      expect(errors[0]?.message).toContain('User');
      expect(errors[0]?.model).toBe('Post');
      expect(errors[0]?.field).toBe('author');
    });

    test('should fail when forward relation @key does not match reverse @key', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'wrongKey')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      // Both sides report errors when keys don't match
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.field === 'author')).toBe(true);
    });

    test('should fail when forward relation has @key but target has forward instead of reverse', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [
              createASTField({ name: 'postId', type: 'record' }),
              createASTField({
                name: 'post',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'postId'),
                  createDecorator('model', 'Post'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      // Both sides report errors when opposite types don't match
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.field === 'author')).toBe(true);
    });
  });

  describe('negative cases - reverse relation errors', () => {
    test('should fail when reverse relation with @key has no matching forward in target', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  // Missing @key decorator
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('@key(authorKey)');
      expect(errors[0]?.message).toContain('reverse');
      expect(errors[0]?.message).toContain('forward');
      expect(errors[0]?.message).toContain('Post');
      expect(errors[0]?.model).toBe('User');
      expect(errors[0]?.field).toBe('posts');
    });

    test('should fail when reverse relation @key does not match forward @key', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'wrongKey'),
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      // Both sides report errors when keys don't match
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.field === 'posts')).toBe(true);
    });

    test('should fail when reverse relation has @key but target has reverse instead of forward', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('key', 'authorKey')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      // Both sides report errors when opposite types don't match
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.field === 'posts')).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should report multiple errors for multiple mismatched @key pairs', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
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
                  createDecorator('field', 'postIds'),
                  createDecorator('model', 'Post'),
                  createDecorator('key', 'authorKey'),
                ],
              }),
              createASTField({ name: 'commentIds', type: 'record', isArray: true }),
              createASTField({
                name: 'comments',
                type: 'relation',
                isArray: true,
                decorators: [
                  createDecorator('field', 'commentIds'),
                  createDecorator('model', 'Comment'),
                  createDecorator('key', 'authorCommentKey'),
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [createDecorator('model', 'User'), createDecorator('key', 'wrongKey')],
              }),
            ],
          }),
          createASTModel({
            name: 'Comment',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('model', 'User'),
                  // Missing @key
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors.length).toBeGreaterThanOrEqual(2);
      expect(errors.some((e) => e.field === 'posts')).toBe(true);
      expect(errors.some((e) => e.field === 'comments')).toBe(true);
    });

    test('should handle self-referential relations with matching @key', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({ name: 'managerId', type: 'record', isOptional: true }),
              createASTField({
                name: 'manager',
                type: 'relation',
                isOptional: true,
                decorators: [
                  createDecorator('field', 'managerId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'managerKey'),
                ],
              }),
              createASTField({
                name: 'subordinates',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'User'), createDecorator('key', 'managerKey')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should handle self-referential relations with mismatched @key', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'User',
            fields: [
              createASTField({ name: 'managerId', type: 'record', isOptional: true }),
              createASTField({
                name: 'manager',
                type: 'relation',
                isOptional: true,
                decorators: [
                  createDecorator('field', 'managerId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'managerKey'),
                ],
              }),
              createASTField({
                name: 'subordinates',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'User'), createDecorator('key', 'wrongKey')],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      // Both sides report errors when keys don't match
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.field === 'manager' || e.field === 'subordinates')).toBe(true);
    });

    test('should skip non-relation fields', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'title', type: 'string' }),
              createASTField({ name: 'content', type: 'string' }),
              createASTField({ name: 'views', type: 'int' }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(0);
    });

    test('should report error with correct line number', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  createDecorator('field', 'authorId'),
                  createDecorator('model', 'User'),
                  createDecorator('key', 'authorKey'),
                ],
                range: {
                  start: { line: 42, column: 1, offset: 0 },
                  end: { line: 42, column: 1, offset: 0 },
                },
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [
                  createDecorator('model', 'Post'),
                  // Missing @key
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateKeyPairing(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.line).toBe(42);
    });
  });
});
