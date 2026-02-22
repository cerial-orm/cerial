import { describe, expect, test } from 'bun:test';
import { getGeometryFieldType, isGeometryType } from '../../../src/parser/types/field-types/geometry-parser';

describe('geometry-parser', () => {
  test('isGeometryType returns true for Geometry', () => {
    expect(isGeometryType('Geometry')).toBe(true);
  });

  test('isGeometryType returns false for other tokens', () => {
    expect(isGeometryType('geometry')).toBe(false);
    expect(isGeometryType('GEOMETRY')).toBe(false);
    expect(isGeometryType('String')).toBe(false);
    expect(isGeometryType('Point')).toBe(false);
    expect(isGeometryType('')).toBe(false);
  });

  test('getGeometryFieldType returns geometry', () => {
    expect(getGeometryFieldType()).toBe('geometry');
  });
});
