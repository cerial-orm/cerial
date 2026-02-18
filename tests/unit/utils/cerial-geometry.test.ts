import { describe, expect, test } from 'bun:test';
import {
  GeometryCollection,
  GeometryLine,
  GeometryMultiLine,
  GeometryMultiPoint,
  GeometryMultiPolygon,
  GeometryPoint,
  GeometryPolygon,
} from 'surrealdb';
import {
  CerialGeometry,
  CerialGeometryCollection,
  CerialLineString,
  CerialMultiLineString,
  CerialMultiPoint,
  CerialMultiPolygon,
  CerialPoint,
  CerialPolygon,
  isCerialGeometry,
} from '../../../src/utils/cerial-geometry';

// ─── CerialPoint ──────────────────────────────────────────────────────────────

describe('CerialPoint', () => {
  test('construct from [lon, lat] tuple', () => {
    const point = new CerialPoint([1.5, 2.5]);
    expect(point.type).toBe('Point');
    expect(point.coordinates).toEqual([1.5, 2.5]);
  });

  test('construct from GeoJSON', () => {
    const point = new CerialPoint({ type: 'Point', coordinates: [10, 20] });
    expect(point.coordinates).toEqual([10, 20]);
  });

  test('construct from GeometryPoint', () => {
    const native = new GeometryPoint([3, 4]);
    const point = new CerialPoint(native);
    expect(point.coordinates).toEqual([3, 4]);
  });

  test('construct from CerialPoint (copy)', () => {
    const original = new CerialPoint([5, 6]);
    const copy = new CerialPoint(original);
    expect(copy.coordinates).toEqual([5, 6]);
    expect(copy).not.toBe(original);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialPoint(42 as unknown as [number, number])).toThrow('Invalid CerialPoint input');
  });

  test('toJSON()', () => {
    const point = new CerialPoint([1, 2]);
    expect(point.toJSON()).toEqual({ type: 'Point', coordinates: [1, 2] });
  });

  test('toNative() returns GeometryPoint', () => {
    const point = new CerialPoint([1, 2]);
    const native = point.toNative();
    expect(native).toBeInstanceOf(GeometryPoint);
    expect(native.point).toEqual([1, 2]);
  });

  test('clone() creates independent copy', () => {
    const point = new CerialPoint([7, 8]);
    const cloned = point.clone();
    expect(cloned.coordinates).toEqual([7, 8]);
    expect(cloned).not.toBe(point);
  });

  test('equals() with same coordinates', () => {
    const a = new CerialPoint([1, 2]);
    const b = new CerialPoint([1, 2]);
    expect(a.equals(b)).toBe(true);
  });

  test('equals() with different coordinates', () => {
    const a = new CerialPoint([1, 2]);
    const b = new CerialPoint([3, 4]);
    expect(a.equals(b)).toBe(false);
  });

  test('equals() with non-CerialGeometry', () => {
    const a = new CerialPoint([1, 2]);
    expect(a.equals('not a geometry')).toBe(false);
    expect(a.equals(null)).toBe(false);
    expect(a.equals(undefined)).toBe(false);
  });

  test('equals() with different geometry type', () => {
    const point = new CerialPoint([1, 2]);
    const line = new CerialLineString({
      type: 'LineString',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(point.equals(line)).toBe(false);
  });

  test('toString() returns JSON string', () => {
    const point = new CerialPoint([1, 2]);
    expect(point.toString()).toBe(JSON.stringify({ type: 'Point', coordinates: [1, 2] }));
  });
});

// ─── CerialLineString ─────────────────────────────────────────────────────────

describe('CerialLineString', () => {
  const coords: [number, number][] = [
    [0, 0],
    [1, 1],
    [2, 0],
  ];

  test('construct from GeoJSON', () => {
    const line = new CerialLineString({ type: 'LineString', coordinates: coords });
    expect(line.type).toBe('LineString');
    expect(line.coordinates).toEqual(coords);
  });

  test('construct from GeometryLine', () => {
    const pts = coords.map((c) => new GeometryPoint(c));
    const native = new GeometryLine(pts as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
    const line = new CerialLineString(native);
    expect(line.coordinates).toEqual(coords);
  });

  test('construct from CerialLineString (copy)', () => {
    const original = new CerialLineString({ type: 'LineString', coordinates: coords });
    const copy = new CerialLineString(original);
    expect(copy.coordinates).toEqual(coords);
    expect(copy).not.toBe(original);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialLineString(42 as unknown as CerialLineString)).toThrow('Invalid CerialLineString input');
  });

  test('throws on too few points', () => {
    expect(() => new CerialLineString({ type: 'LineString', coordinates: [[0, 0]] })).toThrow(
      'A LineString requires at least 2 points',
    );
  });

  test('toJSON()', () => {
    const line = new CerialLineString({ type: 'LineString', coordinates: coords });
    expect(line.toJSON()).toEqual({ type: 'LineString', coordinates: coords });
  });

  test('toNative() returns GeometryLine', () => {
    const line = new CerialLineString({ type: 'LineString', coordinates: coords });
    expect(line.toNative()).toBeInstanceOf(GeometryLine);
  });

  test('clone()', () => {
    const line = new CerialLineString({ type: 'LineString', coordinates: coords });
    const cloned = line.clone();
    expect(cloned.coordinates).toEqual(coords);
    expect(cloned).not.toBe(line);
  });

  test('equals()', () => {
    const a = new CerialLineString({ type: 'LineString', coordinates: coords });
    const b = new CerialLineString({ type: 'LineString', coordinates: coords });
    expect(a.equals(b)).toBe(true);
  });
});

// ─── CerialPolygon ────────────────────────────────────────────────────────────

describe('CerialPolygon', () => {
  const ring: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  test('construct from GeoJSON', () => {
    const polygon = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    expect(polygon.type).toBe('Polygon');
    expect(polygon.coordinates).toEqual([ring]);
  });

  test('construct from GeometryPolygon', () => {
    const pts = ring.map((c) => new GeometryPoint(c));
    const line = new GeometryLine(pts as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
    const native = new GeometryPolygon([line]);
    const polygon = new CerialPolygon(native);
    expect(polygon.coordinates).toEqual([ring]);
  });

  test('construct from CerialPolygon (copy)', () => {
    const original = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    const copy = new CerialPolygon(original);
    expect(copy.coordinates).toEqual([ring]);
    expect(copy).not.toBe(original);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialPolygon(42 as unknown as CerialPolygon)).toThrow('Invalid CerialPolygon input');
  });

  test('throws on empty rings', () => {
    expect(() => new CerialPolygon({ type: 'Polygon', coordinates: [] })).toThrow('A Polygon requires at least 1 ring');
  });

  test('toJSON()', () => {
    const polygon = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    expect(polygon.toJSON()).toEqual({ type: 'Polygon', coordinates: [ring] });
  });

  test('toNative() returns GeometryPolygon', () => {
    const polygon = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    expect(polygon.toNative()).toBeInstanceOf(GeometryPolygon);
  });

  test('clone()', () => {
    const polygon = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    const cloned = polygon.clone();
    expect(cloned.coordinates).toEqual([ring]);
    expect(cloned).not.toBe(polygon);
  });

  test('equals()', () => {
    const a = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    const b = new CerialPolygon({ type: 'Polygon', coordinates: [ring] });
    expect(a.equals(b)).toBe(true);
  });
});

// ─── CerialMultiPoint ─────────────────────────────────────────────────────────

describe('CerialMultiPoint', () => {
  const coords: [number, number][] = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];

  test('construct from GeoJSON', () => {
    const mp = new CerialMultiPoint({ type: 'MultiPoint', coordinates: coords });
    expect(mp.type).toBe('MultiPoint');
    expect(mp.coordinates).toEqual(coords);
  });

  test('construct from GeometryMultiPoint', () => {
    const pts = coords.map((c) => new GeometryPoint(c));
    const native = new GeometryMultiPoint(pts as [GeometryPoint, ...GeometryPoint[]]);
    const mp = new CerialMultiPoint(native);
    expect(mp.coordinates).toEqual(coords);
  });

  test('construct from CerialMultiPoint (copy)', () => {
    const original = new CerialMultiPoint({ type: 'MultiPoint', coordinates: coords });
    const copy = new CerialMultiPoint(original);
    expect(copy.coordinates).toEqual(coords);
    expect(copy).not.toBe(original);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialMultiPoint(42 as unknown as CerialMultiPoint)).toThrow('Invalid CerialMultiPoint input');
  });

  test('throws on empty points', () => {
    expect(() => new CerialMultiPoint({ type: 'MultiPoint', coordinates: [] })).toThrow(
      'A MultiPoint requires at least 1 point',
    );
  });

  test('toJSON()', () => {
    const mp = new CerialMultiPoint({ type: 'MultiPoint', coordinates: coords });
    expect(mp.toJSON()).toEqual({ type: 'MultiPoint', coordinates: coords });
  });

  test('toNative()', () => {
    const mp = new CerialMultiPoint({ type: 'MultiPoint', coordinates: coords });
    expect(mp.toNative()).toBeInstanceOf(GeometryMultiPoint);
  });

  test('clone()', () => {
    const mp = new CerialMultiPoint({ type: 'MultiPoint', coordinates: coords });
    const cloned = mp.clone();
    expect(cloned.coordinates).toEqual(coords);
    expect(cloned).not.toBe(mp);
  });

  test('equals()', () => {
    const a = new CerialMultiPoint({ type: 'MultiPoint', coordinates: coords });
    const b = new CerialMultiPoint({ type: 'MultiPoint', coordinates: coords });
    expect(a.equals(b)).toBe(true);
  });
});

// ─── CerialMultiLineString ────────────────────────────────────────────────────

describe('CerialMultiLineString', () => {
  const lines: [number, number][][] = [
    [
      [0, 0],
      [1, 1],
    ],
    [
      [2, 2],
      [3, 3],
    ],
  ];

  test('construct from GeoJSON', () => {
    const mls = new CerialMultiLineString({ type: 'MultiLineString', coordinates: lines });
    expect(mls.type).toBe('MultiLineString');
    expect(mls.coordinates).toEqual(lines);
  });

  test('construct from GeometryMultiLine', () => {
    const nativeLines = lines.map((line) => {
      const pts = line.map((c) => new GeometryPoint(c));

      return new GeometryLine(pts as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
    });
    const native = new GeometryMultiLine(nativeLines as [GeometryLine, ...GeometryLine[]]);
    const mls = new CerialMultiLineString(native);
    expect(mls.coordinates).toEqual(lines);
  });

  test('construct from CerialMultiLineString (copy)', () => {
    const original = new CerialMultiLineString({ type: 'MultiLineString', coordinates: lines });
    const copy = new CerialMultiLineString(original);
    expect(copy.coordinates).toEqual(lines);
    expect(copy).not.toBe(original);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialMultiLineString(42 as unknown as CerialMultiLineString)).toThrow(
      'Invalid CerialMultiLineString input',
    );
  });

  test('throws on empty lines', () => {
    expect(() => new CerialMultiLineString({ type: 'MultiLineString', coordinates: [] })).toThrow(
      'A MultiLineString requires at least 1 line',
    );
  });

  test('toJSON()', () => {
    const mls = new CerialMultiLineString({ type: 'MultiLineString', coordinates: lines });
    expect(mls.toJSON()).toEqual({ type: 'MultiLineString', coordinates: lines });
  });

  test('toNative()', () => {
    const mls = new CerialMultiLineString({ type: 'MultiLineString', coordinates: lines });
    expect(mls.toNative()).toBeInstanceOf(GeometryMultiLine);
  });

  test('clone()', () => {
    const mls = new CerialMultiLineString({ type: 'MultiLineString', coordinates: lines });
    const cloned = mls.clone();
    expect(cloned.coordinates).toEqual(lines);
    expect(cloned).not.toBe(mls);
  });

  test('equals()', () => {
    const a = new CerialMultiLineString({ type: 'MultiLineString', coordinates: lines });
    const b = new CerialMultiLineString({ type: 'MultiLineString', coordinates: lines });
    expect(a.equals(b)).toBe(true);
  });
});

// ─── CerialMultiPolygon ───────────────────────────────────────────────────────

describe('CerialMultiPolygon', () => {
  const ring1: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ];
  const ring2: [number, number][] = [
    [2, 2],
    [3, 2],
    [3, 3],
    [2, 2],
  ];
  const polygons: [number, number][][][] = [[ring1], [ring2]];

  test('construct from GeoJSON', () => {
    const mp = new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: polygons });
    expect(mp.type).toBe('MultiPolygon');
    expect(mp.coordinates).toEqual(polygons);
  });

  test('construct from GeometryMultiPolygon', () => {
    const nativePolygons = polygons.map((rings) => {
      const nativeRings = rings.map((ring) => {
        const pts = ring.map((c) => new GeometryPoint(c));

        return new GeometryLine(pts as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
      });

      return new GeometryPolygon(nativeRings as [GeometryLine, ...GeometryLine[]]);
    });
    const native = new GeometryMultiPolygon(nativePolygons as [GeometryPolygon, ...GeometryPolygon[]]);
    const mp = new CerialMultiPolygon(native);
    expect(mp.coordinates).toEqual(polygons);
  });

  test('construct from CerialMultiPolygon (copy)', () => {
    const original = new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: polygons });
    const copy = new CerialMultiPolygon(original);
    expect(copy.coordinates).toEqual(polygons);
    expect(copy).not.toBe(original);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialMultiPolygon(42 as unknown as CerialMultiPolygon)).toThrow(
      'Invalid CerialMultiPolygon input',
    );
  });

  test('throws on empty polygons', () => {
    expect(() => new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: [] })).toThrow(
      'A MultiPolygon requires at least 1 polygon',
    );
  });

  test('toJSON()', () => {
    const mp = new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: polygons });
    expect(mp.toJSON()).toEqual({ type: 'MultiPolygon', coordinates: polygons });
  });

  test('toNative()', () => {
    const mp = new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: polygons });
    expect(mp.toNative()).toBeInstanceOf(GeometryMultiPolygon);
  });

  test('clone()', () => {
    const mp = new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: polygons });
    const cloned = mp.clone();
    expect(cloned.coordinates).toEqual(polygons);
    expect(cloned).not.toBe(mp);
  });

  test('equals()', () => {
    const a = new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: polygons });
    const b = new CerialMultiPolygon({ type: 'MultiPolygon', coordinates: polygons });
    expect(a.equals(b)).toBe(true);
  });
});

// ─── CerialGeometryCollection ─────────────────────────────────────────────────

describe('CerialGeometryCollection', () => {
  test('construct from GeoJSON', () => {
    const gc = new CerialGeometryCollection({
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 2] },
        {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    });
    expect(gc.type).toBe('GeometryCollection');
    expect(gc.geometries).toHaveLength(2);
    expect(gc.geometries[0]).toBeInstanceOf(CerialPoint);
    expect(gc.geometries[1]).toBeInstanceOf(CerialLineString);
  });

  test('construct from GeometryCollection', () => {
    const pt = new GeometryPoint([1, 2]);
    const line = new GeometryLine([new GeometryPoint([0, 0]), new GeometryPoint([1, 1])]);
    const native = new GeometryCollection([pt, line]);
    const gc = new CerialGeometryCollection(native);
    expect(gc.geometries).toHaveLength(2);
  });

  test('construct from CerialGeometryCollection (copy)', () => {
    const original = new CerialGeometryCollection({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
    const copy = new CerialGeometryCollection(original);
    expect(copy.geometries).toHaveLength(1);
    expect(copy).not.toBe(original);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialGeometryCollection(42 as unknown as CerialGeometryCollection)).toThrow(
      'Invalid CerialGeometryCollection input',
    );
  });

  test('toJSON()', () => {
    const gc = new CerialGeometryCollection({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
    expect(gc.toJSON()).toEqual({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
  });

  test('toNative()', () => {
    const gc = new CerialGeometryCollection({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
    expect(gc.toNative()).toBeInstanceOf(GeometryCollection);
  });

  test('clone()', () => {
    const gc = new CerialGeometryCollection({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
    const cloned = gc.clone();
    expect(cloned.geometries).toHaveLength(1);
    expect(cloned).not.toBe(gc);
  });

  test('equals()', () => {
    const a = new CerialGeometryCollection({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
    const b = new CerialGeometryCollection({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
    expect(a.equals(b)).toBe(true);
  });
});

// ─── Static Methods ───────────────────────────────────────────────────────────

describe('CerialGeometry static methods', () => {
  test('is() returns true for CerialGeometry instances', () => {
    expect(CerialGeometry.is(new CerialPoint([1, 2]))).toBe(true);
    expect(
      CerialGeometry.is(
        new CerialLineString({
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        }),
      ),
    ).toBe(true);
  });

  test('is() returns false for non-CerialGeometry', () => {
    expect(CerialGeometry.is(null)).toBe(false);
    expect(CerialGeometry.is(undefined)).toBe(false);
    expect(CerialGeometry.is('string')).toBe(false);
    expect(CerialGeometry.is(42)).toBe(false);
    expect(CerialGeometry.is(new GeometryPoint([1, 2]))).toBe(false);
  });

  test('isNative() returns true for SDK Geometry', () => {
    expect(CerialGeometry.isNative(new GeometryPoint([1, 2]))).toBe(true);
    expect(CerialGeometry.isNative(new GeometryLine([new GeometryPoint([0, 0]), new GeometryPoint([1, 1])]))).toBe(
      true,
    );
  });

  test('isNative() returns false for non-SDK Geometry', () => {
    expect(CerialGeometry.isNative(new CerialPoint([1, 2]))).toBe(false);
    expect(CerialGeometry.isNative(null)).toBe(false);
    expect(CerialGeometry.isNative('string')).toBe(false);
  });

  test('fromNative() converts all SDK types', () => {
    expect(CerialGeometry.fromNative(new GeometryPoint([1, 2]))).toBeInstanceOf(CerialPoint);
    expect(
      CerialGeometry.fromNative(new GeometryLine([new GeometryPoint([0, 0]), new GeometryPoint([1, 1])])),
    ).toBeInstanceOf(CerialLineString);

    const ring = [
      new GeometryPoint([0, 0]),
      new GeometryPoint([1, 0]),
      new GeometryPoint([1, 1]),
      new GeometryPoint([0, 0]),
    ];
    const polyLine = new GeometryLine(ring as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
    expect(CerialGeometry.fromNative(new GeometryPolygon([polyLine]))).toBeInstanceOf(CerialPolygon);

    expect(CerialGeometry.fromNative(new GeometryMultiPoint([new GeometryPoint([1, 2])]))).toBeInstanceOf(
      CerialMultiPoint,
    );

    expect(
      CerialGeometry.fromNative(
        new GeometryMultiLine([new GeometryLine([new GeometryPoint([0, 0]), new GeometryPoint([1, 1])])]),
      ),
    ).toBeInstanceOf(CerialMultiLineString);

    expect(CerialGeometry.fromNative(new GeometryMultiPolygon([new GeometryPolygon([polyLine])]))).toBeInstanceOf(
      CerialMultiPolygon,
    );

    expect(CerialGeometry.fromNative(new GeometryCollection([new GeometryPoint([1, 2])]))).toBeInstanceOf(
      CerialGeometryCollection,
    );
  });

  test('from() handles [lon, lat] tuple', () => {
    const result = CerialGeometry.from([1, 2]);
    expect(result).toBeInstanceOf(CerialPoint);
    expect((result as CerialPoint).coordinates).toEqual([1, 2]);
  });

  test('from() handles GeoJSON Point', () => {
    const result = CerialGeometry.from({ type: 'Point', coordinates: [1, 2] });
    expect(result).toBeInstanceOf(CerialPoint);
  });

  test('from() handles GeoJSON LineString', () => {
    const result = CerialGeometry.from({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(result).toBeInstanceOf(CerialLineString);
  });

  test('from() handles GeoJSON Polygon', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const result = CerialGeometry.from({ type: 'Polygon', coordinates: [ring] });
    expect(result).toBeInstanceOf(CerialPolygon);
  });

  test('from() handles GeoJSON MultiPoint', () => {
    const result = CerialGeometry.from({
      type: 'MultiPoint',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(result).toBeInstanceOf(CerialMultiPoint);
  });

  test('from() handles GeoJSON MultiLineString', () => {
    const result = CerialGeometry.from({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    });
    expect(result).toBeInstanceOf(CerialMultiLineString);
  });

  test('from() handles GeoJSON MultiPolygon', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const result = CerialGeometry.from({ type: 'MultiPolygon', coordinates: [[ring]] });
    expect(result).toBeInstanceOf(CerialMultiPolygon);
  });

  test('from() handles GeoJSON GeometryCollection', () => {
    const result = CerialGeometry.from({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    });
    expect(result).toBeInstanceOf(CerialGeometryCollection);
  });

  test('from() handles CerialGeometry (clones)', () => {
    const original = new CerialPoint([1, 2]);
    const result = CerialGeometry.from(original);
    expect(result).toBeInstanceOf(CerialPoint);
    expect(result).not.toBe(original);
    expect(result.equals(original)).toBe(true);
  });

  test('from() handles SDK Geometry', () => {
    const native = new GeometryPoint([1, 2]);
    const result = CerialGeometry.from(native);
    expect(result).toBeInstanceOf(CerialPoint);
  });

  test('from() throws on unknown GeoJSON type', () => {
    expect(() => CerialGeometry.from({ type: 'Unknown', coordinates: [1, 2] } as unknown as CerialPoint)).toThrow(
      'Unknown GeoJSON type',
    );
  });

  test('from() throws on invalid input', () => {
    expect(() => CerialGeometry.from(42 as unknown as CerialPoint)).toThrow('Invalid CerialGeometry input');
  });
});

// ─── Standalone Type Guard ────────────────────────────────────────────────────

describe('isCerialGeometry', () => {
  test('returns true for CerialGeometry instances', () => {
    expect(isCerialGeometry(new CerialPoint([1, 2]))).toBe(true);
  });

  test('returns false for non-CerialGeometry', () => {
    expect(isCerialGeometry(null)).toBe(false);
    expect(isCerialGeometry(new GeometryPoint([1, 2]))).toBe(false);
  });
});
