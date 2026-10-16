/**
 * Unit Tests: Record Decorator Validator
 *
 * Tests validation of Record field decorators.
 * Record fields cannot have relation decorators (@field, @model, @onDelete, @key).
 */

import { describe, expect, test } from 'bun:test';
import { validateRecordDecorators } from '../../../src/cli/validators/relation-validator';
import type { SchemaAST } from '../../../src/types';
import { createASTField, createASTModel, createDecorator } from './helpers';

describe('validateRecordDecorators', () => {
  test('should pass for Record without relation decorators', () => {
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
              decorators: [],
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

  test('should fail for Record with @onDelete decorator', () => {
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
              decorators: [createDecorator('onDelete', 'Cascade')],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('@onDelete'))).toBe(true);
    expect(errors[0]?.field).toBe('authorId');
  });

  test('should fail for Record with @key decorator', () => {
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
              decorators: [createDecorator('key', 'k1')],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('@key'))).toBe(true);
    expect(errors[0]?.field).toBe('authorId');
  });

  test('should fail for Record with multiple relation decorators', () => {
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
              decorators: [
                createDecorator('model', 'User'),
                createDecorator('field', 'someField'),
                createDecorator('key', 'k1'),
              ],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

    expect(errors.length).toBe(3);
    expect(errors.some((e) => e.message.includes('@model'))).toBe(true);
    expect(errors.some((e) => e.message.includes('@field'))).toBe(true);
    expect(errors.some((e) => e.message.includes('@key'))).toBe(true);
  });

  test('should pass for Record with @id decorator only', () => {
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
              name: 'id',
              type: 'record',
              decorators: [createDecorator('id')],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

    expect(errors).toHaveLength(0);
  });

  test('should pass for Record with @unique decorator', () => {
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
              name: 'externalId',
              type: 'record',
              decorators: [createDecorator('unique')],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

    expect(errors).toHaveLength(0);
  });

  test('should pass for non-Record field with relation decorators', () => {
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
              decorators: [createDecorator('field', 'authorId'), createDecorator('model', 'User')],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

    expect(errors).toHaveLength(0);
  });

  test('should pass for string field with relation decorators', () => {
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
              name: 'someString',
              type: 'string',
              decorators: [createDecorator('field', 'someField')],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

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

    const errors = validateRecordDecorators(ast);

    expect(errors).toHaveLength(0);
  });

  test('should pass for multiple models with only one having problematic Record field', () => {
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
              name: 'id',
              type: 'record',
              decorators: [createDecorator('id')],
            }),
          ],
        }),
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

    expect(errors.length).toBe(1);
    expect(errors[0]?.model).toBe('Post');
    expect(errors[0]?.field).toBe('authorId');
    expect(errors[0]?.message.includes('@model')).toBe(true);
  });

  test('should report correct model and field names in error', () => {
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
            createASTField({
              name: 'postId',
              type: 'record',
              decorators: [createDecorator('onDelete', 'SetNull')],
            }),
          ],
        }),
      ],
    };

    const errors = validateRecordDecorators(ast);

    expect(errors.length).toBe(1);
    expect(errors[0]?.model).toBe('Comment');
    expect(errors[0]?.field).toBe('postId');
  });
});
