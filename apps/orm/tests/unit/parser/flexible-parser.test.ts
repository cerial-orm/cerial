/**
 * Unit Tests: Flexible Parser
 *
 * Tests parsing of @flexible decorator.
 */

import { describe, expect, test } from 'bun:test';
import { isDecoratorToken } from './registry/helpers';
import { parseFlexibleDecorator } from '../../../src/parser/types/field-decorators/flexible-parser';
import { parseDecorators } from '../../../src/parser/types/model/field-declaration-parser';

describe('Flexible Parser', () => {
  describe('matchDecoratorToken @flexible', () => {
    test('should return true for @flexible', () => {
      expect(isDecoratorToken('@flexible', '@flexible')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@flexible', '@id')).toBe(false);
      expect(isDecoratorToken('@flexible', '@unique')).toBe(false);
      expect(isDecoratorToken('@flexible', '@default')).toBe(false);
      expect(isDecoratorToken('@flexible', '@distinct')).toBe(false);
      expect(isDecoratorToken('@flexible', '@sort')).toBe(false);
    });

    test('should return false for @flexible with parentheses', () => {
      expect(isDecoratorToken('@flexible', '@flexible()')).toBe(false);
      expect(isDecoratorToken('@flexible', '@flexible(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@flexible', 'flexible')).toBe(false);
      expect(isDecoratorToken('@flexible', '@FLEXIBLE')).toBe(false);
      expect(isDecoratorToken('@flexible', '@Flexible')).toBe(false);
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
