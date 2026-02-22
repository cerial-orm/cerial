/**
 * Unit Tests: Timestamp Decorator Parsers
 *
 * Tests parsing of @now, @createdAt, and @updatedAt decorators.
 */

import { describe, expect, test } from 'bun:test';
import {
  isCreatedAtDecorator,
  parseCreatedAtDecorator,
} from '../../../src/parser/types/field-decorators/created-at-parser';
import { isNowDecorator, parseNowDecorator } from '../../../src/parser/types/field-decorators/now-parser';
import {
  isUpdatedAtDecorator,
  parseUpdatedAtDecorator,
} from '../../../src/parser/types/field-decorators/updated-at-parser';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

describe('Timestamp Decorator Parsers', () => {
  describe('isNowDecorator', () => {
    test('should return true for @now', () => {
      expect(isNowDecorator('@now')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isNowDecorator('@id')).toBe(false);
      expect(isNowDecorator('@unique')).toBe(false);
      expect(isNowDecorator('@default')).toBe(false);
      expect(isNowDecorator('@createdAt')).toBe(false);
      expect(isNowDecorator('@updatedAt')).toBe(false);
    });

    test('should return false for @now with parentheses', () => {
      expect(isNowDecorator('@now()')).toBe(false);
      expect(isNowDecorator('@now(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isNowDecorator('now')).toBe(false);
      expect(isNowDecorator('@NOW')).toBe(false);
      expect(isNowDecorator('@Now')).toBe(false);
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

  describe('isCreatedAtDecorator', () => {
    test('should return true for @createdAt', () => {
      expect(isCreatedAtDecorator('@createdAt')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isCreatedAtDecorator('@id')).toBe(false);
      expect(isCreatedAtDecorator('@unique')).toBe(false);
      expect(isCreatedAtDecorator('@default')).toBe(false);
      expect(isCreatedAtDecorator('@now')).toBe(false);
      expect(isCreatedAtDecorator('@updatedAt')).toBe(false);
    });

    test('should return false for @createdAt with parentheses', () => {
      expect(isCreatedAtDecorator('@createdAt()')).toBe(false);
      expect(isCreatedAtDecorator('@createdAt(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isCreatedAtDecorator('createdAt')).toBe(false);
      expect(isCreatedAtDecorator('@CREATEDAT')).toBe(false);
      expect(isCreatedAtDecorator('@CreatedAt')).toBe(false);
      expect(isCreatedAtDecorator('@createdat')).toBe(false);
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

  describe('isUpdatedAtDecorator', () => {
    test('should return true for @updatedAt', () => {
      expect(isUpdatedAtDecorator('@updatedAt')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isUpdatedAtDecorator('@id')).toBe(false);
      expect(isUpdatedAtDecorator('@unique')).toBe(false);
      expect(isUpdatedAtDecorator('@default')).toBe(false);
      expect(isUpdatedAtDecorator('@now')).toBe(false);
      expect(isUpdatedAtDecorator('@createdAt')).toBe(false);
    });

    test('should return false for @updatedAt with parentheses', () => {
      expect(isUpdatedAtDecorator('@updatedAt()')).toBe(false);
      expect(isUpdatedAtDecorator('@updatedAt(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isUpdatedAtDecorator('updatedAt')).toBe(false);
      expect(isUpdatedAtDecorator('@UPDATEDAT')).toBe(false);
      expect(isUpdatedAtDecorator('@UpdatedAt')).toBe(false);
      expect(isUpdatedAtDecorator('@updatedat')).toBe(false);
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
    test('each isXDecorator only matches its own token', () => {
      const tokens = ['@now', '@createdAt', '@updatedAt'];
      const checkers = [isNowDecorator, isCreatedAtDecorator, isUpdatedAtDecorator];

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
        expect(isNowDecorator(token)).toBe(false);
        expect(isCreatedAtDecorator(token)).toBe(false);
        expect(isUpdatedAtDecorator(token)).toBe(false);
      }
    });
  });
});
