import { describe, expect, test } from 'bun:test';
import { isDecoratorToken } from './registry/helpers';
import { parseSetDecorator } from '../../../src/parser/types/field-decorators/set-parser';

describe('Set Parser', () => {
  describe('matchDecoratorToken @set', () => {
    test('should return true for @set', () => {
      expect(isDecoratorToken('@set', '@set')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@set', '@id')).toBe(false);
      expect(isDecoratorToken('@set', '@unique')).toBe(false);
      expect(isDecoratorToken('@set', '@distinct')).toBe(false);
      expect(isDecoratorToken('@set', '@sort')).toBe(false);
      expect(isDecoratorToken('@set', '@default')).toBe(false);
    });

    test('should return false for @set with parentheses', () => {
      expect(isDecoratorToken('@set', '@set()')).toBe(false);
      expect(isDecoratorToken('@set', '@set(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@set', 'set')).toBe(false);
      expect(isDecoratorToken('@set', '@SET')).toBe(false);
      expect(isDecoratorToken('@set', '@Set')).toBe(false);
    });
  });

  describe('parseSetDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 4, offset: 3 },
    };

    test('should parse @set decorator', () => {
      const result = parseSetDecorator(range);

      expect(result.type).toBe('set');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });
});
