import { describe, expect, test } from 'bun:test';
import { isDurationType, getDurationFieldType } from '../../../src/parser/types/field-types/duration-parser';
import { parseFieldType } from '../../../src/parser/types/field-types';

describe('Duration Parser', () => {
  describe('isDurationType', () => {
    test('should return true for Duration', () => {
      expect(isDurationType('Duration')).toBe(true);
    });

    test('should return false for other types', () => {
      expect(isDurationType('String')).toBe(false);
      expect(isDurationType('duration')).toBe(false);
      expect(isDurationType('DURATION')).toBe(false);
      expect(isDurationType('Int')).toBe(false);
      expect(isDurationType('Date')).toBe(false);
      expect(isDurationType('Uuid')).toBe(false);
    });
  });

  describe('getDurationFieldType', () => {
    test('should return duration', () => {
      expect(getDurationFieldType()).toBe('duration');
    });
  });

  describe('parseFieldType integration', () => {
    test('should parse Duration to duration', () => {
      expect(parseFieldType('Duration')).toBe('duration');
    });

    test('should parse Duration[] to duration', () => {
      expect(parseFieldType('Duration[]')).toBe('duration');
    });

    test('should not conflict with other types', () => {
      expect(parseFieldType('String')).toBe('string');
      expect(parseFieldType('Int')).toBe('int');
      expect(parseFieldType('Date')).toBe('date');
      expect(parseFieldType('Bool')).toBe('bool');
      expect(parseFieldType('Float')).toBe('float');
      expect(parseFieldType('Uuid')).toBe('uuid');
    });
  });
});
