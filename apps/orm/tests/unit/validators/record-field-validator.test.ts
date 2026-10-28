/**
 * Unit Tests: Record Field Validator
 *
 * Tests validation of Record fields and their paired Relation fields.
 * Note: This validator currently has no error-emitting paths and documents
 * the current behavior as regression guards.
 */

import { describe, expect, test } from 'bun:test';
import { validateRecordFields } from '../../../src/cli/validators/schema-validator';
import type { ASTDecorator, ASTModel, SchemaAST } from '../../../src/types';
import { createField, createModel, idDecorator, range } from './helpers';
import { createDslOrigin } from '../../../src/parser';

function fieldDecorator(fieldName: string): ASTDecorator {
  return { type: 'field', value: fieldName, range, origin: createDslOrigin(range) };
}

function modelDecorator(modelName: string): ASTDecorator {
  return { type: 'model', value: modelName, range, origin: createDslOrigin(range) };
}

function createAST(models: ASTModel[] = []): SchemaAST {
  return { source: '', models, objects: [], tuples: [], literals: [], enums: [] };
}

describe('Record Field Validator', () => {
  describe('validateRecordFields', () => {
    test('should pass for Record field with @id decorator', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for Record field with paired Relation via @field', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
              decorators: [],
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [fieldDecorator('authorId'), modelDecorator('User')],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for Record field without paired Relation (currently no error)', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should skip non-Record fields', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'name',
              type: 'string',
              decorators: [],
            }),
            createField({
              name: 'age',
              type: 'int',
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for Record[] array field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'postIds',
              type: 'record',
              isArray: true,
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for empty AST', () => {
      const ast = createAST([]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for model with no fields', () => {
      const ast = createAST([
        createModel({
          name: 'Empty',
          fields: [],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for multiple models with various Record field configurations', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'name',
              type: 'string',
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'authorId',
              type: 'record',
              decorators: [],
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [fieldDecorator('authorId'), modelDecorator('User')],
            }),
          ],
        }),
        createModel({
          name: 'Comment',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'postIds',
              type: 'record',
              isArray: true,
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for Record field with multiple decorators (non-@id)', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
              decorators: [
                { type: 'unique', range, origin: createDslOrigin(range) },
                { type: 'index', range, origin: createDslOrigin(range) },
              ],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for optional Record field', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'editorId',
              type: 'record',
              isOptional: true,
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateRecordFields(ast);
      expect(errors).toHaveLength(0);
    });
  });
});
