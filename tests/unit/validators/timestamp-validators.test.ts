/**
 * Unit Tests: Timestamp Decorator Validators
 *
 * Tests validation rules for @now, @createdAt, and @updatedAt decorators
 * in schema-validator.ts.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateTimestampFields,
  validateObjectFields,
  validateSchema,
} from '../../../src/cli/validators/schema-validator';
import type { ASTDecorator, ASTField, ASTModel, ASTObject, SchemaAST } from '../../../src/types';

const dummyRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function makeDecorator(type: string, value?: unknown): ASTDecorator {
  return { type: type as ASTDecorator['type'], value, range: dummyRange };
}

function makeField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range: dummyRange,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range: dummyRange,
    ...overrides,
  };
}

function makeObject(overrides: Partial<ASTObject> = {}): ASTObject {
  return {
    name: 'TestObject',
    fields: [],
    range: dummyRange,
    ...overrides,
  };
}

function makeAST(models: ASTModel[] = [], objects: ASTObject[] = []): SchemaAST {
  return { source: '', models, objects };
}

describe('Timestamp Decorator Validators', () => {
  describe('validateTimestampFields (model fields)', () => {
    describe('@now on non-Date field → error', () => {
      test('should error for @now on String field', () => {
        const ast = makeAST([
          makeModel({
            name: 'User',
            fields: [makeField({ name: 'name', type: 'string', decorators: [makeDecorator('now')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain('@now');
        expect(errors[0]!.message).toContain('Date');
        expect(errors[0]!.message).toContain('string');
      });

      test('should error for @now on Int field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'count', type: 'int', decorators: [makeDecorator('now')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain('@now');
      });

      test('should error for @now on Bool field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'active', type: 'bool', decorators: [makeDecorator('now')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain('@now');
      });
    });

    describe('@createdAt on non-Date field → error', () => {
      test('should error for @createdAt on String field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'name', type: 'string', decorators: [makeDecorator('createdAt')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain('@createdAt');
        expect(errors[0]!.message).toContain('Date');
      });

      test('should error for @createdAt on Float field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'price', type: 'float', decorators: [makeDecorator('createdAt')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain('@createdAt');
      });
    });

    describe('@updatedAt on non-Date field → error', () => {
      test('should error for @updatedAt on String field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'name', type: 'string', decorators: [makeDecorator('updatedAt')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain('@updatedAt');
        expect(errors[0]!.message).toContain('Date');
      });

      test('should error for @updatedAt on Email field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'email', type: 'email', decorators: [makeDecorator('updatedAt')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain('@updatedAt');
      });
    });

    describe('mutual exclusivity between timestamp decorators', () => {
      test('should error for @now + @createdAt on same field', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('now'), makeDecorator('createdAt')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        const mutualErrors = errors.filter((e) => e.message.includes('multiple timestamp'));
        expect(mutualErrors.length).toBe(1);
        expect(mutualErrors[0]!.message).toContain('@now');
        expect(mutualErrors[0]!.message).toContain('@createdAt');
      });

      test('should error for @now + @updatedAt on same field', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('now'), makeDecorator('updatedAt')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        const mutualErrors = errors.filter((e) => e.message.includes('multiple timestamp'));
        expect(mutualErrors.length).toBe(1);
        expect(mutualErrors[0]!.message).toContain('@now');
        expect(mutualErrors[0]!.message).toContain('@updatedAt');
      });

      test('should error for @createdAt + @updatedAt on same field', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('createdAt'), makeDecorator('updatedAt')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        const mutualErrors = errors.filter((e) => e.message.includes('multiple timestamp'));
        expect(mutualErrors.length).toBe(1);
        expect(mutualErrors[0]!.message).toContain('@createdAt');
        expect(mutualErrors[0]!.message).toContain('@updatedAt');
      });

      test('should error for all three @now + @createdAt + @updatedAt on same field', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('now'), makeDecorator('createdAt'), makeDecorator('updatedAt')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        const mutualErrors = errors.filter((e) => e.message.includes('multiple timestamp'));
        expect(mutualErrors.length).toBe(1);
      });
    });

    describe('conflict with @default', () => {
      test('should error for @now + @default on same field', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('now'), makeDecorator('default', 'some-value')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        const defaultErrors = errors.filter((e) => e.message.includes('@default'));
        expect(defaultErrors.length).toBe(1);
        expect(defaultErrors[0]!.message).toContain('@now');
        expect(defaultErrors[0]!.message).toContain('@default');
      });

      test('should error for @createdAt + @default on same field', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('createdAt'), makeDecorator('default', 'some-value')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        const defaultErrors = errors.filter((e) => e.message.includes('@default'));
        expect(defaultErrors.length).toBe(1);
        expect(defaultErrors[0]!.message).toContain('@createdAt');
        expect(defaultErrors[0]!.message).toContain('@default');
      });

      test('should error for @updatedAt + @default on same field', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('updatedAt'), makeDecorator('default', 'some-value')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        const defaultErrors = errors.filter((e) => e.message.includes('@default'));
        expect(defaultErrors.length).toBe(1);
        expect(defaultErrors[0]!.message).toContain('@updatedAt');
        expect(defaultErrors[0]!.message).toContain('@default');
      });
    });

    describe('valid usage (no errors)', () => {
      test('should pass for single @now on Date field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'currentTime', type: 'date', decorators: [makeDecorator('now')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for single @createdAt on Date field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'createdAt', type: 'date', decorators: [makeDecorator('createdAt')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for single @updatedAt on Date field', () => {
        const ast = makeAST([
          makeModel({
            fields: [makeField({ name: 'updatedAt', type: 'date', decorators: [makeDecorator('updatedAt')] })],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for @createdAt and @updatedAt on different fields', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({ name: 'createdAt', type: 'date', decorators: [makeDecorator('createdAt')] }),
              makeField({ name: 'updatedAt', type: 'date', decorators: [makeDecorator('updatedAt')] }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for @now and @createdAt on different fields', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({ name: 'serverTime', type: 'date', decorators: [makeDecorator('now')] }),
              makeField({ name: 'createdAt', type: 'date', decorators: [makeDecorator('createdAt')] }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for all three timestamp decorators on different fields', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({ name: 'serverTime', type: 'date', decorators: [makeDecorator('now')] }),
              makeField({ name: 'createdAt', type: 'date', decorators: [makeDecorator('createdAt')] }),
              makeField({ name: 'updatedAt', type: 'date', decorators: [makeDecorator('updatedAt')] }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for fields without any timestamp decorator', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({ name: 'name', type: 'string' }),
              makeField({ name: 'age', type: 'int' }),
              makeField({ name: 'birthday', type: 'date' }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for optional Date field with @createdAt', () => {
        const ast = makeAST([
          makeModel({
            fields: [
              makeField({
                name: 'createdAt',
                type: 'date',
                isOptional: true,
                decorators: [makeDecorator('createdAt')],
              }),
            ],
          }),
        ]);

        const errors = validateTimestampFields(ast);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('validateObjectFields (timestamp decorators on object fields)', () => {
    test('should error for @now on Date field in object (COMPUTED must be top-level)', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [makeField({ name: 'serverTime', type: 'date', decorators: [makeDecorator('now')] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const nowErrors = errors.filter((e) => e.message.includes('@now'));
      expect(nowErrors.length).toBe(1);
      expect(nowErrors[0]!.message).toContain('not allowed on object fields');
      expect(nowErrors[0]!.message).toContain('COMPUTED');
    });

    test('should pass for @createdAt on Date field in object', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [makeField({ name: 'createdAt', type: 'date', decorators: [makeDecorator('createdAt')] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @updatedAt on Date field in object', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [makeField({ name: 'updatedAt', type: 'date', decorators: [makeDecorator('updatedAt')] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should error for @now on non-Date field in object (both not-allowed and Date-only errors)', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [makeField({ name: 'name', type: 'string', decorators: [makeDecorator('now')] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const nowErrors = errors.filter((e) => e.message.includes('@now'));
      // Two errors: @now not allowed on objects + @now only on Date fields
      expect(nowErrors.length).toBe(2);
      expect(nowErrors.some((e) => e.message.includes('not allowed on object fields'))).toBe(true);
      expect(nowErrors.some((e) => e.message.includes('Date'))).toBe(true);
    });

    test('should error for @createdAt on non-Date field in object', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [makeField({ name: 'count', type: 'int', decorators: [makeDecorator('createdAt')] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const timestampErrors = errors.filter((e) => e.message.includes('@createdAt'));
      expect(timestampErrors.length).toBe(1);
    });

    test('should error for @updatedAt on non-Date field in object', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [makeField({ name: 'flag', type: 'bool', decorators: [makeDecorator('updatedAt')] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const timestampErrors = errors.filter((e) => e.message.includes('@updatedAt'));
      expect(timestampErrors.length).toBe(1);
    });

    test('should error for mutual exclusivity in object fields (@now + @createdAt)', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('now'), makeDecorator('createdAt')],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      // @now not allowed on objects + mutual exclusivity error
      const nowErrors = errors.filter((e) => e.message.includes('@now'));
      expect(nowErrors.some((e) => e.message.includes('not allowed on object fields'))).toBe(true);
      const mutualErrors = errors.filter((e) => e.message.includes('multiple timestamp'));
      expect(mutualErrors.length).toBe(1);
    });

    test('should error for @createdAt + @default in object fields', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('createdAt'), makeDecorator('default', 'some-value')],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      const defaultErrors = errors.filter((e) => e.message.includes('@default'));
      expect(defaultErrors.length).toBe(1);
    });

    test('should pass for @createdAt and @updatedAt on different fields in object', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'Meta',
            fields: [
              makeField({ name: 'createdAt', type: 'date', decorators: [makeDecorator('createdAt')] }),
              makeField({ name: 'updatedAt', type: 'date', decorators: [makeDecorator('updatedAt')] }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('@defaultAlways decorator validation (model fields)', () => {
    test('should pass for @defaultAlways on String field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'status', type: 'string', decorators: [makeDecorator('defaultAlways', 'pending')] }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @defaultAlways on Int field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'retryCount', type: 'int', decorators: [makeDecorator('defaultAlways', 0)] }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @defaultAlways on Bool field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'reviewed', type: 'bool', decorators: [makeDecorator('defaultAlways', false)] }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @defaultAlways on Float field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'score', type: 'float', decorators: [makeDecorator('defaultAlways', 1.0)] }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @defaultAlways on Date field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'deadline', type: 'date', decorators: [makeDecorator('defaultAlways', null)] }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should error for @defaultAlways + @default on same field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({
              name: 'status',
              type: 'string',
              decorators: [makeDecorator('defaultAlways', 'pending'), makeDecorator('default', 'active')],
            }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('@defaultAlways') && e.message.includes('@default'))).toBe(true);
    });

    test('should error for @defaultAlways + @now on same field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({
              name: 'ts',
              type: 'date',
              decorators: [makeDecorator('defaultAlways', null), makeDecorator('now')],
            }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('@now') && e.message.includes('@defaultAlways'))).toBe(true);
    });

    test('should error for @defaultAlways + @createdAt on same field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({
              name: 'ts',
              type: 'date',
              decorators: [makeDecorator('defaultAlways', null), makeDecorator('createdAt')],
            }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('@createdAt') && e.message.includes('@defaultAlways'))).toBe(true);
    });

    test('should error for @defaultAlways + @updatedAt on same field', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({
              name: 'ts',
              type: 'date',
              decorators: [makeDecorator('defaultAlways', null), makeDecorator('updatedAt')],
            }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('@updatedAt') && e.message.includes('@defaultAlways'))).toBe(true);
    });

    test('should pass for @defaultAlways and @updatedAt on different fields', () => {
      const ast = makeAST([
        makeModel({
          name: 'Task',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'reviewed', type: 'bool', decorators: [makeDecorator('defaultAlways', false)] }),
            makeField({ name: 'updatedAt', type: 'date', decorators: [makeDecorator('updatedAt')] }),
          ],
        }),
      ]);

      const errors = validateTimestampFields(ast);
      expect(errors).toHaveLength(0);
    });
  });

  describe('@defaultAlways on object fields', () => {
    test('should pass for @defaultAlways on String field in object', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'ReviewMeta',
            fields: [
              makeField({
                name: 'note',
                type: 'string',
                decorators: [makeDecorator('defaultAlways', 'pending review')],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should pass for @defaultAlways on Bool field in object', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'ReviewMeta',
            fields: [makeField({ name: 'flagged', type: 'bool', decorators: [makeDecorator('defaultAlways', false)] })],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('should error for @defaultAlways + @default on object field', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'ReviewMeta',
            fields: [
              makeField({
                name: 'note',
                type: 'string',
                decorators: [makeDecorator('defaultAlways', 'pending'), makeDecorator('default', 'active')],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      expect(errors.some((e) => e.message.includes('@defaultAlways') && e.message.includes('@default'))).toBe(true);
    });

    test('should error for @defaultAlways + @updatedAt on same object field', () => {
      const ast = makeAST(
        [],
        [
          makeObject({
            name: 'ReviewMeta',
            fields: [
              makeField({
                name: 'ts',
                type: 'date',
                decorators: [makeDecorator('defaultAlways', null), makeDecorator('updatedAt')],
              }),
            ],
          }),
        ],
      );

      const errors = validateObjectFields(ast);
      expect(errors.some((e) => e.message.includes('@updatedAt') && e.message.includes('@defaultAlways'))).toBe(true);
    });
  });

  describe('validateSchema integration', () => {
    test('should catch timestamp errors in full schema validation', () => {
      const ast = makeAST([
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'name', type: 'string', decorators: [makeDecorator('now')] }),
          ],
        }),
      ]);

      const result = validateSchema(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('@now'))).toBe(true);
    });

    test('should pass full schema validation with correct timestamp usage', () => {
      const ast = makeAST([
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'string' }),
            makeField({ name: 'name', type: 'string' }),
            makeField({ name: 'createdAt', type: 'date', decorators: [makeDecorator('createdAt')] }),
            makeField({ name: 'updatedAt', type: 'date', decorators: [makeDecorator('updatedAt')] }),
          ],
        }),
      ]);

      const result = validateSchema(ast);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
