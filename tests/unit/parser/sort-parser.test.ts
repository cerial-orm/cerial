/**
 * Unit Tests: Sort Parser
 *
 * Tests parsing of @sort decorator.
 * Supports: @sort, @sort(), @sort(true), @sort(false)
 */

import { describe, expect, test } from 'bun:test';
import {
  isSortDecorator,
  extractSortValue,
  parseSortDecorator,
} from '../../../src/parser/types/field-decorators/sort-parser';

describe('Sort Parser', () => {
  describe('isSortDecorator', () => {
    test('should return true for @sort without parentheses', () => {
      expect(isSortDecorator('@sort')).toBe(true);
    });

    test('should return true for @sort with empty parentheses', () => {
      expect(isSortDecorator('@sort()')).toBe(true);
    });

    test('should return true for @sort(true)', () => {
      expect(isSortDecorator('@sort(true)')).toBe(true);
    });

    test('should return true for @sort(false)', () => {
      expect(isSortDecorator('@sort(false)')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isSortDecorator('@id')).toBe(false);
      expect(isSortDecorator('@unique')).toBe(false);
      expect(isSortDecorator('@distinct')).toBe(false);
      expect(isSortDecorator('@default')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isSortDecorator('sort')).toBe(false);
      expect(isSortDecorator('@SORT')).toBe(false);
      expect(isSortDecorator('@Sort')).toBe(false);
    });
  });

  describe('extractSortValue', () => {
    test('should return true for @sort (ascending default)', () => {
      expect(extractSortValue('@sort')).toBe(true);
    });

    test('should return true for @sort() (ascending default)', () => {
      expect(extractSortValue('@sort()')).toBe(true);
    });

    test('should return true for @sort(true)', () => {
      expect(extractSortValue('@sort(true)')).toBe(true);
    });

    test('should return false for @sort(false)', () => {
      expect(extractSortValue('@sort(false)')).toBe(false);
    });

    test('should return true for invalid values (default to ascending)', () => {
      expect(extractSortValue('@sort(invalid)')).toBe(true);
      expect(extractSortValue('@sort(asc)')).toBe(true);
      expect(extractSortValue('@sort(desc)')).toBe(true);
    });
  });

  describe('parseSortDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 12, offset: 11 },
    };

    test('should parse @sort decorator with value true', () => {
      const result = parseSortDecorator('@sort', range);

      expect(result.type).toBe('sort');
      expect(result.value).toBe(true);
      expect(result.range).toEqual(range);
    });

    test('should parse @sort() decorator with value true', () => {
      const result = parseSortDecorator('@sort()', range);

      expect(result.type).toBe('sort');
      expect(result.value).toBe(true);
    });

    test('should parse @sort(true) decorator with value true', () => {
      const result = parseSortDecorator('@sort(true)', range);

      expect(result.type).toBe('sort');
      expect(result.value).toBe(true);
    });

    test('should parse @sort(false) decorator with value false', () => {
      const result = parseSortDecorator('@sort(false)', range);

      expect(result.type).toBe('sort');
      expect(result.value).toBe(false);
    });
  });
});
