/**
 * Unit Tests: OnDelete Parser
 *
 * Tests parsing of @onDelete(action) decorator.
 */

import { describe, expect, test } from 'bun:test';
import {
  isOnDeleteDecorator,
  extractOnDeleteAction,
  parseOnDeleteDecorator,
  isValidOnDeleteAction,
} from '../../../src/parser/types/field-decorators/ondelete-parser';

describe('OnDelete Parser', () => {
  describe('isOnDeleteDecorator', () => {
    test('should return true for valid @onDelete decorator', () => {
      expect(isOnDeleteDecorator('@onDelete(Cascade)')).toBe(true);
    });

    test('should return true for all valid actions', () => {
      expect(isOnDeleteDecorator('@onDelete(Cascade)')).toBe(true);
      expect(isOnDeleteDecorator('@onDelete(SetNull)')).toBe(true);
      expect(isOnDeleteDecorator('@onDelete(Restrict)')).toBe(true);
      expect(isOnDeleteDecorator('@onDelete(NoAction)')).toBe(true);
    });

    test('should return false for @onDelete without parentheses', () => {
      expect(isOnDeleteDecorator('@onDelete')).toBe(false);
    });

    test('should return false for other decorators', () => {
      expect(isOnDeleteDecorator('@id')).toBe(false);
      expect(isOnDeleteDecorator('@key(author)')).toBe(false);
    });
  });

  describe('extractOnDeleteAction', () => {
    test('should extract Cascade action', () => {
      expect(extractOnDeleteAction('@onDelete(Cascade)')).toBe('Cascade');
    });

    test('should extract SetNull action', () => {
      expect(extractOnDeleteAction('@onDelete(SetNull)')).toBe('SetNull');
    });

    test('should extract Restrict action', () => {
      expect(extractOnDeleteAction('@onDelete(Restrict)')).toBe('Restrict');
    });

    test('should extract NoAction action', () => {
      expect(extractOnDeleteAction('@onDelete(NoAction)')).toBe('NoAction');
    });

    test('should return undefined for invalid format', () => {
      expect(extractOnDeleteAction('@onDelete')).toBeUndefined();
      expect(extractOnDeleteAction('@onDelete()')).toBeUndefined();
    });
  });

  describe('isValidOnDeleteAction', () => {
    test('should return true for valid actions', () => {
      expect(isValidOnDeleteAction('Cascade')).toBe(true);
      expect(isValidOnDeleteAction('SetNull')).toBe(true);
      expect(isValidOnDeleteAction('Restrict')).toBe(true);
      expect(isValidOnDeleteAction('NoAction')).toBe(true);
    });

    test('should return false for invalid actions', () => {
      expect(isValidOnDeleteAction('cascade')).toBe(false);
      expect(isValidOnDeleteAction('DELETE')).toBe(false);
      expect(isValidOnDeleteAction('Invalid')).toBe(false);
    });
  });

  describe('parseOnDeleteDecorator', () => {
    const range = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 18, offset: 17 },
    };

    test('should parse Cascade action', () => {
      const result = parseOnDeleteDecorator('@onDelete(Cascade)', range);

      expect(result.type).toBe('onDelete');
      expect(result.value).toBe('Cascade');
    });

    test('should parse all valid actions', () => {
      expect(parseOnDeleteDecorator('@onDelete(SetNull)', range).value).toBe(
        'SetNull'
      );
      expect(parseOnDeleteDecorator('@onDelete(Restrict)', range).value).toBe(
        'Restrict'
      );
      expect(parseOnDeleteDecorator('@onDelete(NoAction)', range).value).toBe(
        'NoAction'
      );
    });

    test('should handle invalid action gracefully', () => {
      const result = parseOnDeleteDecorator('@onDelete(Invalid)', range);
      expect(result.type).toBe('onDelete');
      expect(result.value).toBeUndefined(); // Invalid actions return undefined
    });
  });
});
