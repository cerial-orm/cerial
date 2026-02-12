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

## Null Behavior on Optional Fields

When `@unique` is applied to an optional field, SurrealDB allows **multiple records** with `null` or absent (NONE) values. The unique constraint only applies to concrete values.

```cerial
model Profile {
  id Record @id
  nickname String? @unique
}
```

```typescript
// Both allowed — null is not treated as a unique value
await db.Profile.create({ data: {} }); // nickname absent (NONE)
await db.Profile.create({ data: {} }); // another NONE — OK

await db.Profile.create({ data: { nickname: null } }); // null — OK
await db.Profile.create({ data: { nickname: null } }); // another null — OK

// Concrete values are still enforced
await db.Profile.create({ data: { nickname: 'ace' } });
await db.Profile.create({ data: { nickname: 'ace' } }); // Error: duplicate
```

For composite uniqueness constraints with optional fields, see [@@unique — Null Behavior](composite-unique#null-behavior-on-optional-fields).

## Array Fields

`@unique` **cannot** be applied to array fields (`String[]`, `Int[]`, `Record[]`, etc.). SurrealDB indexes array elements individually, so a unique index on an array field means "no two records can share any single element" — not "no two records can have the same array". This is almost never the intended behavior and would cause surprising constraint violations.

Use [`@index`](index.decorator) on array fields instead if you need per-element lookups with `CONTAINS` queries.
