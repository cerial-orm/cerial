/**
 * Unit Tests: Distinct Parser
 *
 * Tests parsing of @distinct decorator.
 */

import { describe, expect, test } from 'bun:test';
import { isDecoratorToken } from './registry/helpers';
import { parseDistinctDecorator } from '../../../src/parser/types/field-decorators/distinct-parser';

describe('Distinct Parser', () => {
  describe('matchDecoratorToken @distinct', () => {
    test('should return true for @distinct', () => {
      expect(isDecoratorToken('@distinct', '@distinct')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@distinct', '@id')).toBe(false);
      expect(isDecoratorToken('@distinct', '@unique')).toBe(false);
      expect(isDecoratorToken('@distinct', '@sort')).toBe(false);
      expect(isDecoratorToken('@distinct', '@default')).toBe(false);
    });

    test('should return false for @distinct with parentheses', () => {
      expect(isDecoratorToken('@distinct', '@distinct()')).toBe(false);
      expect(isDecoratorToken('@distinct', '@distinct(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@distinct', 'distinct')).toBe(false);
      expect(isDecoratorToken('@distinct', '@DISTINCT')).toBe(false);
      expect(isDecoratorToken('@distinct', '@Distinct')).toBe(false);
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
