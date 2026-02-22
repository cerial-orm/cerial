/**
 * Unit Tests: Readonly Parser
 *
 * Tests parsing of @readonly decorator.
 */

import { describe, expect, test } from 'bun:test';
import {
  isReadonlyDecorator,
  parseReadonlyDecorator,
} from '../../../src/parser/types/field-decorators/readonly-parser';
import { parseDecorators } from '../../../src/parser/types/model/field-declaration-parser';

describe('Readonly Parser', () => {
  describe('isReadonlyDecorator', () => {
    test('should return true for @readonly', () => {
      expect(isReadonlyDecorator('@readonly')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isReadonlyDecorator('@id')).toBe(false);
      expect(isReadonlyDecorator('@unique')).toBe(false);
      expect(isReadonlyDecorator('@default')).toBe(false);
      expect(isReadonlyDecorator('@flexible')).toBe(false);
      expect(isReadonlyDecorator('@now')).toBe(false);
      expect(isReadonlyDecorator('@createdAt')).toBe(false);
    });

    test('should return false for @readonly with parentheses', () => {
      expect(isReadonlyDecorator('@readonly()')).toBe(false);
      expect(isReadonlyDecorator('@readonly(true)')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isReadonlyDecorator('readonly')).toBe(false);
      expect(isReadonlyDecorator('@READONLY')).toBe(false);
      expect(isReadonlyDecorator('@Readonly')).toBe(false);
    });
  });

  describe('parseReadonlyDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 10, offset: 9 },
    };

    test('should parse @readonly decorator', () => {
      const result = parseReadonlyDecorator(range);

      expect(result.type).toBe('readonly');
      expect(result.value).toBeUndefined();
      expect(result.range).toEqual(range);
    });
  });

  describe('parseDecorators integration', () => {
    test('should parse @readonly from a field line', () => {
      const decorators = parseDecorators('code String @readonly', 1);

      expect(decorators).toHaveLength(1);
      expect(decorators[0]!.type).toBe('readonly');
    });

    test('should parse @readonly alongside other decorators', () => {
      const decorators = parseDecorators('createdBy String @readonly @default("system")', 1);

      expect(decorators).toHaveLength(2);
      expect(decorators.some((d) => d.type === 'readonly')).toBe(true);
      expect(decorators.some((d) => d.type === 'default')).toBe(true);
    });

    test('should parse @readonly with @unique', () => {
      const decorators = parseDecorators('email Email @readonly @unique', 1);

      expect(decorators).toHaveLength(2);
      expect(decorators.some((d) => d.type === 'readonly')).toBe(true);
      expect(decorators.some((d) => d.type === 'unique')).toBe(true);
    });

    test('should parse @readonly with @createdAt', () => {
      const decorators = parseDecorators('lockedAt Date @readonly @createdAt', 1);

      expect(decorators).toHaveLength(2);
      expect(decorators.some((d) => d.type === 'readonly')).toBe(true);
      expect(decorators.some((d) => d.type === 'createdAt')).toBe(true);
    });

    test('should not parse @readonly when not present', () => {
      const decorators = parseDecorators('name String @unique', 1);

      expect(decorators.some((d) => d.type === 'readonly')).toBe(false);
    });
  });
});
