/**
 * Unit Tests: Extends/Abstract Parser
 *
 * Tests parsing of `abstract model`, `extends`, pick/omit bracket syntax
 * across all type kinds (model, object, tuple, enum, literal).
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import {
  extractModelName,
  isModelDeclaration,
  parseModelDeclaration,
} from '../../../src/parser/types/model/model-declaration-parser';

describe('Extends Parser', () => {
  // ──────────────────────────────────────────────
  // A. Model Declaration Parser (model-declaration-parser.ts)
  // ──────────────────────────────────────────────
  describe('extractModelName', () => {
    test('should extract name from plain model', () => {
      expect(extractModelName('model User {')).toBe('User');
    });

    test('should extract name from abstract model', () => {
      expect(extractModelName('abstract model Base {')).toBe('Base');
    });

    test('should extract name from model extends', () => {
      expect(extractModelName('model User extends Base {')).toBe('User');
    });

    test('should extract name from model extends with pick', () => {
      expect(extractModelName('model User extends Base[id, name] {')).toBe('User');
    });

    test('should extract name from model extends with omit', () => {
      expect(extractModelName('model User extends Base[!updatedAt] {')).toBe('User');
    });

    test('should extract name from abstract model extends', () => {
      expect(extractModelName('abstract model Mid extends Base {')).toBe('Mid');
    });

    test('should extract name from abstract model extends with pick', () => {
      expect(extractModelName('abstract model Mid extends Base[id] {')).toBe('Mid');
    });

    test('should return null for invalid declaration', () => {
      expect(extractModelName('invalid line')).toBeNull();
    });

    test('should return null for empty string', () => {
      expect(extractModelName('')).toBeNull();
    });
  });

  describe('isModelDeclaration', () => {
    test('should return true for plain model', () => {
      expect(isModelDeclaration('model User {')).toBe(true);
    });

    test('should return true for abstract model', () => {
      expect(isModelDeclaration('abstract model Base {')).toBe(true);
    });

    test('should return true for model extends', () => {
      expect(isModelDeclaration('model User extends Base {')).toBe(true);
    });

    test('should return true for abstract model extends with pick', () => {
      expect(isModelDeclaration('abstract model Mid extends Base[id] {')).toBe(true);
    });

    test('should return false for non-model lines', () => {
      expect(isModelDeclaration('object Addr {')).toBe(false);
      expect(isModelDeclaration('tuple Point {')).toBe(false);
      expect(isModelDeclaration('some random text')).toBe(false);
    });
  });

  describe('parseModelDeclaration', () => {
    test('should parse plain model', () => {
      const result = parseModelDeclaration('model User {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.tableName).toBe('user');
      expect(result!.abstract).toBeUndefined();
      expect(result!.extends_).toBeUndefined();
      expect(result!.extendsFilter).toBeUndefined();
    });

    test('should parse abstract model', () => {
      const result = parseModelDeclaration('abstract model Base {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Base');
      expect(result!.abstract).toBe(true);
    });

    test('should parse model extends', () => {
      const result = parseModelDeclaration('model User extends Base {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toBeUndefined();
    });

    test('should parse model extends with pick', () => {
      const result = parseModelDeclaration('model User extends Base[id, name] {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id', 'name'] });
    });

    test('should parse model extends with omit', () => {
      const result = parseModelDeclaration('model User extends Base[!updatedAt, !createdAt] {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'omit', fields: ['updatedAt', 'createdAt'] });
    });

    test('should parse model extends with single pick', () => {
      const result = parseModelDeclaration('model Slim extends Base[id] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id'] });
    });

    test('should parse model extends with single omit', () => {
      const result = parseModelDeclaration('model User extends Base[!secret] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'omit', fields: ['secret'] });
    });

    test('should parse abstract model extends', () => {
      const result = parseModelDeclaration('abstract model Mid extends Base {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Mid');
      expect(result!.abstract).toBe(true);
      expect(result!.extends_).toBe('Base');
    });

    test('should parse abstract model extends with pick', () => {
      const result = parseModelDeclaration('abstract model Mid extends Base[id, name] {');
      expect(result).not.toBeNull();
      expect(result!.abstract).toBe(true);
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id', 'name'] });
    });
  });

  // ──────────────────────────────────────────────
  // B. Block detection in parser.ts
  // ──────────────────────────────────────────────
  describe('collectNames', () => {
    test('should collect abstract model name', () => {
      const schema = `
abstract model Base {
  id Record @id
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(1);
      expect(ast.models[0]!.name).toBe('Base');
    });

    test('should collect model with extends', () => {
      const schema = `
abstract model Base {
  id Record @id
}

model User extends Base {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);
      expect(ast.models[0]!.name).toBe('Base');
      expect(ast.models[1]!.name).toBe('User');
    });

    test('should collect model name with extends and pick bracket', () => {
      const schema = `
abstract model Base {
  id Record @id
  name String
  email Email
}

model Slim extends Base[id, name] {
  age Int
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);
      expect(ast.models[1]!.name).toBe('Slim');
    });
  });
});
