/**
 * Unit Tests: Timestamp Decorator Parsers
 *
 * Tests parsing of @now, @createdAt, and @updatedAt decorators.
 */

import { describe, expect, test } from 'bun:test';
import { isDecoratorToken } from './registry/helpers';
import { parseCreatedAtDecorator } from '../../../src/parser/types/field-decorators/created-at-parser';
import { parseNowDecorator } from '../../../src/parser/types/field-decorators/now-parser';
import { parseUpdatedAtDecorator } from '../../../src/parser/types/field-decorators/updated-at-parser';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

describe('Timestamp Decorator Parsers', () => {
  describe('matchDecoratorToken @now', () => {
    test('should return true for @now', () => {
      expect(isDecoratorToken('@now', '@now')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@now', '@id')).toBe(false);
      expect(isDecoratorToken('@now', '@unique')).toBe(false);
      expect(isDecoratorToken('@now', '@default')).toBe(false);
      expect(isDecoratorToken('@now', '@createdAt')).toBe(false);
      expect(isDecoratorToken('@now', '@updatedAt')).toBe(false);
    });

    test('should return false for @now with parentheses', () => {
      expect(isDecoratorToken('@now', '@now()')).toBe(false);
      expect(isDecoratorToken('@now', '@now(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@now', 'now')).toBe(false);
      expect(isDecoratorToken('@now', '@NOW')).toBe(false);
      expect(isDecoratorToken('@now', '@Now')).toBe(false);
    });
  });

  describe('parseNowDecorator', () => {
    test('should produce ASTDecorator with type "now"', () => {
      const result = parseNowDecorator(range);

      expect(result.type).toBe('now');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });

  describe('matchDecoratorToken @createdAt', () => {
    test('should return true for @createdAt', () => {
      expect(isDecoratorToken('@createdAt', '@createdAt')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@createdAt', '@id')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@unique')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@default')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@now')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@updatedAt')).toBe(false);
    });

    test('should return false for @createdAt with parentheses', () => {
      expect(isDecoratorToken('@createdAt', '@createdAt()')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@createdAt(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@createdAt', 'createdAt')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@CREATEDAT')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@CreatedAt')).toBe(false);
      expect(isDecoratorToken('@createdAt', '@createdat')).toBe(false);
    });
  });

  describe('parseCreatedAtDecorator', () => {
    test('should produce ASTDecorator with type "createdAt"', () => {
      const result = parseCreatedAtDecorator(range);

      expect(result.type).toBe('createdAt');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });

  describe('matchDecoratorToken @updatedAt', () => {
    test('should return true for @updatedAt', () => {
      expect(isDecoratorToken('@updatedAt', '@updatedAt')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@updatedAt', '@id')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@unique')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@default')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@now')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@createdAt')).toBe(false);
    });

    test('should return false for @updatedAt with parentheses', () => {
      expect(isDecoratorToken('@updatedAt', '@updatedAt()')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@updatedAt(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@updatedAt', 'updatedAt')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@UPDATEDAT')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@UpdatedAt')).toBe(false);
      expect(isDecoratorToken('@updatedAt', '@updatedat')).toBe(false);
    });
  });

  describe('parseUpdatedAtDecorator', () => {
    test('should produce ASTDecorator with type "updatedAt"', () => {
      const result = parseUpdatedAtDecorator(range);

      expect(result.type).toBe('updatedAt');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });

  describe('cross-decorator checks', () => {
    test('each registry entry only matches its own token', () => {
      const tokens = ['@now', '@createdAt', '@updatedAt'];
      const checkers = tokens.map((name) => (token: string) => isDecoratorToken(name, token));

      for (let i = 0; i < tokens.length; i++) {
        for (let j = 0; j < checkers.length; j++) {
          if (i === j) {
            expect(checkers[j]!(tokens[i]!)).toBe(true);
          } else {
            expect(checkers[j]!(tokens[i]!)).toBe(false);
          }
        }
      }
    });

    test('none of the timestamp decorators match non-decorator strings', () => {
      const invalid = ['now', 'createdAt', 'updatedAt', '', ' ', '@', '@@now'];

      for (const token of invalid) {
        expect(isDecoratorToken('@now', token)).toBe(false);
        expect(isDecoratorToken('@createdAt', token)).toBe(false);
        expect(isDecoratorToken('@updatedAt', token)).toBe(false);
      }
    });
  });
});
