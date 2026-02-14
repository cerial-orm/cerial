---
title: Special Operators
parent: Filtering
nav_order: 5
---

# Special Operators

Special operators handle null checks, absence checks, range queries, and SurrealDB's unique `NONE` value semantics. The available operators depend on the field's schema modifiers (`?` and `@nullable`).

## Operator Availability

| Operator    | Available on          | Description                          |
| ----------- | --------------------- | ------------------------------------ |
| `isNull`    | `@nullable` fields    | Checks if the field value is `null`  |
| `isNone`    | `?` (optional) fields | Checks if the field is absent (NONE) |
| `isDefined` | `?` (optional) fields | Inverse of `isNone`                  |
| `between`   | Comparable fields     | Inclusive range check                |

The type system enforces these rules — `isNull` only appears in the Where type for `@nullable` fields, and `isNone`/`isDefined` only appear for optional (`?`) fields.

## isNull

Checks whether a `@nullable` field has a `null` value. Only available on fields with `@nullable`.

**Find records where a field is null:**

```typescript
// Schema: deletedAt Date @nullable
const deleted = await db.User.findMany({
  where: { deletedAt: { isNull: false } },
});
// SurrealQL: WHERE deletedAt != NULL
```

**Find records where a field is NOT null:**

```typescript
const active = await db.User.findMany({
  where: { deletedAt: { isNull: true } },
});
// SurrealQL: WHERE deletedAt = NULL
```

### eq: null and neq: null

You can also use `eq` and `neq` with `null` directly on `@nullable` fields:

```typescript
// Equivalent to isNull: true
await db.User.findMany({
  where: { deletedAt: { eq: null } },
});

// Equivalent to isNull: false
await db.User.findMany({
  where: { deletedAt: { neq: null } },
});
```

## isNone

Checks whether an optional (`?`) field is absent (NONE) on the record. Only available on fields with `?`.

**Find records where a field is absent (NONE):**

```typescript
// Schema: bio String?
const noBio = await db.User.findMany({
  where: { bio: { isNone: true } },
});
// SurrealQL: WHERE bio = NONE
```

**Find records where a field exists (has any value):**

```typescript
const hasBio = await db.User.findMany({
  where: { bio: { isNone: false } },
});
// SurrealQL: WHERE bio != NONE
```

## isDefined

An alias for `isNone` with inverted semantics. Only available on optional (`?`) fields.

```typescript
// Equivalent to isNone: false
await db.User.findMany({
  where: { bio: { isDefined: true } },
});
// SurrealQL: WHERE bio != NONE

// Equivalent to isNone: true
await db.User.findMany({
  where: { bio: { isDefined: false } },
});
// SurrealQL: WHERE bio = NONE
```

## NONE vs null vs Value

Understanding the three states is essential when working with fields that have both `?` and `@nullable`:

| State     | Field exists? | Has value? | Matched by                                          |
| --------- | ------------- | ---------- | --------------------------------------------------- |
| `NONE`    | No            | No         | `isNone: true`, `isDefined: false`                  |
| `null`    | Yes           | No (null)  | `isNull: true`                                      |
| `'hello'` | Yes           | Yes        | `isNone: false`, `isNull: false`, `isDefined: true` |

This three-state distinction only applies to fields with **both** `?` and `@nullable`. Fields with only `?` have two states (value or NONE). Fields with only `@nullable` have two states (value or null).

```typescript
// Schema: bio String? @nullable — has all three states

// NONE — field is absent from the record
await db.User.create({ data: { name: 'Alice' } });
// Stored: { name: 'Alice' } (no bio field)

// null — field exists with null value
await db.User.create({ data: { name: 'Bob', bio: null } });
// Stored: { name: 'Bob', bio: null }

// Value — field exists with a value
await db.User.create({ data: { name: 'Carol', bio: 'Hello!' } });
// Stored: { name: 'Carol', bio: 'Hello!' }
```

Querying the differences:

```typescript
// Only Alice (bio field absent)
await db.User.findMany({ where: { bio: { isNone: true } } });

// Only Bob (bio is null)
await db.User.findMany({ where: { bio: { isNull: true } } });

// Bob and Carol (bio field exists, regardless of value)
await db.User.findMany({ where: { bio: { isNone: false } } });

// Alice and Carol (bio is not null — NONE is also not null)
await db.User.findMany({ where: { bio: { isNull: false } } });
```

## between

Performs an inclusive range check. The value must be a two-element tuple `[min, max]`:

```typescript
const users = await db.User.findMany({
  where: { age: { between: [18, 65] } },
});
// Equivalent to: age >= 18 AND age <= 65
```

### With Numbers

```typescript
const products = await db.Product.findMany({
  where: { price: { between: [10.0, 99.99] } },
});
```

### With Dates

```typescript
const posts = await db.Post.findMany({
  where: {
    createdAt: {
      between: [new Date('2024-01-01'), new Date('2024-12-31')],
    },
  },
});
```

### With Strings

String ranges use lexicographic ordering:

```typescript
const users = await db.User.findMany({
  where: { name: { between: ['A', 'M'] } },
});
// Matches names from 'A' through 'M' (inclusive)
```

## Combining Special Operators

Special operators can be combined with all other filter operators:

```typescript
const users = await db.User.findMany({
  where: {
    age: { between: [18, 65] },
    deletedAt: { isNull: true },
    bio: { isNone: false },
    status: { neq: 'banned' },
  },
});
```

```typescript
const users = await db.User.findMany({
  where: {
    OR: [{ bio: { isNone: true } }, { bio: { isNull: true } }],
  },
});
// Matches users who either have no bio field or have bio set to null
// (only valid on fields with both ? and @nullable)
```
