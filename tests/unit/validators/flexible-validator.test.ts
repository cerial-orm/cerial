/**
 * Unit Tests: Flexible Validator
 *
 * Tests validation of @flexible decorator on model and object fields.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateFlexibleDecorator,
  validateObjectFields,
  validateSchema,
} from '../../../src/cli/validators/schema-validator';
import type { ASTDecorator, ASTField, ASTModel, ASTObject, SchemaAST } from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function flexDecorator(): ASTDecorator {
  return { type: 'flexible', range };
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

describe('Flexible Validator', () => {
  describe('validateFlexibleDecorator (model fields)', () => {
    test('should pass for @flexible on object-typed fields', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'address',
              type: 'object',
              objectName: 'Address',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @flexible on String field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'name',
              type: 'string',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@flexible can only be used on fields with an object type');
      expect(errors[0]!.message).toContain("'name'");
    });

    test('should fail for @flexible on Int field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'count',
              type: 'int',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("type 'int'");
    });

    test('should fail for @flexible on Record field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'userId',
              type: 'record',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("type 'record'");
    });

    test('should fail for @flexible on Relation field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'profile',
              type: 'relation',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("type 'relation'");
    });

    test('should fail for @flexible on Bool field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'active',
              type: 'bool',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(1);
    });

    test('should pass when no @flexible is used', () => {
      const ast = createAST([
        createModel({
          fields: [createField({ name: 'name', type: 'string' }), createField({ name: 'age', type: 'int' })],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @flexible on array object field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'addresses',
              type: 'object',
              isArray: true,
              objectName: 'Address',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @flexible on optional object field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'shipping',
              type: 'object',
              isOptional: true,
              objectName: 'Address',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateFlexibleDecorator(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateObjectFields (object fields with @flexible)', () => {
    test('should allow @flexible on object-typed field within object definition', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Profile',
            fields: [
              createField({
                name: 'metadata',
                type: 'object',
                objectName: 'Meta',
                decorators: [flexDecorator()],
              }),
            ],
          }),
          createObject({ name: 'Meta', fields: [] }),
        ],
      );

      const errors = validateObjectFields(ast);
      const flexErrors = errors.filter((e) => e.message.includes('flexible'));
      expect(flexErrors).toHaveLength(0);
    });

    test('should reject @flexible on non-object field within object definition', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Profile',
            fields: [
              createField({
                name: 'name',
                type: 'string',
                decorators: [flexDecorator()],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const flexErrors = errors.filter((e) => e.message.includes('@flexible'));
      expect(flexErrors).toHaveLength(1);
      expect(flexErrors[0]!.message).toContain('@flexible can only be used on fields with an object type');
    });
  });

  describe('validateSchema integration', () => {
    test('should pass full validation with @flexible on object field', () => {
      const ast = createAST(
        [
          createModel({
            name: 'User',
            fields: [
              createField({
                name: 'id',
                type: 'record',
                decorators: [{ type: 'id', range }],
              }),
              createField({
                name: 'address',
                type: 'object',
                objectName: 'Address',
                decorators: [flexDecorator()],
              }),
            ],
          }),
        ],
        [
          createObject({
            name: 'Address',
            fields: [createField({ name: 'street', type: 'string' })],
          }),
        ],
      );

      const result = validateSchema(ast);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail full validation with @flexible on String field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [{ type: 'id', range }],
            }),
            createField({
              name: 'name',
              type: 'string',
              decorators: [flexDecorator()],
            }),
          ],
        }),
      ]);

      const result = validateSchema(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('@flexible'))).toBe(true);
    });
  });
});
