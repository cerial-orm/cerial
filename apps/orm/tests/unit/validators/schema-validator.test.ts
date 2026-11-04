/**
 * Unit Tests: Schema Validator
 *
 * Tests validation of schema AST.
 */

import { describe, expect, test } from 'bun:test';
import { validateModelIdField } from '../../../src/cli/validators/extends-validator';
import {
  validateFieldNames,
  validateModelNames,
  validateRelations,
  validateSchema,
} from '../../../src/cli/validators/schema-validator';
import type { ASTTuple, SchemaAST } from '../../../src/types';
import { createASTField, createASTModel } from './helpers';
import { createDslOrigin } from '../../../src/parser';

describe('Schema Validator', () => {
  describe('validateModelNames', () => {
    test('should pass for valid PascalCase model names', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [createASTModel({ name: 'User' }), createASTModel({ name: 'UserProfile' })],
      };

      const errors = validateModelNames(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for duplicate model names', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [createASTModel({ name: 'User' }), createASTModel({ name: 'User' })],
      };

      const errors = validateModelNames(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    });

    test('should fail for invalid model names', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [createASTModel({ name: 'user' })], // lowercase
      };

      const errors = validateModelNames(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Invalid model name'))).toBe(true);
    });
  });

  describe('validateFieldNames', () => {
    test('should pass for valid field names', () => {
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
              createASTField({ name: 'id' }),
              createASTField({ name: 'userName' }),
              createASTField({ name: 'user_name' }),
            ],
          }),
        ],
      };

      const errors = validateFieldNames(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for duplicate field names', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({
            name: 'User',
            fields: [createASTField({ name: 'email' }), createASTField({ name: 'email' })],
          }),
        ],
      };

      const errors = validateFieldNames(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    });
  });

  describe('validateRelations', () => {
    test('should fail for Relation without @model', () => {
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
                name: 'posts',
                type: 'relation',
                decorators: [], // Missing @model
              }),
            ],
          }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('@model'))).toBe(true);
    });

    test('should fail for Relation referencing non-existent model', () => {
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
                name: 'posts',
                type: 'relation',
                decorators: [
                  {
                    type: 'model',
                    value: 'NonExistent',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                    origin: createDslOrigin({
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    }),
                  },
                ],
              }),
            ],
          }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('non-existent'))).toBe(true);
    });

    test('should pass for valid Relation with existing target', () => {
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
                name: 'posts',
                type: 'relation',
                isArray: true,
                decorators: [
                  {
                    type: 'model',
                    value: 'Post',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                    origin: createDslOrigin({
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    }),
                  },
                ],
              }),
            ],
          }),
          createASTModel({ name: 'Post' }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors).toHaveLength(0);
    });

    test('should fail for @field referencing non-existent Record field', () => {
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
                decorators: [
                  {
                    type: 'model',
                    value: 'User',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                    origin: createDslOrigin({
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    }),
                  },
                  {
                    type: 'field',
                    value: 'authorId', // This field doesn't exist
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    },
                    origin: createDslOrigin({
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 1, offset: 0 },
                    }),
                  },
                ],
              }),
            ],
          }),
          createASTModel({ name: 'User' }),
        ],
      };

      const errors = validateRelations(ast);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateSchema', () => {
    test('should return valid:true for valid schema', () => {
      const idRange = {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      };
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
                decorators: [{ type: 'id', range: idRange, origin: createDslOrigin(idRange) }],
              }),
              createASTField({ name: 'name', type: 'string' }),
            ],
          }),
        ],
      };

      const result = validateSchema(ast);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should return valid:false for invalid schema', () => {
      const ast: SchemaAST = {
        source: '',
        objects: [],
        tuples: [],
        literals: [],
        enums: [],
        models: [
          createASTModel({ name: 'user' }), // Invalid: lowercase
        ],
      };

      const result = validateSchema(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('optional tuple with a decorated element beside an optional object', () => {
    const range = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

    // SurrealDB 4.0 leaves the absent tuple NONE (facts: tuples-and-literals.test.ts), so the
    // combination the ORM once refused is a valid schema.
    test('is accepted', () => {
      const tuple: ASTTuple = {
        name: 'Pair',
        elements: [
          {
            origin: createDslOrigin(),
            type: 'int',
            isOptional: false,
            decorators: [{ type: 'default', range, origin: createDslOrigin(range) }],
          },
          { origin: createDslOrigin(), type: 'string', isOptional: true },
        ],
        range,
        origin: createDslOrigin(range),
      };
      const ast: SchemaAST = {
        source: '',
        objects: [],
        enums: [],
        tuples: [tuple],
        literals: [],
        models: [
          createASTModel({
            name: 'Place',
            fields: [
              createASTField({ name: 'pair', type: 'tuple', tupleName: 'Pair', isOptional: true }),
              createASTField({ name: 'addr', type: 'object', objectName: 'Addr', isOptional: true }),
            ],
          }),
        ],
      };

      const errors = validateSchema(ast).errors;
      expect(errors.filter((e) => e.field === 'pair')).toEqual([]);
    });
  });
});

// ── validateModelIdField (Rule 3) ───────────────────────────────────────

describe('validateModelIdField', () => {
  const defaultRange = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };

  test('model without @id field → error', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [
        createASTModel({
          name: 'NoId',
          fields: [createASTField({ name: 'name', type: 'string' })],
        }),
      ],
    };
    const errors = validateModelIdField(ast);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('NoId');
    expect(errors[0]!.message).toContain('@id');
    expect(errors[0]!.model).toBe('NoId');
  });

  test('model with @id field → no error', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [
        createASTModel({
          name: 'Valid',
          fields: [
            createASTField({
              name: 'id',
              type: 'record',
              decorators: [{ type: 'id', range: defaultRange, origin: createDslOrigin(defaultRange) }],
            }),
            createASTField({ name: 'name', type: 'string' }),
          ],
        }),
      ],
    };
    const errors = validateModelIdField(ast);
    expect(errors).toHaveLength(0);
  });

  test('multiple models — one without @id → one error', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [
        createASTModel({
          name: 'WithId',
          fields: [
            createASTField({
              name: 'id',
              type: 'record',
              decorators: [{ type: 'id', range: defaultRange, origin: createDslOrigin(defaultRange) }],
            }),
          ],
        }),
        createASTModel({
          name: 'WithoutId',
          fields: [createASTField({ name: 'name', type: 'string' })],
        }),
      ],
    };
    const errors = validateModelIdField(ast);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.model).toBe('WithoutId');
  });

  test('abstract model without @id → no error (abstract skipped)', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [
        createASTModel({
          name: 'AbsBase',
          abstract: true,
          fields: [createASTField({ name: 'name', type: 'string' })],
        }),
      ],
    };
    const errors = validateModelIdField(ast);
    expect(errors).toHaveLength(0);
  });

  test('model with extends and no @id → no error (extends skipped)', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [
        createASTModel({
          name: 'Child',
          extends: 'Base',
          fields: [createASTField({ name: 'extra', type: 'string' })],
        }),
      ],
    };
    const errors = validateModelIdField(ast);
    expect(errors).toHaveLength(0);
  });

  test('validateModelIdField is a pre-resolution check (uses raw AST)', () => {
    const ast: SchemaAST = {
      source: '',
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      models: [
        createASTModel({
          name: 'NoIdModel',
          fields: [createASTField({ name: 'name', type: 'string' })],
        }),
      ],
    };
    const errors = validateModelIdField(ast);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('@id');
  });
});
