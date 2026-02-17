---
title: Any
parent: Field Types
grand_parent: Schema
nav_order: 14
---

# Any

A pass-through type that stores any SurrealDB value. Output and input use the `CerialAny` recursive union type — never bare TypeScript `any`.

## Schema Syntax

```cerial
model Flexible {
  id Record @id
  data Any
  items Any[]
}
```

## Types

| Direction | Type        |
| --------- | ----------- |
| Output    | `CerialAny` |
| Input     | `CerialAny` |
| SurrealDB | `any`       |

`CerialAny` is a recursive union:

```typescript
type CerialAny =
  | string
  | number
  | boolean
  | Date
  | CerialId
  | CerialUuid
  | CerialDuration
  | CerialDecimal
  | CerialBytes
  | CerialGeometry
  | null
  | CerialAny[]
  | { [key: string]: CerialAny };
```

## Modifiers

| Modifier | Effect              |
| -------- | ------------------- |
| `[]`     | Array of any values |

`?` (optional) and `@nullable` are **not allowed** on Any fields. SurrealDB's `TYPE any` natively accepts both NONE (absent) and null values, so `CerialAny` already includes `null` in its union.

## Decorators

Any fields support the following decorators:

| Decorator        | Effect                                                          |
| ---------------- | --------------------------------------------------------------- |
| `@default(val)`  | Sets a default value when the field is omitted on create        |
| `@defaultAlways` | Resets to the default value on every create/update when omitted |
| `@readonly`      | Field is set on create only — excluded from update types        |
| `@index`         | Creates a database index on the field                           |
| `@unique`        | Creates a unique index — duplicate values are rejected          |
| `@sort`          | Array fields only — values are automatically sorted             |
| `@distinct`      | Array fields only — duplicate values are automatically removed  |

```cerial
model Config {
  id Record @id
  payload Any @default("none")
  snapshot Any @readonly
  lookup Any @index
  tags Any[] @distinct
}
```

## Filtering

Any fields support the full operator set. SurrealDB handles type mismatches gracefully at query time.

```typescript
// Equality
where: { data: { eq: 'hello' } }

// Numeric comparison
where: { data: { gt: 10, lte: 100 } }

// String operators
where: { data: { contains: 'sub' } }

// Array operators
where: { data: { in: [1, 2, 3] } }

// Between
where: { data: { between: [0, 100] } }

```

## Ordering

Any fields are excluded from `OrderBy` types since mixed types make ordering ambiguous.

## Embedded Usage

Any works in object types:

```cerial
object FlexInfo {
  data Any
  label String
}
```

## Limitations

- No `?` (optional) or `@nullable` — `CerialAny` already includes null, and SurrealDB `TYPE any` natively accepts NONE
- No ordering support — mixed types make ordering ambiguous
- Not considered a primitive type
- Not supported in tuple elements (SurrealDB cannot express `any` in typed tuple literals)
- The transformer and mapper pass values through without conversion
