import { describe, expect, test } from 'bun:test';
import { getBytesFieldType, isBytesType } from '../../../src/parser/types/field-types/bytes-parser';

describe('bytes-parser', () => {
  test('isBytesType returns true for Bytes', () => {
    expect(isBytesType('Bytes')).toBe(true);
  });

  test('isBytesType returns false for other tokens', () => {
    expect(isBytesType('bytes')).toBe(false);
    expect(isBytesType('BYTES')).toBe(false);
    expect(isBytesType('String')).toBe(false);
    expect(isBytesType('Uint8Array')).toBe(false);
    expect(isBytesType('')).toBe(false);
  });

  test('getBytesFieldType returns bytes', () => {
    expect(getBytesFieldType()).toBe('bytes');
  });
});
