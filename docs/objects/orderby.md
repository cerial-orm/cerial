---
title: Ordering
parent: Objects
nav_order: 7
---

# Ordering by Embedded Object Fields

You can sort query results by fields within embedded objects. Cerial translates nested ordering into dot-notation SurrealQL `ORDER BY` clauses.

## Basic Ordering

Pass an object with the nested field and direction (`'asc'` or `'desc'`):

```typescript
// Order by a nested object field ascending
const users = await db.User.findMany({
  orderBy: { address: { city: 'asc' } },
});
```

```typescript
// Order by a nested object field descending
const users = await db.User.findMany({
  orderBy: { address: { state: 'desc' } },
});
```

These produce SurrealQL like `ORDER BY address.city ASC` and `ORDER BY address.state DESC` respectively.

## Generated OrderBy Types

For each object type, Cerial generates a corresponding `ObjectNameOrderBy` type. This type mirrors the object's field structure, with each leaf field accepting `'asc' | 'desc'`:

```typescript
// Generated from:
// object Address {
//   street String
//   city String
//   state String
//   zipCode String?
// }

type AddressOrderBy = {
  street?: 'asc' | 'desc';
  city?: 'asc' | 'desc';
  state?: 'asc' | 'desc';
  zipCode?: 'asc' | 'desc';
};
```

On the model side, the `UserOrderBy` type includes the nested object ordering:

```typescript
type UserOrderBy = {
  name?: 'asc' | 'desc';
  address?: AddressOrderBy;
  // ...
};
```

## Ordering by Top-Level and Nested Fields

You can combine top-level and nested field ordering:

```typescript
const users = await db.User.findMany({
  orderBy: { address: { state: 'asc' } },
});
```

This sorts all users by their address state in ascending order.
