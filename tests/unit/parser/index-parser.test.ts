/**
 * Unit Tests: Index Parser
 *
 * Tests parsing of @index decorator.
 */

import { describe, expect, test } from 'bun:test';
import { isIndexDecorator, parseIndexDecorator } from '../../../src/parser/types/field-decorators/index-parser';

describe('Index Parser', () => {
  describe('isIndexDecorator', () => {
    test('should return true for @index', () => {
      expect(isIndexDecorator('@index')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isIndexDecorator('@id')).toBe(false);
      expect(isIndexDecorator('@unique')).toBe(false);
      expect(isIndexDecorator('@sort')).toBe(false);
      expect(isIndexDecorator('@default')).toBe(false);
      expect(isIndexDecorator('@distinct')).toBe(false);
    });

    test('should return false for @index with parentheses', () => {
      expect(isIndexDecorator('@index()')).toBe(false);
      expect(isIndexDecorator('@index(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isIndexDecorator('index')).toBe(false);
      expect(isIndexDecorator('@INDEX')).toBe(false);
      expect(isIndexDecorator('@Index')).toBe(false);
      expect(isIndexDecorator('@@index')).toBe(false);
    });
  });

  describe('parseIndexDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 6, offset: 5 },
    };

    test('should parse @index decorator', () => {
      const result = parseIndexDecorator(range);

      expect(result.type).toBe('index');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });
});
