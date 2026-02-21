import { describe, expect, test } from 'bun:test';
import {
  validateExtends,
  validateFieldNames,
  validateModelNames,
  validateNullableDecorator,
  validateNullableOnObjectFields,
  validateNullableOnTupleElements,
  validateRecordIdTypes,
  validateRelationRules,
  validateSchema,
  validateTupleElementDecorators,
  validateUuidFields,
} from '../../../src/cli/validators';
import { parse } from '../../../src/parser/parser';
import { loadFixture, parseFixture } from './helpers';

describe('Diagnostics Logic', () => {
  describe('parse errors', () => {
    test('errors fixture produces parse errors', () => {
      const source = loadFixture('errors.cerial');
      const result = parse(source);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('valid fixture produces no parse errors', () => {
      const source = loadFixture('simple-model.cerial');
      const result = parse(source);

      expect(result.errors).toEqual([]);
    });

    test('complex types fixture produces no parse errors', () => {
      const source = loadFixture('complex-types.cerial');
      const result = parse(source);

      expect(result.errors).toEqual([]);
    });

    test('decorators fixture produces no parse errors', () => {
      const source = loadFixture('decorators.cerial');
      const result = parse(source);

      expect(result.errors).toEqual([]);
    });

    test('relations fixture produces no parse errors', () => {
      const source = loadFixture('relations.cerial');
      const result = parse(source);

      expect(result.errors).toEqual([]);
    });

    test('inheritance fixture produces no parse errors', () => {
      const source = loadFixture('inheritance.cerial');
      const result = parse(source);

      expect(result.errors).toEqual([]);
    });

    test('parse error positions are 1-indexed lines', () => {
      const source = loadFixture('errors.cerial');
      const result = parse(source);

      for (const error of result.errors) {
        expect(error.position.line).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('validateSchema', () => {
    test('valid schema returns no errors', () => {
      const ast = parseFixture('simple-model.cerial');
      const result = validateSchema(ast);

      expect(result.errors).toEqual([]);
    });

    test('returns errors for schema issues', () => {
      // Model with conflicting timestamp decorators
      const source = 'model Bad {\n  id Record @id\n  ts Date @createdAt @updatedAt\n}';
      const { ast } = parse(source);
      const result = validateSchema(ast);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateFieldNames', () => {
    test('valid field names return no errors', () => {
      const ast = parseFixture('simple-model.cerial');
      const errors = validateFieldNames(ast);

      expect(errors).toEqual([]);
    });

    test('duplicate field names produce errors', () => {
      const source = 'model Dup {\n  id Record @id\n  name String\n  name String\n}';
      const { ast } = parse(source);
      const errors = validateFieldNames(ast);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.message).toContain('name');
    });
  });

  describe('validateModelNames', () => {
    test('unique model names return no errors', () => {
      const ast = parseFixture('simple-model.cerial');
      const errors = validateModelNames(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('validateRelationRules', () => {
    test('valid relations return no errors', () => {
      const ast = parseFixture('relations.cerial');
      const errors = validateRelationRules(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('validateNullableDecorator', () => {
    test('valid nullable usage returns no errors', () => {
      const ast = parseFixture('decorators.cerial');
      const errors = validateNullableDecorator(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('validateNullableOnObjectFields', () => {
    test('valid object fields return no errors', () => {
      const ast = parseFixture('complex-types.cerial');
      const errors = validateNullableOnObjectFields(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('validateNullableOnTupleElements', () => {
    test('valid tuple elements return no errors', () => {
      const ast = parseFixture('complex-types.cerial');
      const errors = validateNullableOnTupleElements(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('validateTupleElementDecorators', () => {
    test('valid tuple decorators return no errors', () => {
      const ast = parseFixture('complex-types.cerial');
      const errors = validateTupleElementDecorators(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('validateRecordIdTypes', () => {
    test('valid record IDs return no errors', () => {
      const ast = parseFixture('decorators.cerial');
      const errors = validateRecordIdTypes(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('validateExtends', () => {
    test('valid inheritance returns no errors', () => {
      const ast = parseFixture('inheritance.cerial');
      const errors = validateExtends(ast);

      expect(errors).toEqual([]);
    });

    test('concrete extends concrete produces error', () => {
      const source = 'model Parent {\n  id Record @id\n}\nmodel Child extends Parent {\n  name String\n}';
      const { ast } = parse(source);
      const errors = validateExtends(ast);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.message).toContain('abstract');
    });
  });

  describe('validateUuidFields', () => {
    test('valid uuid fields return no errors', () => {
      const ast = parseFixture('decorators.cerial');
      const errors = validateUuidFields(ast);

      expect(errors).toEqual([]);
    });
  });

  describe('position conversion consistency', () => {
    test('parse errors have correct 1-indexed lines for LSP conversion', () => {
      const source = loadFixture('errors.cerial');
      const result = parse(source);

      // The LSP diagnostics provider converts 1-indexed → 0-indexed
      // Verify that errors have line >= 1 (not 0-indexed)
      for (const error of result.errors) {
        expect(error.position.line).toBeGreaterThanOrEqual(1);
        expect(typeof error.position.column).toBe('number');
        expect(error.position.column).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
