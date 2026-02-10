---
title: Array Types
parent: Schema
nav_order: 2
---

# Array Types

Any field type can be declared as an array by appending `[]` to the type. Array fields store ordered lists of values in a single field.

## Syntax

```cerial
model Example {
  id Record @id
  nicknames String[]     # string array
  scores Int[]           # integer array
  ratings Float[]        # float array
  flags Bool[]           # boolean array
  loginDates Date[]      # Date array
  tagIds Record[]        # record reference array
  locations GeoPoint[]   # array of embedded objects
}
```

`Relation[]` uses the array syntax to indicate a one-to-many or many-to-many relationship, but this represents relation cardinality rather than a stored array field. See [Field Types](field-types) for details on the `Relation` type.

## Default Behavior

Array fields default to an empty array (`[]`) on create if no value is provided. You never need to explicitly set an array field to `[]` — omitting it produces the same result.

```cerial
model Article {
  id Record @id
  title String
  tags String[]
}
```

```typescript
// Both produce the same result: tags = []
const a = await db.Article.create({ data: { title: 'Hello' } });
const b = await db.Article.create({ data: { title: 'World', tags: [] } });

console.log(a.tags); // []
console.log(b.tags); // []
```

## TypeScript Types

Array fields map to TypeScript arrays of the corresponding type:

| Schema         | TypeScript                                        |
| -------------- | ------------------------------------------------- |
| `String[]`     | `string[]`                                        |
| `Int[]`        | `number[]`                                        |
| `Float[]`      | `number[]`                                        |
| `Bool[]`       | `boolean[]`                                       |
| `Date[]`       | `Date[]`                                          |
| `Record[]`     | `CerialId[]` (output) / `RecordIdInput[]` (input) |
| `ObjectName[]` | `ObjectName[]`                                    |

## Query Operators

Array fields support special filter operators in `where` clauses:

| Operator  | Description                                     |
| --------- | ----------------------------------------------- |
| `has`     | Array contains the given value                  |
| `hasAll`  | Array contains all given values                 |
| `hasAny`  | Array contains at least one of the given values |
| `isEmpty` | Array is empty (`true`) or not empty (`false`)  |

```typescript
// Find articles that have the "typescript" tag
await db.Article.findMany({
  where: { tags: { has: 'typescript' } },
});

// Find articles that have ALL of these tags
await db.Article.findMany({
  where: { tags: { hasAll: ['typescript', 'tutorial'] } },
});

// Find articles that have ANY of these tags
await db.Article.findMany({
  where: { tags: { hasAny: ['typescript', 'javascript'] } },
});

// Find articles with no tags
await db.Article.findMany({
  where: { tags: { isEmpty: true } },
});
```

## Update Operators

Array fields support `push` and `unset` in update operations:

```typescript
// Push a new tag
await db.Article.updateMany({
  where: { id: article.id },
  data: { tags: { push: ['new-tag'] } },
});

// Replace the entire array
await db.Article.updateMany({
  where: { id: article.id },
  data: { tags: ['completely', 'new', 'tags'] },
});
```

## Array Decorators

Two decorators are available for array fields:

- [`@distinct`](decorators/distinct) — Automatically deduplicates values at the database level
- [`@sort` / `@sort(false)`](decorators/sort) — Maintains ascending or descending order at the database level

```cerial
model Article {
  id Record @id
  tags String[] @distinct @sort
  priorities Int[] @distinct @sort(false)
}
```

See the individual decorator pages for details.
