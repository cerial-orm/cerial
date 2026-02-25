/**
 * Unit Tests: Array Decorator Validator
 *
 * Tests validation of @distinct and @sort decorators on array fields.
 */

import { describe, expect, test } from 'bun:test';
import { validateArrayDecorators } from '../../../src/cli/validators/schema-validator';
import type { ASTDecorator, ASTField, ASTModel, SchemaAST } from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function distinctDecorator(): ASTDecorator {
  return { type: 'distinct', range };
}

function sortDecorator(): ASTDecorator {
  return { type: 'sort', range };
}

function fieldDecorator(value: string): ASTDecorator {
  return { type: 'field', value, range };
}

function idDecorator(): ASTDecorator {
  return { type: 'id', range };
}

function createField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range,
    ...overrides,
  };
}

function createModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range,
    ...overrides,
  };
}

function createAST(models: ASTModel[] = []): SchemaAST {
  return { source: '', models, objects: [], tuples: [], literals: [], enums: [] };
}

describe('Array Decorator Validator', () => {
  describe('validateArrayDecorators (negative tests)', () => {
    test('should fail when @distinct is used on non-array String field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'name',
              type: 'string',
              isArray: false,
              decorators: [distinctDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('@distinct can only be used on array fields');
      expect(errors[0]!.field).toBe('name');
      expect(errors[0]!.model).toBe('TestModel');
    });

    test('should fail when @sort is used on non-array Int field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'count',
              type: 'int',
              isArray: false,
              decorators: [sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('@sort can only be used on array fields');
      expect(errors[0]!.field).toBe('count');
      expect(errors[0]!.model).toBe('TestModel');
    });

    test('should fail when @distinct is used on Relation[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'comments',
              type: 'relation',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe(
        '@distinct cannot be used on Relation[] fields (virtual, not stored in database)',
      );
      expect(errors[0]!.field).toBe('comments');
      expect(errors[0]!.model).toBe('TestModel');
    });

    test('should fail when @sort is used on Relation[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'posts',
              type: 'relation',
              isArray: true,
              decorators: [sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('@sort cannot be used on Relation[] fields (virtual, not stored in database)');
      expect(errors[0]!.field).toBe('posts');
      expect(errors[0]!.model).toBe('TestModel');
    });

    test('should fail when @distinct is used on Record[] paired with Relation', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'authorIds',
              type: 'record',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
            createField({
              name: 'authors',
              type: 'relation',
              isArray: true,
              decorators: [fieldDecorator('authorIds')],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe(
        '@distinct cannot be used on Record[] fields paired with a Relation (already has implicit distinct)',
      );
      expect(errors[0]!.field).toBe('authorIds');
      expect(errors[0]!.model).toBe('Post');
    });

    test('should fail when @sort is used on Record[] paired with Relation', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'tagIds',
              type: 'record',
              isArray: true,
              decorators: [sortDecorator()],
            }),
            createField({
              name: 'tags',
              type: 'relation',
              isArray: true,
              decorators: [fieldDecorator('tagIds')],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('@sort cannot be used on Record[] fields paired with a Relation');
      expect(errors[0]!.field).toBe('tagIds');
      expect(errors[0]!.model).toBe('Post');
    });

    test('should fail with both @distinct and @sort on non-array field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'status',
              type: 'string',
              isArray: false,
              decorators: [distinctDecorator(), sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0]!.message).toBe('@distinct can only be used on array fields');
      expect(errors[1]!.message).toBe('@sort can only be used on array fields');
    });

    test('should fail with both @distinct and @sort on Relation[]', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'items',
              type: 'relation',
              isArray: true,
              decorators: [distinctDecorator(), sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0]!.message).toContain('@distinct cannot be used on Relation[]');
      expect(errors[1]!.message).toContain('@sort cannot be used on Relation[]');
    });
  });

  describe('validateArrayDecorators (positive tests)', () => {
    test('should pass for @distinct on String[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @sort on Int[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'scores',
              type: 'int',
              isArray: true,
              decorators: [sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @distinct and @sort on String[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'keywords',
              type: 'string',
              isArray: true,
              decorators: [distinctDecorator(), sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @distinct on standalone Record[] (no paired Relation)', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'relatedIds',
              type: 'record',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @sort on standalone Record[] (no paired Relation)', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'sortedIds',
              type: 'record',
              isArray: true,
              decorators: [sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @distinct on Float[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'ratings',
              type: 'float',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @sort on Date[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'timestamps',
              type: 'date',
              isArray: true,
              decorators: [sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when no array decorators are used', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({ name: 'name', type: 'string' }),
            createField({ name: 'age', type: 'int' }),
            createField({ name: 'tags', type: 'string', isArray: true }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for empty AST', () => {
      const ast = createAST([]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for model with no fields', () => {
      const ast = createAST([createModel({ fields: [] })]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for multiple models with valid decorators', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'scores',
              type: 'int',
              isArray: true,
              decorators: [sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for Record[] with Relation but no array decorators', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'authorIds',
              type: 'record',
              isArray: true,
              decorators: [],
            }),
            createField({
              name: 'authors',
              type: 'relation',
              isArray: true,
              decorators: [fieldDecorator('authorIds')],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateArrayDecorators (edge cases)', () => {
    test('should report correct line numbers in errors', () => {
      const customRange = {
        start: { line: 42, column: 5, offset: 100 },
        end: { line: 42, column: 20, offset: 115 },
      };

      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'invalid',
              type: 'string',
              isArray: false,
              decorators: [distinctDecorator()],
              range: customRange,
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.line).toBe(42);
    });

    test('should handle multiple fields with mixed valid/invalid decorators', () => {
      const ast = createAST([
        createModel({
          name: 'Mixed',
          fields: [
            createField({
              name: 'validArray',
              type: 'string',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
            createField({
              name: 'invalidNonArray',
              type: 'int',
              isArray: false,
              decorators: [sortDecorator()],
            }),
            createField({
              name: 'validNoDecorators',
              type: 'string',
              isArray: true,
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.field).toBe('invalidNonArray');
    });

    test('should validate across multiple models independently', () => {
      const ast = createAST([
        createModel({
          name: 'Model1',
          fields: [
            createField({
              name: 'field1',
              type: 'string',
              isArray: false,
              decorators: [distinctDecorator()],
            }),
          ],
        }),
        createModel({
          name: 'Model2',
          fields: [
            createField({
              name: 'field2',
              type: 'string',
              isArray: false,
              decorators: [sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0]!.model).toBe('Model1');
      expect(errors[1]!.model).toBe('Model2');
    });

    test('should handle Record[] with multiple Relation fields (only first match counts)', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [idDecorator()],
            }),
            createField({
              name: 'userIds',
              type: 'record',
              isArray: true,
              decorators: [distinctDecorator()],
            }),
            createField({
              name: 'users',
              type: 'relation',
              isArray: true,
              decorators: [fieldDecorator('userIds')],
            }),
            createField({
              name: 'otherRelation',
              type: 'relation',
              isArray: true,
              decorators: [fieldDecorator('someOtherId')],
            }),
          ],
        }),
      ]);

      const errors = validateArrayDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('paired with a Relation');
    });
  });
});
