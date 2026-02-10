---
title: '@unique'
parent: Decorators
grand_parent: Schema
nav_order: 2
---

# @unique

Creates a unique index on the field in SurrealDB. No two records in the same table can have the same value for a unique field.

## Syntax

```cerial
model User {
  id Record @id
  email Email @unique
  username String @unique
  name String
}
```

## Behavior

- A `DEFINE INDEX` statement with `UNIQUE` is generated in migrations for each `@unique` field.
- Multiple fields in the same model can each have `@unique` — each gets its own independent unique constraint.
- Attempting to create or update a record with a duplicate value for a unique field will result in a database error.

## Unique Lookups

Fields marked with `@unique` can be used with the `findUnique`, `updateUnique`, and `deleteUnique` client methods. These methods accept the unique field in their `where` clause and return a single record (or `null`).

```typescript
// Find by unique field
const user = await db.User.findUnique({
  where: { email: 'alice@example.com' },
});

// Update by unique field
const updated = await db.User.updateUnique({
  where: { username: 'alice' },
  data: { name: 'Alice Smith' },
});

// Delete by unique field
const deleted = await db.User.deleteUnique({
  where: { email: 'alice@example.com' },
});
```

## Example

```cerial
model Product {
  id Record @id
  sku String @unique
  name String
  price Float
}
```

```typescript
// Create a product with unique SKU
await db.Product.create({
  data: { sku: 'WIDGET-001', name: 'Widget', price: 9.99 },
});

// This would fail — duplicate SKU
await db.Product.create({
  data: { sku: 'WIDGET-001', name: 'Another Widget', price: 19.99 },
});
// Error: unique constraint violated
```
