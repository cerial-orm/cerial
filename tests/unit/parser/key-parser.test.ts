/**
 * Unit Tests: Key Parser
 *
 * Tests parsing of @key(name) decorator.
 */

import { describe, expect, test } from 'bun:test';
import {
  extractKeyName,
  isKeyDecorator,
  parseKeyDecorator,
} from '../../../src/parser/types/field-decorators/key-parser';

describe('Key Parser', () => {
  describe('isKeyDecorator', () => {
    test('should return true for valid @key decorator', () => {
      expect(isKeyDecorator('@key(author)')).toBe(true);
    });

    test('should return true for @key with various names', () => {
      expect(isKeyDecorator('@key(manages)')).toBe(true);
      expect(isKeyDecorator('@key(parent)')).toBe(true);
      expect(isKeyDecorator('@key(reviewer)')).toBe(true);
    });

    test('should return false for @key without parentheses', () => {
      expect(isKeyDecorator('@key')).toBe(false);
    });

    test('should return false for other decorators', () => {
      expect(isKeyDecorator('@id')).toBe(false);
      expect(isKeyDecorator('@unique')).toBe(false);
      expect(isKeyDecorator('@field(userId)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isKeyDecorator('key(author)')).toBe(false);
      expect(isKeyDecorator('@KEY(author)')).toBe(false);
    });
  });

  describe('extractKeyName', () => {
    test('should extract key name from valid decorator', () => {
      expect(extractKeyName('@key(author)')).toBe('author');
    });

    test('should extract different key names', () => {
      expect(extractKeyName('@key(manages)')).toBe('manages');
      expect(extractKeyName('@key(parent)')).toBe('parent');
      expect(extractKeyName('@key(reviewer)')).toBe('reviewer');
    });

    test('should handle underscores in key name', () => {
      expect(extractKeyName('@key(parent_child)')).toBe('parent_child');
    });

    test('should handle numbers in key name', () => {
      expect(extractKeyName('@key(relation1)')).toBe('relation1');
    });

    test('should return undefined for invalid format', () => {
      expect(extractKeyName('@key')).toBeUndefined();
      expect(extractKeyName('@key()')).toBeUndefined();
      expect(extractKeyName('@id')).toBeUndefined();
    });
  });

  describe('parseKeyDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 13, offset: 12 },
    };

    test('should parse valid @key decorator', () => {
      const result = parseKeyDecorator('@key(author)', range);

      expect(result.type).toBe('key');
      expect(result.value).toBe('author');
      expect(result.range).toEqual(range);
    });

    test('should parse different key names', () => {
      expect(parseKeyDecorator('@key(manages)', range).value).toBe('manages');
      expect(parseKeyDecorator('@key(parent)', range).value).toBe('parent');
    });

    test('should handle invalid format gracefully', () => {
      const result = parseKeyDecorator('@key()', range);
      expect(result.type).toBe('key');
      expect(result.value).toBeUndefined();
    });
  });
});
