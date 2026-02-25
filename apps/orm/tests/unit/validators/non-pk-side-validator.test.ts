/**
 * Unit Tests: validateNonPKSide
 *
 * Tests validation of reverse (non-PK) relation fields.
 * A non-PK relation is a Relation field with @model(Target) but NO @field decorator.
 * The validator ensures that for each non-PK relation in model A pointing to model B,
 * model B has a corresponding PK side (Record + Relation @field) pointing back to A.
 */

import { describe, expect, test } from 'bun:test';
import { validateNonPKSide } from '../../../src/cli/validators/relation-validator';
import type { ASTDecorator, ASTField, ASTModel, SchemaAST, SchemaDecorator } from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function createDecorator(type: SchemaDecorator, value?: unknown): ASTDecorator {
  return { type, value, range };
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

describe('validateNonPKSide', () => {
  describe('positive cases (no errors)', () => {
    test('should pass when non-PK relation has matching PK side in target', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when forward relation (has @field) is present', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should skip non-relation fields', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'name',
              type: 'string',
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass with empty AST', () => {
      const ast = createAST([]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when non-PK relation has matching PK side with @key', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post'), createDecorator('key', 'userPosts')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [
                createDecorator('model', 'User'),
                createDecorator('field', 'authorId'),
                createDecorator('key', 'userPosts'),
              ],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass with multiple non-PK relations to different targets', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
            }),
            createField({
              name: 'comments',
              type: 'relation',
              decorators: [createDecorator('model', 'Comment')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
        createModel({
          name: 'Comment',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when non-PK relation is array type with matching PK side', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              isArray: true,
              decorators: [createDecorator('model', 'Post')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when non-PK relation is optional with matching PK side', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              isOptional: true,
              decorators: [createDecorator('model', 'Post')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('negative cases (errors)', () => {
    test('should fail when non-PK relation has no matching PK side in target', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'title',
              type: 'string',
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Reverse relation "posts"');
      expect(errors[0]!.message).toContain('requires PK side');
      expect(errors[0]!.message).toContain('Post');
      expect(errors[0]!.model).toBe('User');
      expect(errors[0]!.field).toBe('posts');
    });

    test('should fail when target has reverse relation but no forward relation back', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'Comment')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Reverse relation "posts"');
      expect(errors[0]!.model).toBe('User');
    });

    test('should pass when target has relation with @field decorator pointing back', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail when target has non-PK relation (no @field) pointing back', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
            }),
            createField({
              name: 'authoredPostIds',
              type: 'record',
              isArray: true,
            }),
            createField({
              name: 'authoredPosts',
              type: 'relation',
              isArray: true,
              decorators: [createDecorator('model', 'Post'), createDecorator('field', 'authoredPostIds')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Reverse relation "posts"');
    });

    test('should fail when @key on non-PK side does not match PK side @key', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post'), createDecorator('key', 'userPosts')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [
                createDecorator('model', 'User'),
                createDecorator('field', 'authorId'),
                createDecorator('key', 'postAuthor'),
              ],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Reverse relation "posts"');
      expect(errors[0]!.message).toContain('with @key(userPosts)');
    });

    test('should fail when non-PK side has @key but PK side does not', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post'), createDecorator('key', 'userPosts')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('with @key(userPosts)');
    });

    test('should fail when multiple non-PK relations exist but only some have PK sides', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
            }),
            createField({
              name: 'comments',
              type: 'relation',
              decorators: [createDecorator('model', 'Comment')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
            }),
            createField({
              name: 'author',
              type: 'relation',
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'authorId')],
            }),
          ],
        }),
        createModel({
          name: 'Comment',
          fields: [
            createField({
              name: 'text',
              type: 'string',
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.field).toBe('comments');
      expect(errors[0]!.model).toBe('User');
    });

    test('should fail with correct error message including @key info', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post'), createDecorator('key', 'myKey')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'title',
              type: 'string',
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('with @key(myKey)');
      expect(errors[0]!.message).toContain('requires PK side');
    });

    test('should report correct line number in error', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
              range: {
                start: { line: 42, column: 1, offset: 0 },
                end: { line: 42, column: 1, offset: 0 },
              },
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.line).toBe(42);
    });
  });

  describe('edge cases', () => {
    test('should handle relation with missing @model decorator gracefully', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should handle target model that does not exist', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'NonExistentModel')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should handle self-referential non-PK relation with matching PK side', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'friends',
              type: 'relation',
              decorators: [createDecorator('model', 'User')],
            }),
            createField({
              name: 'friendIds',
              type: 'record',
              isArray: true,
            }),
            createField({
              name: 'friendOf',
              type: 'relation',
              isArray: true,
              decorators: [createDecorator('model', 'User'), createDecorator('field', 'friendIds')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });

    test('should handle self-referential non-PK relation without matching PK side', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
            }),
            createField({
              name: 'friends',
              type: 'relation',
              decorators: [createDecorator('model', 'User')],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Reverse relation "friends"');
      expect(errors[0]!.message).toContain('User');
    });

    test('should handle multiple errors across different models', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', 'Post')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'comments',
              type: 'relation',
              decorators: [createDecorator('model', 'Comment')],
            }),
          ],
        }),
        createModel({
          name: 'Comment',
          fields: [],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0]!.model).toBe('User');
      expect(errors[1]!.model).toBe('Post');
    });

    test('should handle relation with @model but no value', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [createDecorator('model', undefined)],
            }),
          ],
        }),
      ]);

      const errors = validateNonPKSide(ast);
      expect(errors).toHaveLength(0);
    });
  });
});
