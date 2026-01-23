/**
 * String utils tests
 */

import { test, expect, describe } from 'bun:test';
import {
  toSnakeCase,
  toCamelCase,
  toPascalCase,
  escapeRegex,
  escapeString,
  isValidIdentifier,
  capitalize,
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
  });

  describe('isValidIdentifier', () => {
    test('validates identifiers', () => {
      expect(isValidIdentifier('user')).toBe(true);
      expect(isValidIdentifier('user_name')).toBe(true);
      expect(isValidIdentifier('_private')).toBe(true);
      expect(isValidIdentifier('123invalid')).toBe(false);
      expect(isValidIdentifier('has-dash')).toBe(false);
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
