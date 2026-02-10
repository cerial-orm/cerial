---
title: Where Filtering
parent: Objects
nav_order: 5
---

# Filtering by Embedded Object Fields

You can filter query results by the values of nested object fields. Cerial translates these into the appropriate SurrealQL dot-notation conditions.

## Basic Nested Field Filtering

Pass an object with the desired field conditions to filter by nested values:

```typescript
// Filter by a single nested field
await db.User.findMany({
  where: { address: { city: 'NYC' } },
});
```

### Multiple Nested Conditions

You can specify multiple conditions on the same object or across different object fields:

```typescript
await db.User.findMany({
  where: {
    address: { state: { in: ['NY', 'CA'] } },
    shipping: { zipCode: { startsWith: '100' } },
  },
});
```

### Filter Operators on Nested Fields

All standard filter operators work on nested object fields:

```typescript
await db.User.findMany({
  where: {
    address: {
      city: { contains: 'York' },
      state: { neq: 'TX' },
    },
  },
});
```

This generates conditions like `address.city CONTAINS 'York' AND address.state != 'TX'` in SurrealQL.

## Array Object Quantifiers

When filtering on array object fields, you use quantifier operators to express how many elements must match: `some`, `every`, or `none`.

### `some` — At Least One Element Matches

```typescript
await db.User.findMany({
  where: {
    locations: { some: { lat: { gt: 40 } } },
  },
});
```

Returns users where **at least one** location has a latitude greater than 40.

### `every` — All Elements Match

```typescript
await db.User.findMany({
  where: {
    locations: { every: { lat: { gte: 0 } } },
  },
});
```

Returns users where **every** location has a non-negative latitude.

### `none` — No Elements Match

```typescript
await db.User.findMany({
  where: {
    locations: { none: { lat: { lt: -90 } } },
  },
});
```

Returns users where **no** location has a latitude less than -90.

{: .note }

> The `none` quantifier is implemented internally as `!(arr.any(...))` syntax rather than `NOT arr.any(...)`. This is for SurrealDB 3.x compatibility.

## Combining Object Filters with Other Conditions

Object where conditions combine naturally with top-level field conditions and logical operators:

```typescript
await db.User.findMany({
  where: {
    name: { startsWith: 'J' },
    address: { state: 'NY' },
    locations: { some: { lat: { gt: 40 } } },
  },
});
```
