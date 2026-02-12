/**
 * Unit Tests: @defaultAlways Decorator Parser
 *
 * Tests parsing of @defaultAlways(value) decorator — the general-purpose
 * DEFAULT ALWAYS decorator that resets a field on every write.
 */

import { describe, expect, test } from 'bun:test';
import {
  extractDefaultAlwaysValue,
  isDefaultAlwaysDecorator,
  parseDefaultAlwaysDecorator,
} from '../../../src/parser/types/field-decorators/default-always-parser';
import { isDefaultDecorator } from '../../../src/parser/types/field-decorators/default-parser';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 30, offset: 29 },
};

describe('@defaultAlways Decorator Parser', () => {
  describe('isDefaultAlwaysDecorator', () => {
    test('should return true for @defaultAlways with string value', () => {
      expect(isDefaultAlwaysDecorator('@defaultAlways("pending")')).toBe(true);
    });

    test('should return true for @defaultAlways with single-quoted string', () => {
      expect(isDefaultAlwaysDecorator("@defaultAlways('pending')")).toBe(true);
    });

    test('should return true for @defaultAlways with integer value', () => {
      expect(isDefaultAlwaysDecorator('@defaultAlways(0)')).toBe(true);
      expect(isDefaultAlwaysDecorator('@defaultAlways(42)')).toBe(true);
      expect(isDefaultAlwaysDecorator('@defaultAlways(-1)')).toBe(true);
    });

    test('should return true for @defaultAlways with float value', () => {
      expect(isDefaultAlwaysDecorator('@defaultAlways(1.5)')).toBe(true);
      expect(isDefaultAlwaysDecorator('@defaultAlways(-3.14)')).toBe(true);
    });

    test('should return true for @defaultAlways with boolean value', () => {
      expect(isDefaultAlwaysDecorator('@defaultAlways(true)')).toBe(true);
      expect(isDefaultAlwaysDecorator('@defaultAlways(false)')).toBe(true);
    });

    test('should return true for @defaultAlways with null value', () => {
      expect(isDefaultAlwaysDecorator('@defaultAlways(null)')).toBe(true);
    });

    test('should return false for @default decorator', () => {
      expect(isDefaultAlwaysDecorator('@default("pending")')).toBe(false);
      expect(isDefaultAlwaysDecorator('@default(0)')).toBe(false);
      expect(isDefaultAlwaysDecorator('@default(true)')).toBe(false);
    });

    test('should return false for @defaultAlways without parentheses', () => {
      expect(isDefaultAlwaysDecorator('@defaultAlways')).toBe(false);
    });

    test('should return false for other decorators', () => {
      expect(isDefaultAlwaysDecorator('@id')).toBe(false);
      expect(isDefaultAlwaysDecorator('@unique')).toBe(false);
      expect(isDefaultAlwaysDecorator('@now')).toBe(false);
      expect(isDefaultAlwaysDecorator('@createdAt')).toBe(false);
      expect(isDefaultAlwaysDecorator('@updatedAt')).toBe(false);
    });

    test('should return false for non-decorator strings', () => {
      expect(isDefaultAlwaysDecorator('defaultAlways')).toBe(false);
      expect(isDefaultAlwaysDecorator('')).toBe(false);
      expect(isDefaultAlwaysDecorator(' ')).toBe(false);
    });
  });

  describe('extractDefaultAlwaysValue', () => {
    test('should extract string value (double quotes)', () => {
      expect(extractDefaultAlwaysValue('@defaultAlways("pending")')).toBe('pending');
    });

    test('should extract string value (single quotes)', () => {
      expect(extractDefaultAlwaysValue("@defaultAlways('dirty')")).toBe('dirty');
    });

    test('should extract integer value', () => {
      expect(extractDefaultAlwaysValue('@defaultAlways(0)')).toBe(0);
      expect(extractDefaultAlwaysValue('@defaultAlways(42)')).toBe(42);
      expect(extractDefaultAlwaysValue('@defaultAlways(-5)')).toBe(-5);
    });

    test('should extract float value', () => {
      expect(extractDefaultAlwaysValue('@defaultAlways(1.5)')).toBe(1.5);
      expect(extractDefaultAlwaysValue('@defaultAlways(-3.14)')).toBe(-3.14);
    });

    test('should extract boolean true', () => {
      expect(extractDefaultAlwaysValue('@defaultAlways(true)')).toBe(true);
    });

    test('should extract boolean false', () => {
      expect(extractDefaultAlwaysValue('@defaultAlways(false)')).toBe(false);
    });

    test('should extract null', () => {
      expect(extractDefaultAlwaysValue('@defaultAlways(null)')).toBeNull();
    });

    test('should return undefined for malformed token', () => {
      expect(extractDefaultAlwaysValue('@defaultAlways')).toBeUndefined();
      expect(extractDefaultAlwaysValue('@default(0)')).toBeUndefined();
      expect(extractDefaultAlwaysValue('invalid')).toBeUndefined();
    });
  });

  describe('parseDefaultAlwaysDecorator', () => {
    test('should produce ASTDecorator with type "defaultAlways" and string value', () => {
      const result = parseDefaultAlwaysDecorator('@defaultAlways("pending")', range);

      expect(result.type).toBe('defaultAlways');
      expect(result.value).toBe('pending');
      expect(result.range).toEqual(range);
    });

    test('should produce ASTDecorator with integer value', () => {
      const result = parseDefaultAlwaysDecorator('@defaultAlways(0)', range);

      expect(result.type).toBe('defaultAlways');
      expect(result.value).toBe(0);
    });

    test('should produce ASTDecorator with float value', () => {
      const result = parseDefaultAlwaysDecorator('@defaultAlways(1.5)', range);

      expect(result.type).toBe('defaultAlways');
      expect(result.value).toBe(1.5);
    });

    test('should produce ASTDecorator with boolean value', () => {
      const result = parseDefaultAlwaysDecorator('@defaultAlways(false)', range);

      expect(result.type).toBe('defaultAlways');
      expect(result.value).toBe(false);
    });

    test('should produce ASTDecorator with null value', () => {
      const result = parseDefaultAlwaysDecorator('@defaultAlways(null)', range);

      expect(result.type).toBe('defaultAlways');
      expect(result.value).toBeNull();
    });
  });

  describe('cross-decorator isolation: @default vs @defaultAlways', () => {
    test('@default should NOT match @defaultAlways tokens', () => {
      expect(isDefaultDecorator('@defaultAlways(0)')).toBe(false);
      expect(isDefaultDecorator('@defaultAlways("test")')).toBe(false);
      expect(isDefaultDecorator('@defaultAlways(true)')).toBe(false);
    });

    test('@defaultAlways should NOT match @default tokens', () => {
      expect(isDefaultAlwaysDecorator('@default(0)')).toBe(false);
      expect(isDefaultAlwaysDecorator('@default("test")')).toBe(false);
      expect(isDefaultAlwaysDecorator('@default(true)')).toBe(false);
    });

    test('@default still matches its own tokens', () => {
      expect(isDefaultDecorator('@default(0)')).toBe(true);
      expect(isDefaultDecorator('@default("test")')).toBe(true);
      expect(isDefaultDecorator('@default(true)')).toBe(true);
      expect(isDefaultDecorator('@default(null)')).toBe(true);
    });
  });
});
