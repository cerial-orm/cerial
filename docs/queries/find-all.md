---
title: findAll
parent: Queries
nav_order: 3
---

# findAll

Returns all records from a table. This is a convenience alias for `findMany()` with no options.

## Usage

```typescript
const users = await client.db.User.findAll();
// users: User[]
```

## Return Type

`findAll()` always returns the full model type array. Unlike `findMany()`, it does not accept `select`, `include`, `where`, `orderBy`, `limit`, or `offset` options.

| Scenario      | Return Type                         |
| ------------- | ----------------------------------- |
| Records exist | `T[]` (array of full model objects) |
| Table empty   | `[]` (empty array)                  |

## Equivalence

`findAll()` is exactly equivalent to calling `findMany()` with no arguments:

```typescript
// These are identical
const all1 = await client.db.User.findAll();
const all2 = await client.db.User.findMany();
```

Use `findAll()` when you want every record without filtering, and `findMany()` when you need `where`, `select`, `orderBy`, `limit`, or `offset`.
