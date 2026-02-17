/**
 * Unit Tests: Relation Parser
 *
 * Tests parsing of Relation field types.
 */

import { describe, expect, test } from 'bun:test';
import { isRelationType, parseRelationType } from '../../../src/parser/types/field-types/relation-parser';

describe('Relation Parser', () => {
  describe('isRelationType', () => {
    test('should return true for Relation type', () => {
      expect(isRelationType('Relation')).toBe(true);
    });

    test('should return false for other types', () => {
      expect(isRelationType('String')).toBe(false);
      expect(isRelationType('Record')).toBe(false);
      expect(isRelationType('Int')).toBe(false);
    });

    test('should be case sensitive', () => {
      expect(isRelationType('relation')).toBe(false);
      expect(isRelationType('RELATION')).toBe(false);
    });
  });

  describe('parseRelationType', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 9, offset: 8 },
    };

    test('should parse basic Relation type', () => {
      const result = parseRelationType('Relation', range, false);

      expect(result.type).toBe('relation');
      expect(result.isArray).toBe(false);
    });

    test('should parse Relation[] array type', () => {
      const result = parseRelationType('Relation', range, true);

      expect(result.type).toBe('relation');
      expect(result.isArray).toBe(true);
    });

    test('should preserve range information', () => {
      const result = parseRelationType('Relation', range, false);

      expect(result.range).toEqual(range);
    });
  });
});
