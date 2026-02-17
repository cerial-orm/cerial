---
title: '@set'
parent: Decorators
grand_parent: Schema
nav_order: 9
---

# @set

Converts an array field to a SurrealDB `set` type. Sets automatically deduplicate and sort their elements at the database level.

## Syntax

```cerial
model Article {
  id Record @id
  title String
  tags String[] @set
  scores Int[] @set
}
```

## Behavior

SurrealDB `set<T>` handles deduplication and sorting natively. Duplicate values are silently removed, and elements are kept in sorted order.

```typescript
await db.Article.create({
  data: { title: 'Hello', tags: ['typescript', 'go', 'typescript', 'alpha'] },
});
// tags stored as: ['alpha', 'go', 'typescript'] — deduplicated and sorted

await db.Article.updateMany({
  where: { id: articleId },
  data: { tags: { push: 'go' } },
});
// tags still: ['alpha', 'go', 'typescript'] — duplicate not added
```

## Generated Types

The output type uses `CerialSet<T>` (a branded array type), while input types accept regular arrays:

```typescript
// Output type
interface Article {
  tags: CerialSet<string>; // branded — deduplicated and sorted
  scores: CerialSet<number>;
}

// Input/Create type — regular arrays
interface ArticleInput {
  tags: string[]; // SurrealDB handles dedup/sort
  scores: number[];
}
```

## Migration Output

`@set` generates `set<T>` in the migration instead of `array<T>`:

```sql
DEFINE FIELD tags ON article TYPE set<string>;
DEFINE FIELD scores ON article TYPE set<int>;
```

## vs @distinct and @sort

`@set` replaces the combination of `@distinct @sort` with native SurrealDB set semantics:

| Approach          | Migration  | Dedup     | Sort      | VALUE clause |
| ----------------- | ---------- | --------- | --------- | ------------ |
| `@distinct @sort` | `array<T>` | Via VALUE | Via VALUE | Yes          |
| `@set`            | `set<T>`   | Native    | Native    | No           |

`@set` cannot be combined with `@distinct` or `@sort` — sets inherently provide both behaviors.

## Restrictions

- **Array fields only** — `@set` requires `[]` on the field type
- **Primitive types only** — Allowed on `String[]`, `Int[]`, `Float[]`, `Bool[]`, `Date[]`, `Uuid[]`, `Duration[]`, `Number[]`, `Bytes[]`, `Geometry[]`, `Any[]`
- **Not on Decimal[]** — SurrealDB has known issues with `set<decimal>`
- **Not on Object[], Tuple[], Record[]** — Only primitive array types are supported
- **Not with @distinct** — Redundant, sets are inherently distinct
- **Not with @sort** — Redundant, sets are inherently sorted

## Applicable Types

```cerial
model Example {
  id Record @id
  strings String[] @set
  ints Int[] @set
  floats Float[] @set
  bools Bool[] @set
  dates Date[] @set
  uuids Uuid[] @set
  durations Duration[] @set
  numbers Number[] @set
}
```
