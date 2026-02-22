/**
 * CerialGeometry - Geometry class hierarchy wrapping SurrealDB SDK geometry types
 *
 * Abstract base + 7 concrete subclasses matching SurrealDB's geometry types:
 * Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection
 */

import {
  Geometry,
  GeometryCollection,
  GeometryLine,
  GeometryMultiLine,
  GeometryMultiPoint,
  GeometryMultiPolygon,
  GeometryPoint,
  GeometryPolygon,
} from 'surrealdb';

// ─── Geometry Subtype Discriminant ────────────────────────────────────────────

export type CerialGeometryType =
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon'
  | 'GeometryCollection';

// ─── GeoJSON Types ────────────────────────────────────────────────────────────

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface GeoJsonMultiPoint {
  type: 'MultiPoint';
  coordinates: [number, number][];
}

export interface GeoJsonMultiLineString {
  type: 'MultiLineString';
  coordinates: [number, number][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}

export interface GeoJsonCollection {
  type: 'GeometryCollection';
  geometries: GeoJsonGeometry[];
}

export type GeoJsonGeometry =
  | GeoJsonPoint
  | GeoJsonLineString
  | GeoJsonPolygon
  | GeoJsonMultiPoint
  | GeoJsonMultiLineString
  | GeoJsonMultiPolygon
  | GeoJsonCollection;

// ─── Input Types ──────────────────────────────────────────────────────────────

export type CerialPointInput = [number, number] | GeoJsonPoint | CerialPoint | GeometryPoint;

export type CerialLineStringInput = GeoJsonLineString | CerialLineString | GeometryLine;

export type CerialPolygonInput = GeoJsonPolygon | CerialPolygon | GeometryPolygon;

export type CerialMultiPointInput = GeoJsonMultiPoint | CerialMultiPoint | GeometryMultiPoint;

export type CerialMultiLineStringInput = GeoJsonMultiLineString | CerialMultiLineString | GeometryMultiLine;

export type CerialMultiPolygonInput = GeoJsonMultiPolygon | CerialMultiPolygon | GeometryMultiPolygon;

export type CerialGeometryCollectionInput = GeoJsonCollection | CerialGeometryCollection | GeometryCollection;

export type CerialGeometryInput =
  | CerialPointInput
  | CerialLineStringInput
  | CerialPolygonInput
  | CerialMultiPointInput
  | CerialMultiLineStringInput
  | CerialMultiPolygonInput
  | CerialGeometryCollectionInput;

// ─── Helper: convert [lon, lat][] to GeometryPoint[] ──────────────────────────

function toGeometryPoints(coords: [number, number][]): GeometryPoint[] {
  return coords.map((c) => new GeometryPoint(c));
}

function toGeometryLines(coords: [number, number][][]): GeometryLine[] {
  return coords.map((ring) => {
    const pts = toGeometryPoints(ring);
    if (pts.length < 2) throw new Error('A line requires at least 2 points');

    return new GeometryLine(pts as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
  });
}

function toGeometryPolygons(coords: [number, number][][][]): GeometryPolygon[] {
  return coords.map((rings) => {
    const lines = toGeometryLines(rings);
    if (!lines.length) throw new Error('A polygon requires at least 1 ring');

    return new GeometryPolygon(lines as [GeometryLine, ...GeometryLine[]]);
  });
}

// ─── Abstract Base ────────────────────────────────────────────────────────────

export abstract class CerialGeometry {
  abstract readonly type: CerialGeometryType;

  /** Check if a value is any CerialGeometry instance */
  static is(value: unknown): value is CerialGeometry {
    return value instanceof CerialGeometry;
  }

  /** Check if a value is an SDK Geometry instance */
  static isNative(value: unknown): value is Geometry {
    return value instanceof Geometry;
  }

  /** Factory: convert SDK Geometry → CerialGeometry */
  static fromNative(native: Geometry): CerialGeometry {
    if (native instanceof GeometryPoint) return new CerialPoint(native);
    if (native instanceof GeometryLine) return new CerialLineString(native);
    if (native instanceof GeometryPolygon) return new CerialPolygon(native);
    if (native instanceof GeometryMultiPoint) return new CerialMultiPoint(native);
    if (native instanceof GeometryMultiLine) return new CerialMultiLineString(native);
    if (native instanceof GeometryMultiPolygon) return new CerialMultiPolygon(native);
    if (native instanceof GeometryCollection) return new CerialGeometryCollection(native);
    throw new Error(`Unknown SDK Geometry type: ${native.constructor.name}`);
  }

  /** Factory: convert any CerialGeometryInput → CerialGeometry */
  static from(input: CerialGeometryInput): CerialGeometry {
    if (input instanceof CerialGeometry) return input.clone();
    if (input instanceof Geometry) return CerialGeometry.fromNative(input);

    // Tuple shorthand for point
    if (Array.isArray(input)) return new CerialPoint(input);

    // GeoJSON objects
    if (typeof input === 'object' && input !== null && 'type' in input) {
      switch (input.type) {
        case 'Point':
          return new CerialPoint(input as GeoJsonPoint);
        case 'LineString':
          return new CerialLineString(input as GeoJsonLineString);
        case 'Polygon':
          return new CerialPolygon(input as GeoJsonPolygon);
        case 'MultiPoint':
          return new CerialMultiPoint(input as GeoJsonMultiPoint);
        case 'MultiLineString':
          return new CerialMultiLineString(input as GeoJsonMultiLineString);
        case 'MultiPolygon':
          return new CerialMultiPolygon(input as GeoJsonMultiPolygon);
        case 'GeometryCollection':
          return new CerialGeometryCollection(input as GeoJsonCollection);
        default:
          throw new Error(`Unknown GeoJSON type: ${(input as { type: string }).type}`);
      }
    }

    throw new Error(`Invalid CerialGeometry input: ${typeof input}`);
  }

  abstract toJSON(): GeoJsonGeometry;
  abstract toNative(): Geometry;
  abstract clone(): CerialGeometry;

  equals(other: unknown): boolean {
    if (!(other instanceof CerialGeometry)) return false;
    if (this.type !== other.type) return false;

    return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}

// ─── CerialPoint ──────────────────────────────────────────────────────────────

export class CerialPoint extends CerialGeometry {
  readonly type = 'Point' as const;
  private readonly _native: GeometryPoint;

  constructor(input: CerialPointInput) {
    super();
    if (input instanceof CerialPoint) {
      this._native = input._native.clone();
    } else if (input instanceof GeometryPoint) {
      this._native = input;
    } else if (Array.isArray(input)) {
      this._native = new GeometryPoint(input);
    } else if (typeof input === 'object' && input !== null && input.type === 'Point') {
      this._native = new GeometryPoint(input.coordinates);
    } else {
      throw new Error(`Invalid CerialPoint input`);
    }
  }

  get coordinates(): [number, number] {
    return this._native.point;
  }

  toJSON(): GeoJsonPoint {
    return { type: 'Point', coordinates: [...this._native.point] as [number, number] };
  }

  toNative(): GeometryPoint {
    return this._native.clone();
  }

  clone(): CerialPoint {
    return new CerialPoint(this);
  }
}

// ─── CerialLineString ─────────────────────────────────────────────────────────

export class CerialLineString extends CerialGeometry {
  readonly type = 'LineString' as const;
  private readonly _native: GeometryLine;

  constructor(input: CerialLineStringInput) {
    super();
    if (input instanceof CerialLineString) {
      this._native = input._native.clone();
    } else if (input instanceof GeometryLine) {
      this._native = input;
    } else if (typeof input === 'object' && input !== null && input.type === 'LineString') {
      const pts = toGeometryPoints(input.coordinates);
      if (pts.length < 2) throw new Error('A LineString requires at least 2 points');
      this._native = new GeometryLine(pts as [GeometryPoint, GeometryPoint, ...GeometryPoint[]]);
    } else {
      throw new Error(`Invalid CerialLineString input`);
    }
  }

  get coordinates(): [number, number][] {
    return this._native.line.map((p) => [...p.point] as [number, number]);
  }

  toJSON(): GeoJsonLineString {
    return { type: 'LineString', coordinates: this.coordinates };
  }

  toNative(): GeometryLine {
    return this._native.clone();
  }

  clone(): CerialLineString {
    return new CerialLineString(this);
  }
}

// ─── CerialPolygon ────────────────────────────────────────────────────────────

export class CerialPolygon extends CerialGeometry {
  readonly type = 'Polygon' as const;
  private readonly _native: GeometryPolygon;

  constructor(input: CerialPolygonInput) {
    super();
    if (input instanceof CerialPolygon) {
      this._native = input._native.clone();
    } else if (input instanceof GeometryPolygon) {
      this._native = input;
    } else if (typeof input === 'object' && input !== null && input.type === 'Polygon') {
      const lines = toGeometryLines(input.coordinates);
      if (!lines.length) throw new Error('A Polygon requires at least 1 ring');
      this._native = new GeometryPolygon(lines as [GeometryLine, ...GeometryLine[]]);
    } else {
      throw new Error(`Invalid CerialPolygon input`);
    }
  }

  get coordinates(): [number, number][][] {
    return this._native.polygon.map((line) => line.line.map((p) => [...p.point] as [number, number]));
  }

  toJSON(): GeoJsonPolygon {
    return { type: 'Polygon', coordinates: this.coordinates };
  }

  toNative(): GeometryPolygon {
    return this._native.clone();
  }

  clone(): CerialPolygon {
    return new CerialPolygon(this);
  }
}

// ─── CerialMultiPoint ─────────────────────────────────────────────────────────

export class CerialMultiPoint extends CerialGeometry {
  readonly type = 'MultiPoint' as const;
  private readonly _native: GeometryMultiPoint;

  constructor(input: CerialMultiPointInput) {
    super();
    if (input instanceof CerialMultiPoint) {
      this._native = input._native.clone();
    } else if (input instanceof GeometryMultiPoint) {
      this._native = input;
    } else if (typeof input === 'object' && input !== null && input.type === 'MultiPoint') {
      const pts = toGeometryPoints(input.coordinates);
      if (!pts.length) throw new Error('A MultiPoint requires at least 1 point');
      this._native = new GeometryMultiPoint(pts as [GeometryPoint, ...GeometryPoint[]]);
    } else {
      throw new Error(`Invalid CerialMultiPoint input`);
    }
  }

  get coordinates(): [number, number][] {
    return this._native.points.map((p) => [...p.point] as [number, number]);
  }

  toJSON(): GeoJsonMultiPoint {
    return { type: 'MultiPoint', coordinates: this.coordinates };
  }

  toNative(): GeometryMultiPoint {
    return this._native.clone();
  }

  clone(): CerialMultiPoint {
    return new CerialMultiPoint(this);
  }
}

// ─── CerialMultiLineString ────────────────────────────────────────────────────

export class CerialMultiLineString extends CerialGeometry {
  readonly type = 'MultiLineString' as const;
  private readonly _native: GeometryMultiLine;

  constructor(input: CerialMultiLineStringInput) {
    super();
    if (input instanceof CerialMultiLineString) {
      this._native = input._native.clone();
    } else if (input instanceof GeometryMultiLine) {
      this._native = input;
    } else if (typeof input === 'object' && input !== null && input.type === 'MultiLineString') {
      const lines = toGeometryLines(input.coordinates);
      if (!lines.length) throw new Error('A MultiLineString requires at least 1 line');
      this._native = new GeometryMultiLine(lines as [GeometryLine, ...GeometryLine[]]);
    } else {
      throw new Error(`Invalid CerialMultiLineString input`);
    }
  }

  get coordinates(): [number, number][][] {
    return this._native.lines.map((line) => line.line.map((p) => [...p.point] as [number, number]));
  }

  toJSON(): GeoJsonMultiLineString {
    return { type: 'MultiLineString', coordinates: this.coordinates };
  }

  toNative(): GeometryMultiLine {
    return this._native.clone();
  }

  clone(): CerialMultiLineString {
    return new CerialMultiLineString(this);
  }
}

// ─── CerialMultiPolygon ───────────────────────────────────────────────────────

export class CerialMultiPolygon extends CerialGeometry {
  readonly type = 'MultiPolygon' as const;
  private readonly _native: GeometryMultiPolygon;

  constructor(input: CerialMultiPolygonInput) {
    super();
    if (input instanceof CerialMultiPolygon) {
      this._native = input._native.clone();
    } else if (input instanceof GeometryMultiPolygon) {
      this._native = input;
    } else if (typeof input === 'object' && input !== null && input.type === 'MultiPolygon') {
      const polys = toGeometryPolygons(input.coordinates);
      if (!polys.length) throw new Error('A MultiPolygon requires at least 1 polygon');
      this._native = new GeometryMultiPolygon(polys as [GeometryPolygon, ...GeometryPolygon[]]);
    } else {
      throw new Error(`Invalid CerialMultiPolygon input`);
    }
  }

  get coordinates(): [number, number][][][] {
    return this._native.polygons.map((poly) =>
      poly.polygon.map((line) => line.line.map((p) => [...p.point] as [number, number])),
    );
  }

  toJSON(): GeoJsonMultiPolygon {
    return { type: 'MultiPolygon', coordinates: this.coordinates };
  }

  toNative(): GeometryMultiPolygon {
    return this._native.clone();
  }

  clone(): CerialMultiPolygon {
    return new CerialMultiPolygon(this);
  }
}

// ─── CerialGeometryCollection ─────────────────────────────────────────────────

export class CerialGeometryCollection extends CerialGeometry {
  readonly type = 'GeometryCollection' as const;
  private readonly _geometries: CerialGeometry[];
  private readonly _native: GeometryCollection;

  constructor(input: CerialGeometryCollectionInput) {
    super();
    if (input instanceof CerialGeometryCollection) {
      this._geometries = input._geometries.map((g) => g.clone());
      const natives = this._geometries.map((g) => g.toNative());
      if (!natives.length) throw new Error('A GeometryCollection requires at least 1 geometry');
      this._native = new GeometryCollection(natives as [Geometry, ...Geometry[]]);
    } else if (input instanceof GeometryCollection) {
      this._native = input;
      this._geometries = input.collection.map((g) => CerialGeometry.fromNative(g));
    } else if (typeof input === 'object' && input !== null && input.type === 'GeometryCollection') {
      this._geometries = input.geometries.map((g) => CerialGeometry.from(g));
      const natives = this._geometries.map((g) => g.toNative());
      if (!natives.length) throw new Error('A GeometryCollection requires at least 1 geometry');
      this._native = new GeometryCollection(natives as [Geometry, ...Geometry[]]);
    } else {
      throw new Error(`Invalid CerialGeometryCollection input`);
    }
  }

  get geometries(): CerialGeometry[] {
    return [...this._geometries];
  }

  toJSON(): GeoJsonCollection {
    return {
      type: 'GeometryCollection',
      geometries: this._geometries.map((g) => g.toJSON()),
    };
  }

  toNative(): GeometryCollection {
    return this._native.clone();
  }

  clone(): CerialGeometryCollection {
    return new CerialGeometryCollection(this);
  }
}

// ─── Standalone Type Guard ────────────────────────────────────────────────────

export function isCerialGeometry(value: unknown): value is CerialGeometry {
  return CerialGeometry.is(value);
}
