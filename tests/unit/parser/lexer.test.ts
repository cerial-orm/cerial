/**
 * Unit Tests: Lexer
 *
 * Tests lexical analysis of tokenized .cerial schema files.
 */

import { describe, expect, test } from 'bun:test';
import { lex } from '../../../src/parser/lexer';
import { tokenize } from '../../../src/parser/tokenizer';

describe('Lexer', () => {
  describe('lex', () => {
    test('should lex empty input', () => {
      const tokens = tokenize('');
      const result = lex(tokens);

      expect(result.lexemes).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    test('should lex simple model declaration', () => {
      const source = 'model User { }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      const types = result.lexemes.map((l) => l.type);
      expect(types).toContain('model_keyword');
      expect(types).toContain('model_name');
      expect(types).toContain('block_start');
      expect(types).toContain('block_end');
    });

    test('should extract model name', () => {
      const source = 'model User { }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      const modelName = result.lexemes.find((l) => l.type === 'model_name');
      expect(modelName?.value).toBe('User');
    });
  });

  describe('field declarations', () => {
    test('should lex field with type', () => {
      const source = 'model User { name String }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      const fieldName = result.lexemes.find((l) => l.type === 'field_name');
      const fieldType = result.lexemes.find((l) => l.type === 'field_type');

      expect(fieldName?.value).toBe('name');
      expect(fieldType?.value).toBe('String');
    });

    test('should lex optional field', () => {
      const source = 'model User { bio String? }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      // In the actual schema format, ? comes after the type (String?)
      // The lexer processes field name, then type with optional marker
      const fieldName = result.lexemes.find((l) => l.type === 'field_name');
      expect(fieldName?.value).toBe('bio');
    });

    test('should lex multiple fields', () => {
      const source = `model User {
        id String
        name String
        email String
      }`;
      const tokens = tokenize(source);
      const result = lex(tokens);

      const fieldNames = result.lexemes.filter((l) => l.type === 'field_name');
      expect(fieldNames).toHaveLength(3);
      expect(fieldNames.map((f) => f.value)).toEqual(['id', 'name', 'email']);
    });
  });

  describe('decorators', () => {
    test('should lex @unique decorator', () => {
      const source = 'model User { @unique email String }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      const uniqueDecorator = result.lexemes.find((l) => l.type === 'decorator_unique');
      expect(uniqueDecorator?.value).toBe('@unique');
    });

    test('should lex @now decorator', () => {
      const source = 'model User { @now createdAt Date }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      const nowDecorator = result.lexemes.find((l) => l.type === 'decorator_now');
      expect(nowDecorator?.value).toBe('@now');
    });

    test('should lex @default decorator', () => {
      const source = 'model User { @default(true) active Bool }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      const defaultDecorator = result.lexemes.find((l) => l.type === 'decorator_default');
      expect(defaultDecorator?.value).toBe('@default(true)');
    });
  });

  describe('multiple models', () => {
    test('should lex multiple models', () => {
      const source = `
        model User { name String }
        model Post { title String }
      `;
      const tokens = tokenize(source);
      const result = lex(tokens);

      const modelKeywords = result.lexemes.filter((l) => l.type === 'model_keyword');
      const modelNames = result.lexemes.filter((l) => l.type === 'model_name');

      expect(modelKeywords).toHaveLength(2);
      expect(modelNames).toHaveLength(2);
      expect(modelNames.map((m) => m.value)).toEqual(['User', 'Post']);
    });
  });

  describe('errors', () => {
    test('should report missing model name', () => {
      const source = 'model { }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should report missing opening brace', () => {
      const source = 'model User }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('position tracking', () => {
    test('should track lexeme positions', () => {
      const source = 'model User { }';
      const tokens = tokenize(source);
      const result = lex(tokens);

      const modelKeyword = result.lexemes.find((l) => l.type === 'model_keyword');
      expect(modelKeyword?.position).toBeDefined();
      expect(modelKeyword?.position.line).toBe(1);
    });
  });
});
