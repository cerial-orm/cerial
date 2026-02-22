import { describe, expect, test } from 'bun:test';
import { Decimal } from 'surrealdb';
import { transformValue } from '../../../src/query/transformers/data-transformer';
import { CerialDecimal } from '../../../src/utils/cerial-decimal';

describe('Decimal Transform', () => {
  describe('transformValue for decimal', () => {
    test('transforms CerialDecimal to SDK Decimal', () => {
      const input = new CerialDecimal('99.99');
      const result = transformValue(input, 'decimal');
      expect(result instanceof Decimal).toBe(true);
      expect((result as Decimal).toString()).toBe('99.99');
    });

    test('passes through SDK Decimal unchanged', () => {
      const input = new Decimal('42.5');
      const result = transformValue(input, 'decimal');
      expect(result).toBe(input);
    });

    test('transforms number to SDK Decimal', () => {
      const result = transformValue(10.5, 'decimal');
      expect(result instanceof Decimal).toBe(true);
      expect((result as Decimal).toString()).toBe('10.5');
    });

    test('transforms string to SDK Decimal', () => {
      const result = transformValue('123.456', 'decimal');
      expect(result instanceof Decimal).toBe(true);
      expect((result as Decimal).toString()).toBe('123.456');
    });

    test('returns null for null', () => {
      expect(transformValue(null, 'decimal')).toBeNull();
    });

    test('returns undefined for undefined', () => {
      expect(transformValue(undefined, 'decimal')).toBeUndefined();
    });
  });
});
