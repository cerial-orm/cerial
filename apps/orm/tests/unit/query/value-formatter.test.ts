/**
 * Unit tests for formatValue, the exported helper that builds literal (non-bound) query text
 */

import { describe, expect, test } from 'bun:test';
import { formatValue } from '../../../src/query/transformers';

describe('formatValue', () => {
  test('a string keeps its closing quote when it ends in a backslash', () => {
    expect(formatValue('end\\', 'string')).toBe('"end\\\\"');
  });

  test('a backslash before a quote is escaped, then the quote', () => {
    expect(formatValue('\\"', 'string')).toBe('"\\\\\\""');
  });

  test('a plain string is only wrapped in quotes', () => {
    expect(formatValue('hello', 'string')).toBe('"hello"');
  });

  test('a Date prints as an ISO datetime literal', () => {
    expect(formatValue(new Date('2026-01-02T03:04:05.000Z'), 'date')).toBe('d"2026-01-02T03:04:05.000Z"');
  });

  test('a date string is normalised through the parser', () => {
    expect(formatValue('2026-01-02T03:04:05Z', 'date')).toBe('d"2026-01-02T03:04:05.000Z"');
  });

  test.each(['not a date', ''])('refuses %j as a date', (value) => {
    expect(() => formatValue(value, 'date')).toThrow('as a date');
  });

  test('a date string the parser accepts leniently prints only its normalised form', () => {
    expect(formatValue('2026-01-02"', 'date')).toBe('d"2026-01-02T00:00:00.000Z"');
  });

  test('a scalar of an unlisted type prints bare', () => {
    expect(formatValue(12, 'any')).toBe('12');
    expect(formatValue(true, 'any')).toBe('true');
    expect(formatValue(10n, 'any')).toBe('10');
  });

  test('a non-scalar of an unlisted type is quoted and escaped', () => {
    expect(formatValue({ toString: () => 'x"y' }, 'any')).toBe('"x\\"y"');
  });

  test('NONE, NULL, int, float and bool are unchanged', () => {
    expect(formatValue(undefined, 'string')).toBe('NONE');
    expect(formatValue(null, 'string')).toBe('NULL');
    expect(formatValue(3.9, 'int')).toBe('3');
    expect(formatValue(1.5, 'float')).toBe('1.5');
    expect(formatValue(0, 'bool')).toBe('false');
  });
});
