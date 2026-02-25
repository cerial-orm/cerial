/**
 * Unit Tests: Set Decorator Validator
 *
 * Tests validation of @set decorator on model and object fields.
 */

import { describe, expect, test } from 'bun:test';
import { validateSetDecorator } from '../../../src/cli/validators/schema-validator';
import type { ASTDecorator, ASTField, ASTModel, ASTObject, SchemaAST } from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function setDecorator(): ASTDecorator {
  return { type: 'set', range };
}

function distinctDecorator(): ASTDecorator {
  return { type: 'distinct', range };
}

function sortDecorator(): ASTDecorator {
  return { type: 'sort', range };
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

describe('Set Decorator Validator', () => {
  describe('validateSetDecorator (negative tests - errors)', () => {
    test('should fail for @set on non-array String field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: false,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set can only be used on array fields');
      expect(errors[0]!.message).toContain("'tags'");
      expect(errors[0]!.message).toContain('TestModel');
    });

    test('should fail for @set on non-array Int field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'count',
              type: 'int',
              isArray: false,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set can only be used on array fields');
      expect(errors[0]!.message).toContain("'count'");
    });

    test('should fail for @set on Decimal[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'prices',
              type: 'decimal',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0]!.message).toContain('@set is not allowed on Decimal[] fields');
      expect(errors[0]!.message).toContain('SurrealDB set<decimal> has known issues');
      expect(errors[0]!.message).toContain("'prices'");
      expect(errors[1]!.message).toContain('@set is only allowed on primitive array fields');
    });

    test('should fail for @set on object[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'addresses',
              type: 'object',
              isArray: true,
              objectName: 'Address',
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set is only allowed on primitive array fields');
      expect(errors[0]!.message).toContain("'addresses'");
      expect(errors[0]!.message).toContain("type 'object[]'");
    });

    test('should fail for @set on tuple[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'coordinates',
              type: 'tuple',
              isArray: true,
              tupleName: 'Coordinate',
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set is only allowed on primitive array fields');
      expect(errors[0]!.message).toContain("'coordinates'");
      expect(errors[0]!.message).toContain("type 'tuple[]'");
    });

    test('should fail for @set on Record[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'userIds',
              type: 'record',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set is only allowed on primitive array fields');
      expect(errors[0]!.message).toContain("'userIds'");
      expect(errors[0]!.message).toContain("type 'record[]'");
    });

    test('should fail for @set and @distinct together', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: true,
              decorators: [setDecorator(), distinctDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set and @distinct cannot be used together');
      expect(errors[0]!.message).toContain("'tags'");
      expect(errors[0]!.message).toContain('Sets are inherently distinct');
    });

    test('should fail for @set and @sort together', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: true,
              decorators: [setDecorator(), sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set and @sort cannot be used together');
      expect(errors[0]!.message).toContain("'tags'");
      expect(errors[0]!.message).toContain('Sets are inherently sorted');
    });

    test('should fail for @set on object field with multiple errors', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'items',
              type: 'object',
              isArray: true,
              objectName: 'Item',
              decorators: [setDecorator(), distinctDecorator(), sortDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('primitive array fields'))).toBe(true);
    });
  });

  describe('validateSetDecorator (positive tests - no errors)', () => {
    test('should pass for @set on String[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Int[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'numbers',
              type: 'int',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Float[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'scores',
              type: 'float',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Bool[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'flags',
              type: 'bool',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Date[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'dates',
              type: 'date',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Uuid[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'ids',
              type: 'uuid',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Duration[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'durations',
              type: 'duration',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Number[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'values',
              type: 'number',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Bytes[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'data',
              type: 'bytes',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Geometry[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'shapes',
              type: 'geometry',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Any[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'mixed',
              type: 'any',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on Email[] field', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'emails',
              type: 'email',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass when no @set is used', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({ name: 'name', type: 'string' }),
            createField({ name: 'age', type: 'int' }),
            createField({ name: 'tags', type: 'string', isArray: true }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for empty AST', () => {
      const ast = createAST();

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @set on String[] field in object', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'TestObject',
            fields: [
              createField({
                name: 'tags',
                type: 'string',
                isArray: true,
                decorators: [setDecorator()],
              }),
            ],
          }),
        ],
      );

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @set on non-array field in object', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'TestObject',
            fields: [
              createField({
                name: 'tag',
                type: 'string',
                isArray: false,
                decorators: [setDecorator()],
              }),
            ],
          }),
        ],
      );

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@set can only be used on array fields');
      expect(errors[0]!.message).toContain('object TestObject');
    });

    test('should pass for multiple models with @set on valid fields', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
        createModel({
          name: 'Post',
          fields: [
            createField({
              name: 'categories',
              type: 'string',
              isArray: true,
              decorators: [setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for mixed models and objects with @set', () => {
      const ast = createAST(
        [
          createModel({
            name: 'User',
            fields: [
              createField({
                name: 'tags',
                type: 'string',
                isArray: true,
                decorators: [setDecorator()],
              }),
            ],
          }),
        ],
        [
          createObject({
            name: 'Profile',
            fields: [
              createField({
                name: 'skills',
                type: 'string',
                isArray: true,
                decorators: [setDecorator()],
              }),
            ],
          }),
        ],
      );

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateSetDecorator (edge cases)', () => {
    test('should report correct line number for error', () => {
      const customRange = {
        start: { line: 42, column: 5, offset: 100 },
        end: { line: 42, column: 10, offset: 105 },
      };

      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: false,
              decorators: [{ type: 'set', range: customRange }],
              range: customRange,
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.line).toBe(42);
    });

    test('should handle field with multiple decorators including @set', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'tags',
              type: 'string',
              isArray: true,
              decorators: [{ type: 'default', range }, setDecorator(), { type: 'readonly', range }],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @set on Decimal[] even with other decorators', () => {
      const ast = createAST([
        createModel({
          fields: [
            createField({
              name: 'prices',
              type: 'decimal',
              isArray: true,
              decorators: [{ type: 'default', range }, setDecorator()],
            }),
          ],
        }),
      ]);

      const errors = validateSetDecorator(ast);
      expect(errors).toHaveLength(2);
      expect(errors[0]!.message).toContain('Decimal[]');
      expect(errors[1]!.message).toContain('primitive array fields');
    });
  });
});
