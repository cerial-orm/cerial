import { describe, expect, test } from 'bun:test';
import { isUuidType, getUuidFieldType } from '../../../src/parser/types/field-types/uuid-parser';
import { parseFieldType } from '../../../src/parser/types/field-types';

describe('UUID Parser', () => {
  describe('isUuidType', () => {
    test('should return true for Uuid', () => {
      expect(isUuidType('Uuid')).toBe(true);
    });

    test('should return false for other types', () => {
      expect(isUuidType('String')).toBe(false);
      expect(isUuidType('uuid')).toBe(false);
      expect(isUuidType('UUID')).toBe(false);
      expect(isUuidType('Int')).toBe(false);
      expect(isUuidType('Date')).toBe(false);
    });
  });

  describe('getUuidFieldType', () => {
    test('should return uuid', () => {
      expect(getUuidFieldType()).toBe('uuid');
    });
  });

  describe('parseFieldType integration', () => {
    test('should parse Uuid to uuid', () => {
      expect(parseFieldType('Uuid')).toBe('uuid');
    });

    test('should parse Uuid[] to uuid', () => {
      expect(parseFieldType('Uuid[]')).toBe('uuid');
    });

    test('should not conflict with other types', () => {
      expect(parseFieldType('String')).toBe('string');
      expect(parseFieldType('Int')).toBe('int');
      expect(parseFieldType('Date')).toBe('date');
      expect(parseFieldType('Bool')).toBe('bool');
      expect(parseFieldType('Float')).toBe('float');
    });
  });
});
