---
title: Select
parent: Select & Include
nav_order: 1
---

# Select

The `select` option lets you pick exactly which fields to return from a query. Pass an object with field names as keys and `true` as values. Only fields set to `true` are included in both the query result and the TypeScript return type.

## Basic Usage

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { id: true, name: true, email: true },
});
// user: { id: CerialId; name: string; email: string } | null
// Accessing user.age would be a TypeScript compile error
```

Fields not mentioned in the `select` object are excluded entirely. This means:

- They are not fetched from SurrealDB
- They do not exist on the returned TypeScript type
- Attempting to access them produces a compile-time error

## Supported Query Methods

Select works on all query methods that return records:

| Method         | Return type with select   |
| -------------- | ------------------------- |
| `findOne`      | `{ field: true } \| null` |
| `findMany`     | `{ field: true }[]`       |
| `findUnique`   | `{ field: true } \| null` |
| `create`       | `{ field: true }`         |
| `updateMany`   | `{ field: true }[]`       |
| `updateUnique` | `{ field: true } \| null` |

```typescript
// findMany with select
const users = await db.User.findMany({
  where: { active: true },
  select: { id: true, name: true },
});
// users: { id: CerialId; name: string }[]

// create with select
const user = await db.User.create({
  data: { name: 'Alice', email: 'alice@example.com' },
  select: { id: true, name: true },
});
// user: { id: CerialId; name: string }
```

## Selecting Optional Fields

Optional fields retain their `| null | undefined` type when selected:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { name: true, age: true },
});
// user: { name: string; age: number | null | undefined } | null
```

The `| undefined` represents the SurrealDB `NONE` state (field absent), while `| null` represents an explicit null value stored in the database. See [NONE vs null Semantics](../models/none-vs-null) for details.

## Selecting Record Fields

Record ID fields (foreign keys) return `CerialId` values:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { id: true, profileId: true },
});
// user: { id: CerialId; profileId: CerialId | null | undefined } | null
```

Optional record fields include `| null | undefined` because the reference may be absent (`NONE`) or explicitly unset.

## Selecting Array Fields

Array fields return their full array type when selected:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { nicknames: true },
});
// user: { nicknames: string[] } | null
```

Array fields always default to `[]` on create, so they are never `null` or `undefined` in query results.

## Selecting Embedded Object Fields

Embedded object fields can be selected as a whole with `true`, or narrowed to specific sub-fields with an object. See [Object Sub-Select](object-sub-select) for details.

```typescript
// Select the full object
const user = await db.User.findOne({
  select: { address: true },
});
// user.address: Address

// Select specific sub-fields
const user = await db.User.findOne({
  select: { address: { city: true, state: true } },
});
// user.address: { city: string; state: string }
```

## What Happens at the SurrealQL Level

When you use `select`, Cerial generates a SurrealQL `SELECT` statement that only fetches the specified fields:

```sql
-- select: { id: true, name: true, email: true }
SELECT id, name, email FROM user WHERE ...
```

This means less data is transferred from SurrealDB, making select useful for performance optimization in addition to type safety.
