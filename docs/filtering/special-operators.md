---
title: Special Operators
parent: Filtering
nav_order: 5
---

# Special Operators

Special operators handle null checks, range queries, and SurrealDB's unique `NONE` value semantics.

## isNull

Checks whether a field has a `null` value. This is distinct from checking if a field is absent (see [isNone](#isnone) below).

**Find records where a field is null:**

```typescript
const users = await db.User.findMany({
  where: { deletedAt: { isNull: true } },
});
// SurrealQL: WHERE deletedAt = NULL
```

**Find records where a field is NOT null:**

```typescript
const users = await db.User.findMany({
  where: { deletedAt: { isNull: false } },
});
// SurrealQL: WHERE deletedAt != NULL
```

### eq: null and neq: null

You can also use `eq` and `neq` with `null` directly:

```typescript
// Equivalent to isNull: true
const users = await db.User.findMany({
  where: { deletedAt: { eq: null } },
});
// SurrealQL: WHERE deletedAt = NULL

// Equivalent to isNull: false
const users = await db.User.findMany({
  where: { deletedAt: { neq: null } },
});
// SurrealQL: WHERE deletedAt != NULL
```

Note that `neq: null` matches fields that are not null — but the field could still be `NONE` (absent). If you need to check whether a field exists at all, use `isNone`.

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

## isNone

SurrealDB distinguishes between `null` (field exists with a null value) and `NONE` (field doesn't exist on the record at all). The `isNone` operator lets you filter based on this distinction.

**Find records where a field is absent (NONE):**

```typescript
const users = await db.User.findMany({
  where: { bio: { isNone: true } },
});
// SurrealQL: WHERE bio = NONE
```

**Find records where a field exists (could be null or have a value):**

```typescript
const users = await db.User.findMany({
  where: { bio: { isNone: false } },
});
// SurrealQL: WHERE bio != NONE
```

### NONE vs null

Understanding the difference between `NONE` and `null` is essential when working with optional fields:

| State     | Field exists? | Has value? | Matched by                       |
| --------- | ------------- | ---------- | -------------------------------- |
| `NONE`    | No            | No         | `isNone: true`                   |
| `null`    | Yes           | No (null)  | `isNull: true`                   |
| `'hello'` | Yes           | Yes        | `isNone: false`, `isNull: false` |

This distinction arises from how optional fields are stored:

```typescript
// Schema: bio String?

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

For more details on how `NONE` and `null` work in Cerial schemas and data operations, see the Types > NONE vs null documentation.

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
```
