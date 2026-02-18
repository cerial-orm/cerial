import { describe, expect, test } from 'bun:test';
import { Duration } from 'surrealdb';
import { mapFieldValue } from '../../../src/query/mappers/result-mapper';
import { transformValue } from '../../../src/query/transformers/data-transformer';
import { CerialDuration } from '../../../src/utils/cerial-duration';
import { validateFieldType } from '../../../src/utils/validation-utils';

describe('Duration Transform Pipeline', () => {
  describe('transformValue for duration', () => {
    test('should convert CerialDuration to SDK Duration', () => {
      const input = new CerialDuration('1h30m');
      const result = transformValue(input, 'duration');
      expect(result).toBeInstanceOf(Duration);
    });

    test('should pass through SDK Duration', () => {
      const input = new Duration('45m');
      const result = transformValue(input, 'duration');
      expect(result).toBeInstanceOf(Duration);
    });

    test('should convert string to SDK Duration', () => {
      const result = transformValue('2h', 'duration');
      expect(result).toBeInstanceOf(Duration);
    });

    test('should pass through null', () => {
      expect(transformValue(null, 'duration')).toBe(null);
    });

    test('should pass through undefined', () => {
      expect(transformValue(undefined, 'duration')).toBe(undefined);
    });
  });

  describe('mapFieldValue for duration', () => {
    test('should convert SDK Duration to CerialDuration', () => {
      const input = new Duration('1h');
      const result = mapFieldValue(input, 'duration');
      expect(result).toBeInstanceOf(CerialDuration);
    });

    test('should convert string to CerialDuration', () => {
      const result = mapFieldValue('30m', 'duration');
      expect(result).toBeInstanceOf(CerialDuration);
    });

    test('should pass through null', () => {
      expect(mapFieldValue(null, 'duration')).toBe(null);
    });

    test('should pass through undefined', () => {
      expect(mapFieldValue(undefined, 'duration')).toBe(undefined);
    });
  });

  describe('validateFieldType for duration', () => {
    test('should accept CerialDuration', () => {
      expect(validateFieldType(new CerialDuration('1h'), 'duration')).toBe(true);
    });

    test('should accept SDK Duration', () => {
      expect(validateFieldType(new Duration('30m'), 'duration')).toBe(true);
    });

    test('should accept duration string', () => {
      expect(validateFieldType('2h30m', 'duration')).toBe(true);
    });

    test('should reject number', () => {
      expect(validateFieldType(123, 'duration')).toBe(false);
    });

    test('should reject boolean', () => {
      expect(validateFieldType(true, 'duration')).toBe(false);
    });

    test('should reject null', () => {
      expect(validateFieldType(null, 'duration')).toBe(false);
    });
  });
});
