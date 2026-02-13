---
title: Where Filtering
parent: Tuples
nav_order: 3
---

# Where Filtering on Tuples

Tuple fields support element-level filtering in `where` clauses. You can filter by named keys, index keys, or use comparison operators.

## Named Key Filtering

For tuples with named elements, use the element name as the key:

```cerial
tuple Coordinate {
  lat Float,
  lng Float
}
```

```typescript
// Exact match (shorthand for eq)
const results = await db.User.findMany({
  where: { location: { lat: 40.7 } },
});

// Multiple element conditions (AND)
const results = await db.User.findMany({
  where: { location: { lat: 40.7, lng: -74.0 } },
});
```

## Index Key Filtering

For tuples with unnamed elements (or as an alternative to names), use the index as a string key:

```cerial
tuple Pair {
  Int,
  Int
}
```

```typescript
const results = await db.Model.findMany({
  where: { pair: { '0': 42 } },
});
```

Index keys work on named tuples too:

```typescript
// These are equivalent
await db.User.findMany({ where: { location: { lat: 40.7 } } });
await db.User.findMany({ where: { location: { '0': 40.7 } } });
```

## Comparison Operators

Tuple element filters support the same comparison operators as regular fields:

```typescript
// Greater than
await db.User.findMany({
  where: { location: { lat: { gt: 40 } } },
});

// Range
await db.User.findMany({
  where: { location: { lat: { gte: 30, lte: 50 } } },
});

// Not equal
await db.User.findMany({
  where: { location: { lng: { neq: 0 } } },
});
```

Available operators depend on the element type:

| Element Type | Operators                                                        |
| ------------ | ---------------------------------------------------------------- |
| `Int/Float`  | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`             |
| `String`     | `eq`, `neq`, `contains`, `startsWith`, `endsWith`, `in`, `notIn` |
| `Bool`       | `eq`, `neq`                                                      |
| `Date`       | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`                            |

## Logical Operators

Combine tuple conditions with `AND`, `OR`, and `NOT`:

```typescript
await db.User.findMany({
  where: {
    OR: [{ location: { lat: { gt: 50 } } }, { location: { lng: { lt: -100 } } }],
  },
});
```

## Array Tuple Quantifiers

For array tuple fields (`Coordinate[]`), use quantifiers to filter:

```typescript
// At least one tuple matches
await db.User.findMany({
  where: { history: { some: { lat: { gt: 40 } } } },
});

// All tuples match
await db.User.findMany({
  where: { history: { every: { lat: { gt: 0 } } } },
});

// No tuples match
await db.User.findMany({
  where: { history: { none: { lat: { lt: 0 } } } },
});
```

## Generated Where Type

For `tuple Coordinate { lat Float, lng Float }`:

```typescript
export interface CoordinateWhere {
  lat?:
    | number
    | {
        eq?: number;
        neq?: number;
        gt?: number;
        gte?: number;
        lt?: number;
        lte?: number;
        in?: number[];
        notIn?: number[];
      };
  lng?:
    | number
    | {
        eq?: number;
        neq?: number;
        gt?: number;
        gte?: number;
        lt?: number;
        lte?: number;
        in?: number[];
        notIn?: number[];
      };
  0?:
    | number
    | {
        /* same operators */
      };
  1?:
    | number
    | {
        /* same operators */
      };
  AND?: CoordinateWhere[];
  OR?: CoordinateWhere[];
  NOT?: CoordinateWhere;
}
```

Both named keys (`lat`, `lng`) and index keys (`0`, `1`) are available. At query time, both translate to index-based SurrealDB field access (`location[0]`, `location[1]`).
