import { describe, expect, test } from 'bun:test';
import { GeometryLine, GeometryPoint, GeometryPolygon } from 'surrealdb';
import { transformValue } from '../../../src/query/transformers/data-transformer';
import { CerialGeometry, CerialPoint, CerialPolygon } from '../../../src/utils/cerial-geometry';

describe('transformValue for geometry', () => {
  test('null passes through', () => {
    expect(transformValue(null, 'geometry')).toBeNull();
  });

  test('undefined passes through', () => {
    expect(transformValue(undefined, 'geometry')).toBeUndefined();
  });

  test('CerialPoint converts to GeometryPoint', () => {
    const point = new CerialPoint([1, 2]);
    const result = transformValue(point, 'geometry');
    expect(result).toBeInstanceOf(GeometryPoint);
    expect((result as GeometryPoint).point).toEqual([1, 2]);
  });

  test('CerialPolygon converts to GeometryPolygon', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const polygon = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    const result = transformValue(polygon, 'geometry');
    expect(result).toBeInstanceOf(GeometryPolygon);
  });

  test('SDK GeometryPoint passes through', () => {
    const native = new GeometryPoint([3, 4]);
    const result = transformValue(native, 'geometry');
    expect(result).toBe(native);
  });

  test('[lon, lat] tuple converts to GeometryPoint', () => {
    const result = transformValue([10, 20], 'geometry');
    expect(result).toBeInstanceOf(GeometryPoint);
    expect((result as GeometryPoint).point).toEqual([10, 20]);
  });

  test('GeoJSON Point object converts to GeometryPoint', () => {
    const result = transformValue({ type: 'Point', coordinates: [5, 6] }, 'geometry');
    expect(result).toBeInstanceOf(GeometryPoint);
    expect((result as GeometryPoint).point).toEqual([5, 6]);
  });

  test('GeoJSON Polygon object converts to GeometryPolygon', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const result = transformValue({ type: 'Polygon', coordinates: [ring] }, 'geometry');
    expect(result).toBeInstanceOf(GeometryPolygon);
  });

  test('non-geometry value passes through', () => {
    const result = transformValue('hello', 'geometry');
    expect(result).toBe('hello');
  });

  test('array that is not [lon, lat] passes through', () => {
    const arr = [1, 2, 3];
    const result = transformValue(arr, 'geometry');
    expect(result).toBe(arr);
  });

  test('object without type property passes through', () => {
    const obj = { foo: 'bar' };
    const result = transformValue(obj, 'geometry');
    expect(result).toBe(obj);
  });
});

describe('mapFieldValue for geometry', () => {
  const { mapFieldValue } = require('../../../src/query/mappers/result-mapper');

  test('null passes through', () => {
    expect(mapFieldValue(null, 'geometry')).toBeNull();
  });

  test('undefined passes through', () => {
    expect(mapFieldValue(undefined, 'geometry')).toBeUndefined();
  });

  test('GeometryPoint converts to CerialPoint', () => {
    const native = new GeometryPoint([1, 2]);
    const result = mapFieldValue(native, 'geometry');
    expect(CerialGeometry.is(result)).toBe(true);
    expect(result).toBeInstanceOf(CerialPoint);
    expect((result as CerialPoint).coordinates).toEqual([1, 2]);
  });

  test('GeometryPolygon converts to CerialPolygon', () => {
    const pts = [
      new GeometryPoint([0, 0]),
      new GeometryPoint([1, 0]),
      new GeometryPoint([1, 1]),
      new GeometryPoint([0, 0]),
    ];
    const line = new GeometryLine(pts as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
    const native = new GeometryPolygon([line]);
    const result = mapFieldValue(native, 'geometry');
    expect(CerialGeometry.is(result)).toBe(true);
    expect(result).toBeInstanceOf(CerialPolygon);
  });

  test('non-Geometry value passes through', () => {
    const result = mapFieldValue('hello', 'geometry');
    expect(result).toBe('hello');
  });
});
