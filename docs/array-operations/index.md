---
title: Array Operations
nav_order: 9
has_children: true
---

# Array Operations

Cerial provides full support for array fields in your schema. Array fields are declared using the `Type[]` syntax and offer a rich set of operations for creating, updating, and querying array data.

## Array Field Declaration

Declare array fields in your `.cerial` schema by appending `[]` to any supported type:

```
model User {
  id Record @id
  nicknames String[]
  scores Int[]
  ratings Float[]
  flags Bool[]
  loginDates Date[]
  tagIds Record[]
  locations GeoPoint[]
}
```

## Supported Array Types

| Type           | Description                                    |
| -------------- | ---------------------------------------------- |
| `String[]`     | Array of strings                               |
| `Int[]`        | Array of integers                              |
| `Float[]`      | Array of floating-point numbers                |
| `Bool[]`       | Array of booleans                              |
| `Date[]`       | Array of datetime values                       |
| `Record[]`     | Array of SurrealDB record references           |
| `ObjectName[]` | Array of embedded objects (e.g., `GeoPoint[]`) |

## Default Behavior

All array fields default to an empty array `[]` when creating a record if no value is provided:

```typescript
const user = await db.User.create({
  data: { name: 'Alice' },
});
// user.nicknames => []
// user.scores => []
// user.ratings => []
```

## Capabilities

Array fields support the following operations:

- **Update operators** - Use `push` to add elements and `unset` to remove elements from an existing array. See [Push & Unset](push-unset.md).
- **Full replacement** - Replace the entire array with a new value. See [Replace Array](replace.md).
- **Query operators** - Filter records by array contents using `has`, `hasAll`, `hasAny`, and `isEmpty`. See the [Filtering](../filtering/) section.
- **Schema decorators** - Enforce database-level constraints with `@distinct` and `@sort`. See [Array Decorators](decorators.md).

## In This Section

- [Push & Unset](push-unset.md) - Add and remove elements from arrays
- [Replace Array](replace.md) - Replace entire array contents
- [Array Decorators](decorators.md) - Enforce uniqueness and sort order at the database level
