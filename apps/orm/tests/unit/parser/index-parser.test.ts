/**
 * Unit Tests: Index Parser
 *
 * Tests parsing of @index decorator.
 */

import { describe, expect, test } from 'bun:test';
import { isDecoratorToken } from './registry/helpers';
import { parseIndexDecorator } from '../../../src/parser/types/field-decorators/index-parser';

describe('Index Parser', () => {
  describe('matchDecoratorToken @index', () => {
    test('should return true for @index', () => {
      expect(isDecoratorToken('@index', '@index')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@index', '@id')).toBe(false);
      expect(isDecoratorToken('@index', '@unique')).toBe(false);
      expect(isDecoratorToken('@index', '@sort')).toBe(false);
      expect(isDecoratorToken('@index', '@default')).toBe(false);
      expect(isDecoratorToken('@index', '@distinct')).toBe(false);
    });

    test('should return false for @index with parentheses', () => {
      expect(isDecoratorToken('@index', '@index()')).toBe(false);
      expect(isDecoratorToken('@index', '@index(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@index', 'index')).toBe(false);
      expect(isDecoratorToken('@index', '@INDEX')).toBe(false);
      expect(isDecoratorToken('@index', '@Index')).toBe(false);
      expect(isDecoratorToken('@index', '@@index')).toBe(false);
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
