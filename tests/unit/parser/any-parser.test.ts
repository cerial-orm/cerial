import { describe, expect, test } from 'bun:test';
import { getAnyFieldType, isAnyType } from '../../../src/parser/types/field-types/any-parser';

describe('any-parser', () => {
  test('isAnyType returns true for "Any"', () => {
    expect(isAnyType('Any')).toBe(true);
  });

  test('isAnyType returns false for other tokens', () => {
    expect(isAnyType('any')).toBe(false);
    expect(isAnyType('String')).toBe(false);
    expect(isAnyType('Int')).toBe(false);
    expect(isAnyType('Record')).toBe(false);
    expect(isAnyType('Bytes')).toBe(false);
    expect(isAnyType('')).toBe(false);
  });

  test('getAnyFieldType returns "any"', () => {
    expect(getAnyFieldType()).toBe('any');
  });
});
