/**
 * Unit Tests: N:N Completeness Validator
 *
 * Tests validation of N:N relation completeness.
 *
 * REGRESSION GUARD: validateNToNCompleteness is currently a stub that always returns [].
 * These tests document the current behavior so that if the stub is implemented with real
 * validation in the future, the tests will catch the change and alert developers.
 */

import { describe, expect, test } from 'bun:test';
import { validateNToNCompleteness } from '../../../src/cli/validators/relation-validator';
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

describe('validateNToNCompleteness', () => {
  test('should return 0 errors for empty AST', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [],
    };

    const errors = validateNToNCompleteness(ast);

    expect(errors).toHaveLength(0);
  });

  test('should return 0 errors for single model with no relations', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [
        createASTModel({
          name: 'User',
          fields: [createASTField({ name: 'id', type: 'record' }), createASTField({ name: 'name', type: 'string' })],
        }),
      ],
    };

    const errors = validateNToNCompleteness(ast);

    expect(errors).toHaveLength(0);
  });

  test('should return 0 errors for N:N with both sides having Record[] + Relation[]', () => {
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
            createASTField({ name: 'id', type: 'record' }),
            createASTField({
              name: 'groupIds',
              type: 'record',
              isArray: true,
              decorators: [createDecorator('field', 'groupIds')],
            }),
            createASTField({
              name: 'groups',
              type: 'relation',
              isArray: true,
              decorators: [createDecorator('field', 'groupIds'), createDecorator('model', 'Group')],
            }),
          ],
        }),
        createASTModel({
          name: 'Group',
          fields: [
            createASTField({ name: 'id', type: 'record' }),
            createASTField({
              name: 'userIds',
              type: 'record',
              isArray: true,
              decorators: [createDecorator('field', 'userIds')],
            }),
            createASTField({
              name: 'users',
              type: 'relation',
              isArray: true,
              decorators: [createDecorator('field', 'userIds'), createDecorator('model', 'User')],
            }),
          ],
        }),
      ],
    };

    const errors = validateNToNCompleteness(ast);

    expect(errors).toHaveLength(0);
  });

  test('should return 0 errors for N:N with only one side having Record[] + Relation[]', () => {
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
            createASTField({ name: 'id', type: 'record' }),
            createASTField({
              name: 'groupIds',
              type: 'record',
              isArray: true,
              decorators: [createDecorator('field', 'groupIds')],
            }),
            createASTField({
              name: 'groups',
              type: 'relation',
              isArray: true,
              decorators: [createDecorator('field', 'groupIds'), createDecorator('model', 'Group')],
            }),
          ],
        }),
        createASTModel({
          name: 'Group',
          fields: [
            createASTField({ name: 'id', type: 'record' }),
            createASTField({
              name: 'users',
              type: 'relation',
              decorators: [createDecorator('model', 'User')],
            }),
          ],
        }),
      ],
    };

    const errors = validateNToNCompleteness(ast);

    expect(errors).toHaveLength(0);
  });

  test('should return 0 errors for model with forward relation only (no reverse)', () => {
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
            createASTField({ name: 'id', type: 'record' }),
            createASTField({ name: 'authorId', type: 'record' }),
            createASTField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('field', 'authorId'), createDecorator('model', 'User')],
            }),
          ],
        }),
        createASTModel({
          name: 'User',
          fields: [createASTField({ name: 'id', type: 'record' }), createASTField({ name: 'name', type: 'string' })],
        }),
      ],
    };

    const errors = validateNToNCompleteness(ast);

    expect(errors).toHaveLength(0);
  });

  test('should return 0 errors for model with Record[] but no Relation[]', () => {
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
            createASTField({ name: 'id', type: 'record' }),
            createASTField({
              name: 'groupIds',
              type: 'record',
              isArray: true,
              decorators: [createDecorator('field', 'groupIds')],
            }),
          ],
        }),
        createASTModel({
          name: 'Group',
          fields: [createASTField({ name: 'id', type: 'record' }), createASTField({ name: 'name', type: 'string' })],
        }),
      ],
    };

    const errors = validateNToNCompleteness(ast);

    expect(errors).toHaveLength(0);
  });
});
