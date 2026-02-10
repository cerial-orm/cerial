---
title: Array Decorators
parent: Array Operations
nav_order: 3
---

# Array Decorators

Cerial provides two schema decorators for array fields that enforce constraints at the database level in SurrealDB: `@distinct` and `@sort`. These constraints are applied automatically by SurrealDB whenever the array is modified.

## @distinct

The `@distinct` decorator enforces that all elements in the array are unique. Duplicate values are automatically removed by SurrealDB.

### Schema Definition

```
model Article {
  id Record @id
  title String
  tags String[] @distinct
}
```

### Behavior

When you create or update a record with duplicate values, SurrealDB automatically deduplicates them:

```typescript
const article = await db.Article.create({
  data: { title: 'Hello', tags: ['js', 'ts', 'js'] },
});
// article.tags => ['js', 'ts'] - duplicate 'js' removed
```

Pushing a value that already exists in the array is a no-op:

```typescript
await db.Article.updateMany({
  where: { id: articleId },
  data: { tags: { push: 'js' } },
});
// 'js' already exists, array unchanged
```

Pushing a new value still works as expected:

```typescript
await db.Article.updateMany({
  where: { id: articleId },
  data: { tags: { push: 'rust' } },
});
// tags => ['js', 'ts', 'rust']
```

## @sort

The `@sort` decorator maintains elements in sorted order. SurrealDB automatically sorts the array whenever it is modified.

### Schema Definition

```
model Student {
  id Record @id
  sortedScores Int[] @sort
  recentDates Date[] @sort(false)
}
```

### Sort Direction

| Syntax         | Direction            |
| -------------- | -------------------- |
| `@sort`        | Ascending (default)  |
| `@sort(true)`  | Ascending (explicit) |
| `@sort(false)` | Descending           |

### Behavior

Elements are sorted automatically on create:

```typescript
const student = await db.Student.create({
  data: {
    sortedScores: [88, 100, 72],
    recentDates: [new Date('2025-01-01'), new Date('2025-12-31'), new Date('2025-06-15')],
  },
});
// student.sortedScores => [72, 88, 100] - ascending
// student.recentDates => [2025-12-31, 2025-06-15, 2025-01-01] - descending
```

Pushed elements are inserted in sorted position:

```typescript
await db.Student.updateMany({
  where: { id: studentId },
  data: { sortedScores: { push: 95 } },
});
// sortedScores => [72, 88, 95, 100] - still sorted ascending
```

Full replacement is also sorted:

```typescript
await db.Student.updateMany({
  where: { id: studentId },
  data: { sortedScores: [50, 30, 40] },
});
// sortedScores => [30, 40, 50] - sorted ascending
```

## Combining @distinct and @sort

Both decorators can be applied to the same field. When combined, the array is both deduplicated and sorted:

### Schema Definition

```
model Article {
  id Record @id
  categories String[] @distinct @sort
  priorities Int[] @distinct @sort(false)
}
```

### Behavior

```typescript
const article = await db.Article.create({
  data: {
    categories: ['tech', 'news', 'tech', 'sports'],
    priorities: [3, 1, 2, 1],
  },
});
// categories => ['news', 'sports', 'tech'] - unique + ascending
// priorities => [3, 2, 1] - unique + descending
```

Both constraints continue to be enforced on updates:

```typescript
await db.Article.updateMany({
  where: { id: articleId },
  data: { categories: { push: 'news' } },
});
// 'news' already exists, no duplicate added

await db.Article.updateMany({
  where: { id: articleId },
  data: { categories: { push: 'art' } },
});
// categories => ['art', 'news', 'sports', 'tech'] - inserted in sorted order
```

## Migration Output

These decorators generate appropriate SurrealQL `DEFINE FIELD` statements with assertions in the migration. For example, a field declared as:

```
tags String[] @distinct @sort
```

will produce migration statements that enforce uniqueness and sort order at the SurrealDB schema level, ensuring the constraints are applied regardless of how the data is modified.

## Notes

- `@distinct` and `@sort` are only valid on array fields. Using them on non-array fields will produce a parser error.
- These constraints are enforced by SurrealDB at the database level, not at the application level. This means they apply even if data is modified outside of Cerial.
- The `@sort` decorator affects the storage order. Queries reading the array will always receive elements in the declared sort order.
- Decorator order does not matter: `@distinct @sort` and `@sort @distinct` produce the same result.
