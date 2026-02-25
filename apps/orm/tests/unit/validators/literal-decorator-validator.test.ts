/**
 * Unit Tests: Literal Decorator Validator
 *
 * Tests validation of disallowed decorators on literal-typed fields.
 */

import { describe, expect, test } from 'bun:test';
import { validateLiteralDecorators } from '../../../src/cli/validators/schema-validator';
import type { ASTDecorator, ASTField, ASTModel, ASTObject, SchemaAST, SchemaDecorator } from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function createDecorator(type: SchemaDecorator): ASTDecorator {
  return { type, range };
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

function createObject(overrides: Partial<ASTObject> = {}): ASTObject {
  return {
    name: 'TestObject',
    fields: [],
    range,
    ...overrides,
  };
}

function createAST(models: ASTModel[] = [], objects: ASTObject[] = []): SchemaAST {
  return { source: '', models, objects, tuples: [], literals: [], enums: [] };
}

describe('Literal Decorator Validator', () => {
  describe('validateLiteralDecorators (model fields - disallowed decorators)', () => {
    test('should fail for @flexible on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'status',
              type: 'literal',
              literalName: 'Status',
              decorators: [createDecorator('flexible')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@flexible is only allowed on object-type fields');
      expect(errors[0]!.message).toContain("'status'");
      expect(errors[0]!.message).toContain('User');
      expect(errors[0]!.field).toBe('status');
      expect(errors[0]!.model).toBe('User');
    });

    test('should fail for @now on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'Event',
          fields: [
            createField({
              name: 'eventType',
              type: 'literal',
              literalName: 'EventType',
              decorators: [createDecorator('now')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('timestamp decorators are only allowed on Date fields');
      expect(errors[0]!.message).toContain("'eventType'");
    });

    test('should fail for @createdAt on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'category',
              type: 'literal',
              literalName: 'Category',
              decorators: [createDecorator('createdAt')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('timestamp decorators are only allowed on Date fields');
      expect(errors[0]!.message).toContain("'category'");
    });

    test('should fail for @updatedAt on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'Article',
          fields: [
            createField({
              name: 'priority',
              type: 'literal',
              literalName: 'Priority',
              decorators: [createDecorator('updatedAt')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('timestamp decorators are only allowed on Date fields');
      expect(errors[0]!.message).toContain("'priority'");
    });

    test('should fail for @id on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'Task',
          fields: [
            createField({
              name: 'status',
              type: 'literal',
              literalName: 'Status',
              decorators: [createDecorator('id')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@id is only allowed on Record fields');
      expect(errors[0]!.message).toContain("'status'");
    });

    test('should fail for @field on literal model field (relation decorator)', () => {
      const ast = createAST([
        createModel({
          name: 'Comment',
          fields: [
            createField({
              name: 'sentiment',
              type: 'literal',
              literalName: 'Sentiment',
              decorators: [createDecorator('field')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@field is a relation decorator');
      expect(errors[0]!.message).toContain("'sentiment'");
    });

    test('should fail for @model on literal model field (relation decorator)', () => {
      const ast = createAST([
        createModel({
          name: 'Review',
          fields: [
            createField({
              name: 'rating',
              type: 'literal',
              literalName: 'Rating',
              decorators: [createDecorator('model')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@model is a relation decorator');
      expect(errors[0]!.message).toContain("'rating'");
    });

    test('should fail for @onDelete on literal model field (relation decorator)', () => {
      const ast = createAST([
        createModel({
          name: 'Order',
          fields: [
            createField({
              name: 'status',
              type: 'literal',
              literalName: 'OrderStatus',
              decorators: [createDecorator('onDelete')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@onDelete is a relation decorator');
      expect(errors[0]!.message).toContain("'status'");
    });

    test('should fail for @key on literal model field (relation decorator)', () => {
      const ast = createAST([
        createModel({
          name: 'Document',
          fields: [
            createField({
              name: 'docType',
              type: 'literal',
              literalName: 'DocType',
              decorators: [createDecorator('key')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@key is a relation decorator');
      expect(errors[0]!.message).toContain("'docType'");
    });

    test('should fail with multiple disallowed decorators on same literal field', () => {
      const ast = createAST([
        createModel({
          name: 'Item',
          fields: [
            createField({
              name: 'type',
              type: 'literal',
              literalName: 'ItemType',
              decorators: [createDecorator('flexible'), createDecorator('id'), createDecorator('field')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(3);
      expect(errors.some((e) => e.message.includes('@flexible'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@id'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@field'))).toBe(true);
    });

    test('should fail for @flexible on literal array field', () => {
      const ast = createAST([
        createModel({
          name: 'Config',
          fields: [
            createField({
              name: 'options',
              type: 'literal',
              literalName: 'Option',
              isArray: true,
              decorators: [createDecorator('flexible')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@flexible is only allowed on object-type fields');
    });

    test('should fail for @createdAt on optional literal field', () => {
      const ast = createAST([
        createModel({
          name: 'Log',
          fields: [
            createField({
              name: 'level',
              type: 'literal',
              literalName: 'LogLevel',
              isOptional: true,
              decorators: [createDecorator('createdAt')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('timestamp decorators are only allowed on Date fields');
    });
  });

  describe('validateLiteralDecorators (object fields - disallowed decorators)', () => {
    test('should fail for @flexible on literal object field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Profile',
            fields: [
              createField({
                name: 'theme',
                type: 'literal',
                literalName: 'Theme',
                decorators: [createDecorator('flexible')],
              }),
            ],
          }),
        ],
      );

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@flexible is only allowed on object-type fields');
      expect(errors[0]!.message).toContain("'theme'");
      expect(errors[0]!.message).toContain('Profile');
    });

    test('should fail for @id on literal object field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Metadata',
            fields: [
              createField({
                name: 'type',
                type: 'literal',
                literalName: 'MetaType',
                decorators: [createDecorator('id')],
              }),
            ],
          }),
        ],
      );

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@id is only allowed on Record fields');
      expect(errors[0]!.message).toContain("'type'");
      expect(errors[0]!.message).toContain('Metadata');
    });

    test('should fail for @model on literal object field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Settings',
            fields: [
              createField({
                name: 'mode',
                type: 'literal',
                literalName: 'Mode',
                decorators: [createDecorator('model')],
              }),
            ],
          }),
        ],
      );

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@model is a relation decorator');
      expect(errors[0]!.message).toContain("'mode'");
    });

    test('should fail with multiple disallowed decorators on literal object field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Config',
            fields: [
              createField({
                name: 'state',
                type: 'literal',
                literalName: 'State',
                decorators: [createDecorator('flexible'), createDecorator('createdAt'), createDecorator('onDelete')],
              }),
            ],
          }),
        ],
      );

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(3);
      expect(errors.some((e) => e.message.includes('@flexible'))).toBe(true);
      expect(errors.some((e) => e.message.includes('timestamp decorators'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@onDelete'))).toBe(true);
    });
  });

  describe('validateLiteralDecorators (allowed decorators)', () => {
    test('should pass for @default on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'role',
              type: 'literal',
              literalName: 'Role',
              decorators: [createDecorator('default')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'category',
              type: 'literal',
              literalName: 'Category',
              decorators: [createDecorator('nullable')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @unique on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'Item',
          fields: [
            createField({
              name: 'code',
              type: 'literal',
              literalName: 'Code',
              decorators: [createDecorator('unique')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly on literal model field', () => {
      const ast = createAST([
        createModel({
          name: 'Document',
          fields: [
            createField({
              name: 'status',
              type: 'literal',
              literalName: 'Status',
              decorators: [createDecorator('readonly')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for multiple allowed decorators on literal field', () => {
      const ast = createAST([
        createModel({
          name: 'Task',
          fields: [
            createField({
              name: 'priority',
              type: 'literal',
              literalName: 'Priority',
              decorators: [createDecorator('default'), createDecorator('nullable'), createDecorator('unique')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @default on literal object field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Settings',
            fields: [
              createField({
                name: 'theme',
                type: 'literal',
                literalName: 'Theme',
                decorators: [createDecorator('default')],
              }),
            ],
          }),
        ],
      );

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on literal object field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Preferences',
            fields: [
              createField({
                name: 'mode',
                type: 'literal',
                literalName: 'Mode',
                decorators: [createDecorator('nullable')],
              }),
            ],
          }),
        ],
      );

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateLiteralDecorators (non-literal fields)', () => {
    test('should pass for any decorator on non-literal string field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'name',
              type: 'string',
              decorators: [createDecorator('flexible'), createDecorator('id'), createDecorator('field')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for any decorator on non-literal record field', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'authorId',
              type: 'record',
              decorators: [createDecorator('flexible'), createDecorator('createdAt')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for any decorator on non-literal object field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'address',
              type: 'object',
              objectName: 'Address',
              decorators: [createDecorator('id'), createDecorator('field'), createDecorator('model')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateLiteralDecorators (edge cases)', () => {
    test('should pass for empty AST', () => {
      const ast = createAST();

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for model with no fields', () => {
      const ast = createAST([createModel({ name: 'Empty', fields: [] })]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for object with no fields', () => {
      const ast = createAST([], [createObject({ name: 'Empty', fields: [] })]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for literal field with no decorators', () => {
      const ast = createAST([
        createModel({
          name: 'Item',
          fields: [
            createField({
              name: 'type',
              type: 'literal',
              literalName: 'ItemType',
              decorators: [],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should handle multiple models with mixed literal and non-literal fields', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [createDecorator('id')],
            }),
            createField({
              name: 'role',
              type: 'literal',
              literalName: 'Role',
              decorators: [createDecorator('default')],
            }),
            createField({
              name: 'status',
              type: 'literal',
              literalName: 'Status',
              decorators: [createDecorator('flexible')],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'title',
              type: 'string',
              decorators: [createDecorator('id')],
            }),
            createField({
              name: 'category',
              type: 'literal',
              literalName: 'Category',
              decorators: [createDecorator('createdAt')],
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(2);
      expect(errors.some((e) => e.field === 'status' && e.model === 'User')).toBe(true);
      expect(errors.some((e) => e.field === 'category' && e.model === 'Post')).toBe(true);
    });

    test('should handle multiple objects with literal fields', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Profile',
            fields: [
              createField({
                name: 'theme',
                type: 'literal',
                literalName: 'Theme',
                decorators: [createDecorator('id')],
              }),
            ],
          }),
          createObject({
            name: 'Settings',
            fields: [
              createField({
                name: 'mode',
                type: 'literal',
                literalName: 'Mode',
                decorators: [createDecorator('default')],
              }),
            ],
          }),
        ],
      );

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Profile');
      expect(errors[0]!.message).toContain('@id');
    });

    test('should report correct line numbers for errors', () => {
      const customRange = {
        start: { line: 42, column: 5, offset: 100 },
        end: { line: 42, column: 20, offset: 115 },
      };

      const ast = createAST([
        createModel({
          name: 'Test',
          fields: [
            createField({
              name: 'field',
              type: 'literal',
              literalName: 'Lit',
              decorators: [createDecorator('flexible')],
              range: customRange,
            }),
          ],
        }),
      ]);

      const errors = validateLiteralDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.line).toBe(42);
    });
  });
});
