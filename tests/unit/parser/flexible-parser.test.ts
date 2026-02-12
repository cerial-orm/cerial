/**
 * Unit Tests: Flexible Parser
 *
 * Tests parsing of @flexible decorator.
 */

import { describe, expect, test } from 'bun:test';
import {
  isFlexibleDecorator,
  parseFlexibleDecorator,
} from '../../../src/parser/types/field-decorators/flexible-parser';
import { parseDecorators } from '../../../src/parser/types/model/field-declaration-parser';

describe('Flexible Parser', () => {
  describe('isFlexibleDecorator', () => {
    test('should return true for @flexible', () => {
      expect(isFlexibleDecorator('@flexible')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isFlexibleDecorator('@id')).toBe(false);
      expect(isFlexibleDecorator('@unique')).toBe(false);
      expect(isFlexibleDecorator('@default')).toBe(false);
      expect(isFlexibleDecorator('@distinct')).toBe(false);
      expect(isFlexibleDecorator('@sort')).toBe(false);
    });

    test('should return false for @flexible with parentheses', () => {
      expect(isFlexibleDecorator('@flexible()')).toBe(false);
      expect(isFlexibleDecorator('@flexible(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isFlexibleDecorator('flexible')).toBe(false);
      expect(isFlexibleDecorator('@FLEXIBLE')).toBe(false);
      expect(isFlexibleDecorator('@Flexible')).toBe(false);
    });
  });

  describe('parseFlexibleDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 10, offset: 9 },
    };

    test('should parse @flexible decorator', () => {
      const result = parseFlexibleDecorator(range);

      expect(result.type).toBe('flexible');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });

  describe('parseDecorators integration', () => {
    test('should parse @flexible from a field line', () => {
      const decorators = parseDecorators('address Address @flexible', 1);

      expect(decorators).toHaveLength(1);
      expect(decorators[0]!.type).toBe('flexible');
    });

    test('should parse @flexible alongside other decorators', () => {
      const decorators = parseDecorators('address Address @flexible @unique', 1);

      expect(decorators).toHaveLength(2);
      expect(decorators.some((d) => d.type === 'flexible')).toBe(true);
      expect(decorators.some((d) => d.type === 'unique')).toBe(true);
    });

    test('should not parse @flexible when not present', () => {
      const decorators = parseDecorators('name String @unique', 1);

      expect(decorators.some((d) => d.type === 'flexible')).toBe(false);
    });
  });
});
