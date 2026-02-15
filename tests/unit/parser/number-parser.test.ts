import { describe, it, expect } from 'bun:test';
import { getNumberFieldType, isNumberType } from '../../../src/parser/types/field-types/number-parser';

describe('Number parser', () => {
  describe('isNumberType', () => {
    it('returns true for "Number"', () => {
      expect(isNumberType('Number')).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isNumberType('Int')).toBe(false);
      expect(isNumberType('Float')).toBe(false);
      expect(isNumberType('String')).toBe(false);
      expect(isNumberType('number')).toBe(false);
      expect(isNumberType('NUMBER')).toBe(false);
    });
  });

  describe('getNumberFieldType', () => {
    it('returns "number" schema field type', () => {
      expect(getNumberFieldType()).toBe('number');
    });
  });
});
