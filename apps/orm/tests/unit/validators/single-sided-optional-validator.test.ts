/**
 * Unit Tests: validateSingleSidedOptional
 *
 * Tests validation of single-sided relation optionality rules.
 * A single-sided relation is a forward relation (has @field) where the target model
 * has no reverse relation pointing back. Such relations must be optional.
 */

import { describe, expect, test } from 'bun:test';
import { validateSingleSidedOptional } from '../../../src/cli/validators/relation-validator';
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

describe('validateSingleSidedOptional', () => {
  describe('positive cases - no errors', () => {
    test('should pass for optional forward Relation with no reverse', () => {
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
              createASTField({ name: 'authorId', type: 'record', isOptional: true }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: true,
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should pass for forward Relation where target has reverse', () => {
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
                isOptional: false,
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
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
                decorators: [createDecorator('model', 'Post')],
              }),
            ],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should pass for array forward Relation with no reverse', () => {
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
                decorators: [createDecorator('model', 'Post'), createDecorator('field', 'postIds')],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should pass for reverse Relation (no @field)', () => {
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
                isOptional: false,
                decorators: [createDecorator('model', 'Post')],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should pass for non-relation field', () => {
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
                name: 'email',
                type: 'string',
                isOptional: false,
              }),
            ],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should pass for empty AST', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should pass for self-referential Relation with no reverse', () => {
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
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'managerId')],
              }),
            ],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should pass for N:N relation (both sides have Record[] + Relation[])', () => {
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
              createASTField({ name: 'roleIds', type: 'record', isArray: true }),
              createASTField({
                name: 'roles',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Role'), createDecorator('field', 'roleIds')],
              }),
            ],
          }),
          createASTModel({
            name: 'Role',
            fields: [
              createASTField({ name: 'userIds', type: 'record', isArray: true }),
              createASTField({
                name: 'users',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'userIds')],
              }),
            ],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });
  });

  describe('negative cases - error paths', () => {
    test('should fail for required forward Relation with no reverse', () => {
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
              createASTField({ name: 'authorId', type: 'record', isOptional: true }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: false,
                range: {
                  start: { line: 5, column: 1, offset: 0 },
                  end: { line: 5, column: 1, offset: 0 },
                },
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Single-sided relation'))).toBe(true);
      expect(errors.some((e) => e.message.includes('must be optional'))).toBe(true);
      expect(errors.some((e) => e.field === 'author')).toBe(true);
    });

    test('should fail for required Record field backing single-sided Relation', () => {
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
                name: 'authorId',
                type: 'record',
                isOptional: false,
                range: {
                  start: { line: 3, column: 1, offset: 0 },
                  end: { line: 3, column: 1, offset: 0 },
                },
              }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: true,
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Record field'))).toBe(true);
      expect(errors.some((e) => e.message.includes('must be optional'))).toBe(true);
      expect(errors.some((e) => e.field === 'authorId')).toBe(true);
    });

    test('should fail for both required Relation and required Record field', () => {
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
                name: 'authorId',
                type: 'record',
                isOptional: false,
                range: {
                  start: { line: 3, column: 1, offset: 0 },
                  end: { line: 3, column: 1, offset: 0 },
                },
              }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: false,
                range: {
                  start: { line: 4, column: 1, offset: 0 },
                  end: { line: 4, column: 1, offset: 0 },
                },
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(2);
      expect(errors.some((e) => e.field === 'author')).toBe(true);
      expect(errors.some((e) => e.field === 'authorId')).toBe(true);
    });

    test('should fail when Record field does not exist but Relation references it', () => {
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
                isOptional: false,
                range: {
                  start: { line: 4, column: 1, offset: 0 },
                  end: { line: 4, column: 1, offset: 0 },
                },
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'nonExistentId')],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.field === 'author')).toBe(true);
    });

    test('should fail for multiple single-sided relations in same model', () => {
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
              createASTField({ name: 'authorId', type: 'record', isOptional: true }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: false,
                range: {
                  start: { line: 5, column: 1, offset: 0 },
                  end: { line: 5, column: 1, offset: 0 },
                },
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
              }),
              createASTField({ name: 'editorId', type: 'record', isOptional: true }),
              createASTField({
                name: 'editor',
                type: 'relation',
                isOptional: false,
                range: {
                  start: { line: 8, column: 1, offset: 0 },
                  end: { line: 8, column: 1, offset: 0 },
                },
                decorators: [createDecorator('model', 'User'), createDecorator('field', 'editorId')],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors.length).toBeGreaterThanOrEqual(2);
      expect(errors.filter((e) => e.field === 'author')).toHaveLength(1);
      expect(errors.filter((e) => e.field === 'editor')).toHaveLength(1);
    });

    test('should report correct model and line number in error', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'Comment',
            fields: [
              createASTField({ name: 'postId', type: 'record', isOptional: true }),
              createASTField({
                name: 'post',
                type: 'relation',
                isOptional: false,
                range: {
                  start: { line: 42, column: 1, offset: 0 },
                  end: { line: 42, column: 1, offset: 0 },
                },
                decorators: [createDecorator('model', 'Post'), createDecorator('field', 'postId')],
              }),
            ],
          }),
          createASTModel({
            name: 'Post',
            fields: [],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0];
      expect(error.model).toBe('Comment');
      expect(error.field).toBe('post');
      expect(error.line).toBe(42);
    });
  });

  describe('edge cases with @key decorator', () => {
    test('should pass when forward Relation with @key matches reverse @key', () => {
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
              createASTField({ name: 'authorId', type: 'record', isOptional: true }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: false,
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'authorId'),
                  createDecorator('key', 'posts'),
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
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'posts')],
              }),
            ],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors).toHaveLength(0);
    });

    test('should fail when forward Relation with @key does not match reverse @key', () => {
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
              createASTField({ name: 'authorId', type: 'record', isOptional: true }),
              createASTField({
                name: 'author',
                type: 'relation',
                isOptional: false,
                range: {
                  start: { line: 5, column: 1, offset: 0 },
                  end: { line: 5, column: 1, offset: 0 },
                },
                decorators: [
                  createDecorator('model', 'User'),
                  createDecorator('field', 'authorId'),
                  createDecorator('key', 'posts'),
                ],
              }),
            ],
          }),
          createASTModel({
            name: 'User',
            fields: [
              createASTField({
                name: 'articles',
                type: 'relation',
                isArray: true,
                decorators: [createDecorator('model', 'Post'), createDecorator('key', 'articles')],
              }),
            ],
          }),
        ],
      };

      const errors = validateSingleSidedOptional(ast);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Single-sided relation'))).toBe(true);
    });
  });
});
