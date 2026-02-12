---
title: '@distinct'
parent: Decorators
grand_parent: Schema
nav_order: 8
---

# @distinct

Enforces uniqueness within an array field at the database level. When applied, SurrealDB automatically deduplicates values — duplicate entries are silently removed.

## Syntax

```cerial
model Article {
  id Record @id
  title String
  tags String[] @distinct
}
```

## Behavior

SurrealDB enforces the distinct constraint at the storage level. If you push a value that already exists in the array, the duplicate is automatically removed.

```typescript
await db.Article.create({
  data: { title: 'Hello', tags: ['typescript', 'tutorial', 'typescript'] },
});
// tags stored as: ['typescript', 'tutorial'] — duplicate removed

await db.Article.updateMany({
  where: { id: articleId },
  data: { tags: { push: ['tutorial'] } },
});
// tags still: ['typescript', 'tutorial'] — duplicate not added
```

## Combining with @sort

`@distinct` can be combined with [`@sort`](sort) to maintain a unique, ordered array:

```cerial
model Article {
  id Record @id
  categories String[] @distinct @sort
}
```

When both are applied, values are both deduplicated and kept in sorted order.

```typescript
await db.Article.create({
  data: { categories: ['zebra', 'apple', 'mango', 'apple'] },
});
// categories stored as: ['apple', 'mango', 'zebra'] — deduplicated and sorted
```

## Object Fields

`@distinct` can be applied to array fields within object definitions:

```cerial
object ContactInfo {
  email Email
  tags String[] @distinct
}
```

The deduplication is enforced at the database level, just like on model fields.

## Applicable Types

`@distinct` can be applied to any array field (on models or objects):

```cerial
model Example {
  id Record @id
  uniqueTags String[] @distinct
  uniqueScores Int[] @distinct
  uniqueRatings Float[] @distinct
  uniqueFlags Bool[] @distinct
  uniqueDates Date[] @distinct
  uniqueRefs Record[] @distinct
}
```
