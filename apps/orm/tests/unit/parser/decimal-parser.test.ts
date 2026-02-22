import { describe, expect, test } from 'bun:test';
import { getDecimalFieldType, isDecimalType } from '../../../src/parser/types/field-types/decimal-parser';

describe('Decimal Parser', () => {
  describe('isDecimalType', () => {
    test('returns true for "Decimal"', () => {
      expect(isDecimalType('Decimal')).toBe(true);
    });

    test('returns false for other types', () => {
      expect(isDecimalType('decimal')).toBe(false);
      expect(isDecimalType('Float')).toBe(false);
      expect(isDecimalType('Number')).toBe(false);
      expect(isDecimalType('Int')).toBe(false);
      expect(isDecimalType('String')).toBe(false);
      expect(isDecimalType('')).toBe(false);
    });
  });

  describe('getDecimalFieldType', () => {
    test('returns "decimal"', () => {
      expect(getDecimalFieldType()).toBe('decimal');
    });
  });
});
