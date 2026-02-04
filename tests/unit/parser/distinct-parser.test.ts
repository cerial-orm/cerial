/**
 * Unit Tests: Distinct Parser
 *
 * Tests parsing of @distinct decorator.
 */

import { describe, expect, test } from 'bun:test';
import {
  isDistinctDecorator,
  parseDistinctDecorator,
} from '../../../src/parser/types/field-decorators/distinct-parser';

describe('Distinct Parser', () => {
  describe('isDistinctDecorator', () => {
    test('should return true for @distinct', () => {
      expect(isDistinctDecorator('@distinct')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDistinctDecorator('@id')).toBe(false);
      expect(isDistinctDecorator('@unique')).toBe(false);
      expect(isDistinctDecorator('@sort')).toBe(false);
      expect(isDistinctDecorator('@default')).toBe(false);
    });

    test('should return false for @distinct with parentheses', () => {
      expect(isDistinctDecorator('@distinct()')).toBe(false);
      expect(isDistinctDecorator('@distinct(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDistinctDecorator('distinct')).toBe(false);
      expect(isDistinctDecorator('@DISTINCT')).toBe(false);
      expect(isDistinctDecorator('@Distinct')).toBe(false);
    });
  });

  describe('parseDistinctDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 9, offset: 8 },
    };

    test('should parse @distinct decorator', () => {
      const result = parseDistinctDecorator(range);

      expect(result.type).toBe('distinct');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });
});
