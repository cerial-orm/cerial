/**
 * Unit Tests: Readonly Validator
 *
 * Tests validation of @readonly decorator on model and object fields.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateReadonlyDecorator,
  validateObjectFields,
  validateSchema,
} from '../../../src/cli/validators/schema-validator';
import type { ASTDecorator, ASTField, ASTModel, ASTObject, SchemaAST } from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function readonlyDecorator(): ASTDecorator {
  return { type: 'readonly', range };
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
  return { source: '', models, objects, tuples: [], literals: [] };
}

describe('Readonly Validator', () => {
  describe('validateReadonlyDecorator (model fields)', () => {
    test('should pass for @readonly on String field', () => {
      const ast = createAST([
        createModel({
          fields: [createField({ name: 'code', type: 'string', decorators: [readonlyDecorator()] })],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly on Int field', () => {
      const ast = createAST([
        createModel({
          fields: [createField({ name: 'score', type: 'int', decorators: [readonlyDecorator()] })],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly on optional field', () => {
      const ast = createAST([
        createModel({
          fields: [createField({ name: 'note', type: 'string', isOptional: true, decorators: [readonlyDecorator()] })],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly on Record field', () => {
      const ast = createAST([
        createModel({
          fields: [createField({ name: 'authorId', type: 'record', decorators: [readonlyDecorator()] })],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly on array field', () => {
      const ast = createAST([
        createModel({
          fields: [createField({ name: 'tags', type: 'string', isArray: true, decorators: [readonlyDecorator()] })],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly with @default', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'createdBy',
              type: 'string',
              decorators: [readonlyDecorator(), { type: 'default', value: 'system', range }],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly with @createdAt', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'lockedAt',
              type: 'date',
              decorators: [readonlyDecorator(), { type: 'createdAt', range }],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @readonly on object-typed field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'config',
              type: 'object',
              objectName: 'Config',
              decorators: [readonlyDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @readonly + @now', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'ts',
              type: 'date',
              decorators: [readonlyDecorator(), { type: 'now', range }],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@readonly and @now cannot be used together');
      expect(errors[0]!.message).toContain('COMPUTED');
    });

    test('should fail for @readonly + @defaultAlways', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'status',
              type: 'string',
              decorators: [readonlyDecorator(), { type: 'defaultAlways', value: 'active', range }],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@readonly and @defaultAlways cannot be used together');
      expect(errors[0]!.message).toContain('contradicts');
    });

    test('should fail for @readonly + @id', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [readonlyDecorator(), { type: 'id', range }],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@readonly is not allowed on @id field');
      expect(errors[0]!.message).toContain('already immutable');
    });

    test('should fail for @readonly on Relation field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'profile',
              type: 'relation',
              decorators: [readonlyDecorator(), { type: 'model', value: 'Profile', range }],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@readonly is not allowed on Relation field');
      expect(errors[0]!.message).toContain('virtual');
    });

    test('should pass when no @readonly is used', () => {
      const ast = createAST([
        createModel({
          fields: [createField({ name: 'name', type: 'string' }), createField({ name: 'age', type: 'int' })],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should report multiple errors for multiple invalid @readonly fields', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [readonlyDecorator(), { type: 'id', range }],
            }),
            createField({
              name: 'ts',
              type: 'date',
              decorators: [readonlyDecorator(), { type: 'now', range }],
            }),
          ],
        }),
      ]);

      const errors = validateReadonlyDecorator(ast);
      expect(errors).toHaveLength(2);
    });
  });

  describe('validateObjectFields (object fields with @readonly)', () => {
    test('should allow @readonly on primitive field within object definition', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Config',
            fields: [createField({ name: 'key', type: 'string', decorators: [readonlyDecorator()] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const readonlyErrors = errors.filter((e) => e.message.includes('readonly'));
      expect(readonlyErrors).toHaveLength(0);
    });

    test('should allow @readonly on Int field within object definition', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Stats',
            fields: [createField({ name: 'version', type: 'int', decorators: [readonlyDecorator()] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const readonlyErrors = errors.filter((e) => e.message.includes('readonly'));
      expect(readonlyErrors).toHaveLength(0);
    });

    test('should fail for @readonly + @now within object', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Meta',
            fields: [
              createField({
                name: 'ts',
                type: 'date',
                decorators: [readonlyDecorator(), { type: 'now', range }],
              }),
            ],
          }),
        ],
      );

      // @now is already disallowed on object fields by a separate rule,
      // but @readonly+@now should also be flagged
      const errors = validateObjectFields(ast);
      const readonlyNowErrors = errors.filter((e) => e.message.includes('@readonly') && e.message.includes('@now'));
      expect(readonlyNowErrors).toHaveLength(1);
    });

    test('should fail for @readonly + @defaultAlways within object', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Meta',
            fields: [
              createField({
                name: 'status',
                type: 'string',
                decorators: [readonlyDecorator(), { type: 'defaultAlways', value: 'active', range }],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const readonlyDAErrors = errors.filter(
        (e) => e.message.includes('@readonly') && e.message.includes('@defaultAlways'),
      );
      expect(readonlyDAErrors).toHaveLength(1);
    });

    test('should allow @readonly + @default within object', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Config',
            fields: [
              createField({
                name: 'version',
                type: 'int',
                decorators: [readonlyDecorator(), { type: 'default', value: 1, range }],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const readonlyErrors = errors.filter((e) => e.message.includes('@readonly'));
      expect(readonlyErrors).toHaveLength(0);
    });

    test('should allow @readonly + @createdAt within object', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Audit',
            fields: [
              createField({
                name: 'frozenAt',
                type: 'date',
                decorators: [readonlyDecorator(), { type: 'createdAt', range }],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const readonlyErrors = errors.filter((e) => e.message.includes('@readonly'));
      expect(readonlyErrors).toHaveLength(0);
    });
  });

  describe('validateSchema integration', () => {
    test('should pass full validation with @readonly on model field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({ name: 'id', type: 'record', decorators: [{ type: 'id', range }] }),
            createField({ name: 'code', type: 'string', decorators: [readonlyDecorator()] }),
          ],
        }),
      ]);

      const result = validateSchema(ast);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail full validation with @readonly + @now', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({ name: 'id', type: 'record', decorators: [{ type: 'id', range }] }),
            createField({
              name: 'ts',
              type: 'date',
              decorators: [readonlyDecorator(), { type: 'now', range }],
            }),
          ],
        }),
      ]);

      const result = validateSchema(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('@readonly') && e.message.includes('@now'))).toBe(true);
    });

    test('should fail full validation with @readonly + @defaultAlways', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({ name: 'id', type: 'record', decorators: [{ type: 'id', range }] }),
            createField({
              name: 'status',
              type: 'string',
              decorators: [readonlyDecorator(), { type: 'defaultAlways', value: 'x', range }],
            }),
          ],
        }),
      ]);

      const result = validateSchema(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('@readonly') && e.message.includes('@defaultAlways'))).toBe(
        true,
      );
    });

    test('should pass full validation with @readonly on object sub-field', () => {
      const ast = createAST(
        [
          createModel({
            name: 'User',
            fields: [
              createField({ name: 'id', type: 'record', decorators: [{ type: 'id', range }] }),
              createField({ name: 'config', type: 'object', objectName: 'Config' }),
            ],
          }),
        ],
        [
          createObject({
            name: 'Config',
            fields: [
              createField({ name: 'key', type: 'string', decorators: [readonlyDecorator()] }),
              createField({ name: 'value', type: 'string' }),
            ],
          }),
        ],
      );

      const result = validateSchema(ast);
      expect(result.valid).toBe(true);
    });
  });
});
