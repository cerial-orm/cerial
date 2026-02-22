import { describe, expect, test } from 'bun:test';
import { isSetDecorator, parseSetDecorator } from '../../../src/parser/types/field-decorators/set-parser';

describe('Set Parser', () => {
  describe('isSetDecorator', () => {
    test('should return true for @set', () => {
      expect(isSetDecorator('@set')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isSetDecorator('@id')).toBe(false);
      expect(isSetDecorator('@unique')).toBe(false);
      expect(isSetDecorator('@distinct')).toBe(false);
      expect(isSetDecorator('@sort')).toBe(false);
      expect(isSetDecorator('@default')).toBe(false);
    });

    test('should return false for @set with parentheses', () => {
      expect(isSetDecorator('@set()')).toBe(false);
      expect(isSetDecorator('@set(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isSetDecorator('set')).toBe(false);
      expect(isSetDecorator('@SET')).toBe(false);
      expect(isSetDecorator('@Set')).toBe(false);
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
