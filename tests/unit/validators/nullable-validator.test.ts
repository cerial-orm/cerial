/**
 * Unit Tests: Nullable Validator
 *
 * Tests validation of @nullable decorator rules.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateNoOptionalTupleElements,
  validateNullableDecorator,
  validateNullableOnObjectFields,
  validateNullableOnTupleElements,
  validateTupleElementDecorators,
} from '../../../src/cli/validators/nullable-validator';
import type {
  ASTDecorator,
  ASTField,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  SchemaAST,
} from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

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

function createTuple(name: string, elements: ASTTupleElement[]): ASTTuple {
  return { name, elements, range };
}

function createAST(models: ASTModel[] = [], objects: ASTObject[] = [], tuples: ASTTuple[] = []): SchemaAST {
  return { source: '', models, objects, tuples, literals: [], enums: [] };
}

function dec(type: string, value?: unknown): ASTDecorator {
  return { type: type as ASTDecorator['type'], value, range };
}

describe('Nullable Validator', () => {
  describe('validateNullableDecorator (model fields)', () => {
    test('should pass for @nullable on primitive string field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [createField({ name: 'bio', type: 'string', decorators: [dec('nullable')] })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on int field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [createField({ name: 'age', type: 'int', decorators: [dec('nullable')] })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on float field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [createField({ name: 'score', type: 'float', decorators: [dec('nullable')] })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on bool field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [createField({ name: 'active', type: 'bool', decorators: [dec('nullable')] })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on date field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [createField({ name: 'deletedAt', type: 'date', decorators: [dec('nullable')] })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on record field', () => {
      const ast = createAST([
        createModel({
          name: 'Post',
          fields: [createField({ name: 'authorId', type: 'record', decorators: [dec('nullable')] })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on email field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [createField({ name: 'backup', type: 'email', decorators: [dec('nullable')] })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable with @default(null)', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'bio',
              type: 'string',
              decorators: [dec('nullable'), dec('default', null)],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @nullable on optional field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'bio',
              type: 'string',
              isOptional: true,
              decorators: [dec('nullable')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @nullable on object-type field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'address',
              type: 'object',
              decorators: [dec('nullable')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@nullable is not allowed on object field');
    });

    test('should fail for @nullable on tuple-type field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'coords',
              type: 'tuple',
              decorators: [dec('nullable')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@nullable is not allowed on tuple field');
    });

    test('should fail for @nullable on relation field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'posts',
              type: 'relation',
              decorators: [dec('nullable'), dec('model', 'Post')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@nullable is not allowed on relation field');
    });

    test('should fail for @nullable on @id field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'id',
              type: 'record',
              decorators: [dec('nullable'), dec('id')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@nullable is not allowed on @id field');
    });

    test('should fail for @nullable on @now field', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'ts',
              type: 'date',
              decorators: [dec('nullable'), dec('now')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@nullable is not allowed on @now field');
    });

    test('should fail for @default(null) without @nullable', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'bio',
              type: 'string',
              decorators: [dec('default', null)],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@default(null) requires @nullable');
    });

    test('should allow @default with non-null value without @nullable', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'name',
              type: 'string',
              decorators: [dec('default', 'Guest')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });

    test('should collect multiple errors from multiple fields', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [
            createField({
              name: 'address',
              type: 'object',
              decorators: [dec('nullable')],
            }),
            createField({
              name: 'id',
              type: 'record',
              decorators: [dec('nullable'), dec('id')],
            }),
          ],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(2);
    });

    test('should pass for field without @nullable (no validation needed)', () => {
      const ast = createAST([
        createModel({
          name: 'User',
          fields: [createField({ name: 'name', type: 'string' })],
        }),
      ]);

      const errors = validateNullableDecorator(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateNullableOnObjectFields', () => {
    test('should pass for @nullable on primitive object sub-field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Address',
            fields: [createField({ name: 'zipCode', type: 'string', decorators: [dec('nullable')] })],
          }),
        ],
      );

      const errors = validateNullableOnObjectFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @nullable on nested object field in object', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Wrapper',
            fields: [createField({ name: 'inner', type: 'object', decorators: [dec('nullable')] })],
          }),
        ],
      );

      const errors = validateNullableOnObjectFields(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@nullable is not allowed on object field');
    });

    test('should fail for @default(null) without @nullable on object sub-field', () => {
      const ast = createAST(
        [],
        [
          createObject({
            name: 'Settings',
            fields: [
              createField({
                name: 'theme',
                type: 'string',
                decorators: [dec('default', null)],
              }),
            ],
          }),
        ],
      );

      const errors = validateNullableOnObjectFields(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@default(null) requires @nullable');
    });
  });

  describe('validateNullableOnTupleElements', () => {
    test('should pass for @nullable on primitive tuple element', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Coordinate', [
            { type: 'float', isOptional: false, decorators: [dec('nullable')] },
            { type: 'float', isOptional: false },
          ]),
        ],
      );

      const errors = validateNullableOnTupleElements(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @nullable on object-type tuple element', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Mixed', [
            { type: 'object', isOptional: false, objectName: 'Addr', decorators: [dec('nullable')] },
          ]),
        ],
      );

      const errors = validateNullableOnTupleElements(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@nullable is not allowed on object tuple element');
    });

    test('should pass for @nullable on tuple-type tuple element', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Nested', [
            { type: 'tuple', isOptional: false, tupleName: 'Inner', decorators: [dec('nullable')] },
          ]),
        ],
      );

      const errors = validateNullableOnTupleElements(ast);
      expect(errors).toHaveLength(0);
    });

    test('should use element name when available', () => {
      const ast = createAST(
        [],
        [],
        [createTuple('Point', [{ name: 'x', type: 'object', isOptional: false, decorators: [dec('nullable')] }])],
      );

      const errors = validateNullableOnTupleElements(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("'x'");
    });

    test('should use element[index] when no name', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Point', [
            { type: 'float', isOptional: false },
            { type: 'object', isOptional: false, decorators: [dec('nullable')] },
          ]),
        ],
      );

      const errors = validateNullableOnTupleElements(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("'element[1]'");
    });

    test('should skip elements without decorators', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Simple', [
            { type: 'float', isOptional: false },
            { type: 'float', isOptional: false },
          ]),
        ],
      );

      const errors = validateNullableOnTupleElements(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateNoOptionalTupleElements', () => {
    test('should fail for tuple element with isOptional: true', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Pair', [
            { type: 'float', isOptional: false },
            { type: 'float', isOptional: true },
          ]),
        ],
      );

      const errors = validateNoOptionalTupleElements(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Optional elements (?) are not allowed in tuples');
      expect(errors[0]!.message).toContain('Use @nullable instead');
    });

    test('should pass for @nullable element (isNullable: true, isOptional: false)', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Pair', [
            { type: 'float', isOptional: false },
            { type: 'float', isOptional: false, isNullable: true, decorators: [dec('nullable')] },
          ]),
        ],
      );

      const errors = validateNoOptionalTupleElements(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for element with no modifiers', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Pair', [
            { type: 'float', isOptional: false },
            { type: 'float', isOptional: false },
          ]),
        ],
      );

      const errors = validateNoOptionalTupleElements(ast);
      expect(errors).toHaveLength(0);
    });

    test('should include element name in error when available', () => {
      const ast = createAST([], [], [createTuple('Coord', [{ name: 'lat', type: 'float', isOptional: true }])]);

      const errors = validateNoOptionalTupleElements(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("'lat'");
      expect(errors[0]!.message).toContain('tuple Coord');
    });

    test('should use element[index] when no name', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Coord', [
            { type: 'float', isOptional: false },
            { type: 'float', isOptional: true },
          ]),
        ],
      );

      const errors = validateNoOptionalTupleElements(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("'element[1]'");
    });

    test('should collect errors from multiple optional elements', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Multi', [
            { type: 'string', isOptional: true },
            { type: 'int', isOptional: true },
            { type: 'float', isOptional: false },
          ]),
        ],
      );

      const errors = validateNoOptionalTupleElements(ast);
      expect(errors).toHaveLength(2);
    });

    test('should collect errors from multiple tuples', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('A', [{ type: 'float', isOptional: true }]),
          createTuple('B', [{ type: 'int', isOptional: true }]),
        ],
      );

      const errors = validateNoOptionalTupleElements(ast);
      expect(errors).toHaveLength(2);
    });
  });

  describe('validateTupleElementDecorators', () => {
    test('should pass for allowed decorators on tuple elements', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Timestamped', [
            { type: 'float', isOptional: false, decorators: [dec('nullable')] },
            { type: 'string', isOptional: false, decorators: [dec('default', 'x')] },
            { type: 'string', isOptional: false, decorators: [dec('defaultAlways', 'x')] },
            { type: 'date', isOptional: false, decorators: [dec('createdAt')] },
            { type: 'date', isOptional: false, decorators: [dec('updatedAt')] },
          ]),
        ],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for disallowed decorator on tuple element', () => {
      const ast = createAST(
        [],
        [],
        [createTuple('Bad', [{ type: 'string', isOptional: false, decorators: [dec('unique')] }])],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@unique is not allowed on tuple element');
    });

    test('should fail for @createdAt on non-date element', () => {
      const ast = createAST(
        [],
        [],
        [createTuple('Bad', [{ type: 'string', isOptional: false, decorators: [dec('createdAt')] }])],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Timestamp decorators');
      expect(errors[0]!.message).toContain('Date-type');
    });

    test('should fail for @updatedAt on non-date element', () => {
      const ast = createAST(
        [],
        [],
        [createTuple('Bad', [{ type: 'int', isOptional: false, decorators: [dec('updatedAt')] }])],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Timestamp decorators');
    });

    test('should fail for both @createdAt and @updatedAt on same element', () => {
      const ast = createAST(
        [],
        [],
        [createTuple('Bad', [{ type: 'date', isOptional: false, decorators: [dec('createdAt'), dec('updatedAt')] }])],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('cannot have both @createdAt and @updatedAt');
    });

    test('should fail for @default combined with timestamp decorator', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Bad', [
            { type: 'date', isOptional: false, decorators: [dec('default', 'now'), dec('createdAt')] },
          ]),
        ],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@default and timestamp decorators cannot be used together');
    });

    test('should fail for @default combined with @defaultAlways', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Bad', [
            { type: 'string', isOptional: false, decorators: [dec('default', 'a'), dec('defaultAlways', 'b')] },
          ]),
        ],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@default and @defaultAlways cannot be used together');
    });

    test('should fail for @default(null) without @nullable on tuple element', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Bad', [
            { type: 'string', isOptional: false, isNullable: false, decorators: [dec('default', null)] },
          ]),
        ],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@default(null) requires @nullable');
    });

    test('should pass for @default(null) with @nullable on tuple element', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('OK', [
            {
              type: 'string',
              isOptional: false,
              isNullable: true,
              decorators: [dec('default', null), dec('nullable')],
            },
          ]),
        ],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should skip elements without decorators', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Simple', [
            { type: 'float', isOptional: false },
            { type: 'float', isOptional: false },
          ]),
        ],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(0);
    });

    test('should collect errors from multiple elements', () => {
      const ast = createAST(
        [],
        [],
        [
          createTuple('Bad', [
            { type: 'string', isOptional: false, decorators: [dec('unique')] },
            { type: 'int', isOptional: false, decorators: [dec('createdAt')] },
          ]),
        ],
      );

      const errors = validateTupleElementDecorators(ast);
      expect(errors).toHaveLength(2);
    });
  });
});
