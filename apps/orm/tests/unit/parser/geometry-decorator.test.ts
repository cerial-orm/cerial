import { describe, expect, test } from 'bun:test';
import {
  isGeometryDecorator,
  parseGeometryDecorator,
} from '../../../src/parser/types/field-decorators/geometry-decorator-parser';

const range = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 9 } };

describe('geometry-decorator-parser', () => {
  test('isGeometryDecorator returns true for all 7 geometry decorators', () => {
    expect(isGeometryDecorator('@point')).toBe(true);
    expect(isGeometryDecorator('@line')).toBe(true);
    expect(isGeometryDecorator('@polygon')).toBe(true);
    expect(isGeometryDecorator('@multipoint')).toBe(true);
    expect(isGeometryDecorator('@multiline')).toBe(true);
    expect(isGeometryDecorator('@multipolygon')).toBe(true);
    expect(isGeometryDecorator('@geoCollection')).toBe(true);
  });

  test('isGeometryDecorator returns false for non-geometry decorators', () => {
    expect(isGeometryDecorator('@default')).toBe(false);
    expect(isGeometryDecorator('@unique')).toBe(false);
    expect(isGeometryDecorator('@id')).toBe(false);
    expect(isGeometryDecorator('@nullable')).toBe(false);
    expect(isGeometryDecorator('@collection')).toBe(false);
    expect(isGeometryDecorator('point')).toBe(false);
    expect(isGeometryDecorator('')).toBe(false);
  });

  test('parseGeometryDecorator returns correct decorator for @point', () => {
    const result = parseGeometryDecorator('@point', range);
    expect(result.type).toBe('point');
    expect(result.range).toEqual(range);
  });

  test('parseGeometryDecorator returns correct decorator for @line', () => {
    const result = parseGeometryDecorator('@line', range);
    expect(result.type).toBe('line');
  });

  test('parseGeometryDecorator returns correct decorator for @polygon', () => {
    const result = parseGeometryDecorator('@polygon', range);
    expect(result.type).toBe('polygon');
  });

  test('parseGeometryDecorator returns correct decorator for @multipoint', () => {
    const result = parseGeometryDecorator('@multipoint', range);
    expect(result.type).toBe('multipoint');
  });

  test('parseGeometryDecorator returns correct decorator for @multiline', () => {
    const result = parseGeometryDecorator('@multiline', range);
    expect(result.type).toBe('multiline');
  });

  test('parseGeometryDecorator returns correct decorator for @multipolygon', () => {
    const result = parseGeometryDecorator('@multipolygon', range);
    expect(result.type).toBe('multipolygon');
  });

  test('parseGeometryDecorator returns correct decorator for @geoCollection', () => {
    const result = parseGeometryDecorator('@geoCollection', range);
    expect(result.type).toBe('geoCollection');
  });
});
