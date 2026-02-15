---
title: Geometry
parent: Field Types
grand_parent: Schema
nav_order: 13
---

# Geometry

Geospatial data stored using SurrealDB's native `geometry` type. Output is a `CerialGeometry` class instance; input accepts GeoJSON objects, `[lon, lat]` shorthand (for points), or `CerialGeometry` instances.

## Schema Syntax

```cerial
model Location {
  id Record @id
  point Geometry @point
  area Geometry @polygon
  route Geometry @line
  shape Geometry
  multi Geometry @point @polygon
  optionalGeo Geometry? @point
  geoArray Geometry[] @point
}
```

## Subtype Decorators

Geometry fields support 7 subtype decorators that constrain which geometry types the field accepts:

| Decorator        | SurrealDB Type           | Output Type                | Input Type                      |
| ---------------- | ------------------------ | -------------------------- | ------------------------------- |
| `@point`         | `geometry<point>`        | `CerialPoint`              | `CerialPointInput`              |
| `@line`          | `geometry<line>`         | `CerialLineString`         | `CerialLineStringInput`         |
| `@polygon`       | `geometry<polygon>`      | `CerialPolygon`            | `CerialPolygonInput`            |
| `@multipoint`    | `geometry<multipoint>`   | `CerialMultiPoint`         | `CerialMultiPointInput`         |
| `@multiline`     | `geometry<multiline>`    | `CerialMultiLineString`    | `CerialMultiLineStringInput`    |
| `@multipolygon`  | `geometry<multipolygon>` | `CerialMultiPolygon`       | `CerialMultiPolygonInput`       |
| `@geoCollection` | `geometry<collection>`   | `CerialGeometryCollection` | `CerialGeometryCollectionInput` |
| _(none)_         | all 7 subtypes           | `CerialGeometry`           | `CerialGeometryInput`           |

### Multi-Type Fields

Multiple decorators create a union type:

```cerial
multi Geometry @point @polygon
```

- **Output**: `CerialPoint | CerialPolygon`
- **Input**: `CerialPointInput | CerialPolygonInput`
- **Migration**: `geometry<point | polygon>`

### No Decorator

A bare `Geometry` field accepts any geometry subtype:

```cerial
shape Geometry
```

- **Output**: `CerialGeometry` (abstract base class)
- **Input**: `CerialGeometryInput` (union of all input types)
- **Migration**: `geometry<point | line | polygon | multipoint | multiline | multipolygon | collection>`

## CerialGeometry API

```typescript
import { CerialGeometry, CerialPoint, CerialLineString, CerialPolygon } from 'cerial';

// CerialPoint — from [lon, lat] shorthand
const point = new CerialPoint([1.5, 2.5]);
point.coordinates; // [1.5, 2.5]
point.type; // 'Point'

// CerialPoint — from GeoJSON
const point2 = new CerialPoint({ type: 'Point', coordinates: [10, 20] });

// CerialLineString — from GeoJSON
const line = new CerialLineString({
  type: 'LineString',
  coordinates: [
    [0, 0],
    [1, 1],
    [2, 0],
  ],
});
line.coordinates; // [[0, 0], [1, 1], [2, 0]]

// CerialPolygon — from GeoJSON
const polygon = new CerialPolygon({
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
});
polygon.coordinates; // [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]

// Common methods (all geometry types)
point.toJSON(); // { type: 'Point', coordinates: [1.5, 2.5] }
point.toNative(); // SurrealDB SDK GeometryPoint
point.clone(); // new CerialPoint copy
point.equals(other); // deep equality check
point.toString(); // JSON string

// Static methods
CerialGeometry.is(value); // type guard
CerialGeometry.from(input); // any input → CerialGeometry
CerialGeometry.fromNative(sdkGeo); // SDK Geometry → CerialGeometry
```

## Input Types

Each subtype accepts multiple input formats:

### CerialPointInput

- `[lon, lat]` — tuple shorthand
- `{ type: 'Point', coordinates: [lon, lat] }` — GeoJSON
- `CerialPoint` — existing instance
- `GeometryPoint` — SurrealDB SDK type

### Other Subtypes

All other subtypes accept GeoJSON objects, `CerialGeometry` instances, and SDK types. Only `CerialPointInput` supports the `[lon, lat]` tuple shorthand.

## Usage

```typescript
// Create with [lon, lat] shorthand
const loc = await db.Location.create({
  data: {
    point: [1.5, 2.5],
    area: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    route: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [5, 5],
      ],
    },
    shape: [10, 20],
    multi: [3, 4],
  },
});

// Output is CerialPoint
loc.point; // CerialPoint instance
loc.point.coordinates; // [1.5, 2.5]

// Create with CerialPoint instance
const loc2 = await db.Location.create({
  data: {
    point: new CerialPoint([7, 8]),
    // ...
  },
});
```

## Filtering

Geometry fields support equality and set operators only. Comparison operators (`gt`, `lt`, `gte`, `lte`, `between`) and string operators are **not** available.

```typescript
// Direct equality
const locs = await db.Location.findMany({
  where: { point: [1.5, 2.5] },
});

// Equality operators
const match = await db.Location.findMany({
  where: { point: { eq: [1.5, 2.5] } },
});

// Set operators
const specific = await db.Location.findMany({
  where: {
    point: {
      in: [
        [1, 2],
        [3, 4],
      ],
    },
  },
});

// Array operators
const hasPoint = await db.Location.findMany({
  where: { geoArray: { has: [1, 2] } },
});
```

## Limitations

- **No `@default` support** — Geometry fields do not support the `@default` decorator.
- **No OrderBy** — Geometry fields are excluded from `OrderBy` types. SurrealDB does not support ordering by geometry values.
- **Equality-only filtering** — No comparison operators (`gt`, `lt`, `gte`, `lte`, `between`). Use `eq`, `neq`, `in`, `notIn` only.
- **No spatial operators** — Spatial functions (`nearTo`, `within`, `intersects`) are not yet supported in WHERE clauses.
- **Tuple elements** — Geometry in tuple elements always uses the generic `CerialGeometry`/`CerialGeometryInput` types (subtype decorators are not supported on tuple elements).
