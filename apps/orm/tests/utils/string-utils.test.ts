/**
 * String utils tests
 */

import { describe, expect, test } from 'bun:test';
import {
  capitalize,
  escapeRegex,
  escapeString,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  uncapitalize,
} from '../../src/utils/string-utils';

describe('string-utils', () => {
  describe('toSnakeCase', () => {
    test('converts PascalCase to snake_case', () => {
      expect(toSnakeCase('UserProfile')).toBe('user_profile');
      expect(toSnakeCase('User')).toBe('user');
      expect(toSnakeCase('HTTPRequest')).toBe('h_t_t_p_request');
    });
  });

  describe('toCamelCase', () => {
    test('converts PascalCase to camelCase', () => {
      expect(toCamelCase('UserProfile')).toBe('userProfile');
      expect(toCamelCase('User')).toBe('user');
    });
  });

  describe('toPascalCase', () => {
    test('converts snake_case to PascalCase', () => {
      expect(toPascalCase('user_profile')).toBe('UserProfile');
      expect(toPascalCase('user')).toBe('User');
    });
  });

  describe('escapeRegex', () => {
    test('escapes regex special characters', () => {
      expect(escapeRegex('hello.world')).toBe('hello\\.world');
      expect(escapeRegex('test*')).toBe('test\\*');
      expect(escapeRegex('[a-z]')).toBe('\\[a-z\\]');
    });
  });

  describe('escapeString', () => {
    test('escapes quotes', () => {
      expect(escapeString("it's")).toBe("it\\'s");
      expect(escapeString('say "hello"')).toBe('say \\"hello\\"');
    });

    test('escapes the backslash before the quotes, so an added escape is not itself escaped', () => {
      expect(escapeString('a\\b')).toBe('a\\\\b');
      expect(escapeString('end\\')).toBe('end\\\\');
      expect(escapeString('\\"')).toBe('\\\\\\"');
    });
  });

  describe('capitalize', () => {
    test('capitalizes first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('HELLO');
    });
  });

  describe('uncapitalize', () => {
    test('uncapitalizes first letter', () => {
      expect(uncapitalize('Hello')).toBe('hello');
      expect(uncapitalize('hello')).toBe('hello');
    });
  });
});
