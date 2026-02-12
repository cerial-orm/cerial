---
title: '@index'
parent: Decorators
grand_parent: Schema
nav_order: 10
---

# @index

Creates a non-unique index on the field in SurrealDB. This improves query performance for fields that are frequently filtered or sorted, without enforcing uniqueness.

## Syntax

```cerial
model Product {
  id Record @id
  name String @index
  category String @index
  price Float
}
```

## Behavior

- A `DEFINE INDEX` statement (without `UNIQUE`) is generated in migrations for each `@index` field.
- The index speeds up lookups but does **not** prevent duplicate values.
- `@index` and `@unique` are **mutually exclusive** on the same field — use one or the other.
- `@index` alone does not satisfy the unique field requirement for `findUnique`, `updateUnique`, or `deleteUnique` — at least one `@unique` or `@id` field must also be present in the where clause.

## Difference from @unique

| Aspect           | `@index`                          | `@unique`                                    |
| ---------------- | --------------------------------- | -------------------------------------------- |
| Duplicate values | Allowed                           | Rejected by DB                               |
| Unique lookups   | Not available                     | `findUnique`, `updateUnique`, `deleteUnique` |
| Migration output | `DEFINE INDEX ... COLUMNS field;` | `DEFINE INDEX ... COLUMNS field UNIQUE;`     |
| Use case         | Performance optimization          | Data integrity constraint                    |

## Example

```cerial
model Article {
  id Record @id
  title String
  category String @index
  author String @index
  publishedAt Date @now
}
```

```typescript
// Both queries benefit from the index
const articles = await db.Article.findMany({
  where: { category: 'tech' },
});

const byAuthor = await db.Article.findMany({
  where: { author: 'Alice' },
  orderBy: { publishedAt: 'desc' },
});
```

## Null and Optional Fields

Since `@index` does not enforce uniqueness, null/NONE values have no special behavior — multiple records with the same value (including null) are always allowed.

For null behavior on unique constraints, see [@unique — Null Behavior](unique#null-behavior-on-optional-fields) and [@@unique — Null Behavior](composite-unique#null-behavior-on-optional-fields).

## Array Fields

`@index` can be applied to array fields. SurrealDB indexes each **element** individually, which speeds up `CONTAINS` queries:

```cerial
model Article {
  id Record @id
  tags String[] @index
}
```

```typescript
// Per-element index speeds up CONTAINS lookups
const tagged = await db.Article.findMany({
  where: { tags: { contains: 'typescript' } },
});
```

Note that `@unique` is **not** allowed on array fields — see [@unique — Array Fields](unique#array-fields).

## Rules

- Cannot be combined with `@unique` on the same field.
- Can be applied to any storable field type (String, Int, Float, Email, Date, Bool, Record).
- Can be applied to object-typed fields for whole-object indexing.
- Can be applied to array fields — indexes each element individually for `CONTAINS` queries.
