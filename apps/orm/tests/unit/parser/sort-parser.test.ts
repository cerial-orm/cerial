/**
 * Unit Tests: Sort Parser
 *
 * Tests parsing of @sort decorator.
 * Supports: @sort, @sort(), @sort(true), @sort(false), @sort(asc), @sort(desc)
 */

import { describe, expect, test } from 'bun:test';
import { generateModelDefineStatements } from '../../../src/generators/migrations/define-generator';
import { parse } from '../../../src/parser/parser';
import {
  extractSortValue,
  hasValidSortArgument,
  isSortDecorator,
  parseSortDecorator,
} from '../../../src/parser/types/field-decorators/sort-parser';
import { parseModelRegistry } from '../../test-helpers';

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

    test('should return true for @sort(asc)', () => {
      expect(extractSortValue('@sort(asc)')).toBe(true);
    });

    test('should return false for @sort(desc)', () => {
      expect(extractSortValue('@sort(desc)')).toBe(false);
    });

    test('should throw on an unrecognised argument instead of defaulting to ascending', () => {
      for (const token of ['@sort(invalid)', '@sort(DESC)', '@sort(1)', '@sort(true, false)']) {
        expect(() => extractSortValue(token)).toThrow('Invalid @sort argument');
      }
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

  describe('hasValidSortArgument', () => {
    test('should accept no argument, empty parentheses, true, false, asc and desc', () => {
      for (const token of [
        '@sort',
        '@sort()',
        '@sort(true)',
        '@sort(false)',
        '@sort( false )',
        '@sort(asc)',
        '@sort(desc)',
      ]) {
        expect(hasValidSortArgument(token)).toBe(true);
      }
    });

    test('should reject any other argument', () => {
      for (const token of ['@sort(invalid)', '@sort(DESC)', '@sort(1)', '@sort(true, false)']) {
        expect(hasValidSortArgument(token)).toBe(false);
      }
    });
  });

  describe('parsing a schema', () => {
    const modelWith = (decorator: string) => `
model Test {
  id Record @id
  scores Int[] ${decorator}
}`;

    test.each(['@sort(bogus)', '@sort(1)', '@sort(true, false)'])('should report a parse error for %s', (decorator) => {
      const { errors, ast } = parse(modelWith(decorator));

      expect(errors.some((e) => e.message.includes(decorator) && e.message.includes('invalid argument'))).toBe(true);
      expect(ast.models[0]?.fields.find((f) => f.name === 'scores')?.decorators.some((d) => d.type === 'sort')).toBe(
        false,
      );
    });

    test.each([
      '@sort',
      '@sort()',
      '@sort(true)',
      '@sort(false)',
      '@sort(asc)',
      '@sort(desc)',
    ])('should accept %s without errors', (decorator) => {
      const { errors, ast } = parse(modelWith(decorator));

      expect(errors).toEqual([]);
      expect(ast.models[0]?.fields.find((f) => f.name === 'scores')?.decorators.some((d) => d.type === 'sort')).toBe(
        true,
      );
    });
  });
});

describe('@sort direction reaches the emitted DDL', () => {
  const ddl = (decorator: string) =>
    generateModelDefineStatements(
      parseModelRegistry(`model Test {\n  id Record @id\n  scores Int[] ${decorator}\n}`).Test!,
    ).join('\n');

  test.each([
    ['@sort(desc)', '.sort(false)'],
    ['@sort(false)', '.sort(false)'],
    ['@sort(asc)', '.sort(true)'],
    ['@sort(true)', '.sort(true)'],
    ['@sort', '.sort(true)'],
  ])('%s emits %s', (decorator, expected) => {
    expect(ddl(decorator)).toContain(expected);
  });

  test('@sort(desc) does not emit an ascending sort', () => {
    expect(ddl('@sort(desc)')).not.toContain('.sort(true)');
  });
});
