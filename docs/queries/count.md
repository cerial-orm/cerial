---
title: count
parent: Queries
nav_order: 11
---

# count

Counts the number of records matching the where clause. Returns a `number`.

Uses an efficient `SELECT count() FROM ... GROUP ALL` query — only the count is returned from the database, not the actual records.

## Options

| Option  | Type         | Required | Description                                   |
| ------- | ------------ | -------- | --------------------------------------------- |
| `where` | `WhereInput` | No       | Filter conditions (omit to count all records) |

The `where` argument is passed directly — not wrapped in an options object.

## Basic Usage

### Count All Records

```typescript
const total = await db.User.count();
// total: number
```

### Count with Filter

```typescript
const activeUsers = await db.User.count({ isActive: true });
// activeUsers: number
```

### Count with Complex Filter

```typescript
const recentPosts = await db.Post.count({
  createdAt: { gte: new Date('2024-01-01') },
});
// recentPosts: number
```

## Combining with Pagination

Use `count` alongside [`findMany`](find-many) to build paginated responses:

```typescript
const pageSize = 10;
const where = { isActive: true };

const [users, total] = await Promise.all([
  db.User.findMany({
    where,
    limit: pageSize,
    offset: 0,
    orderBy: { createdAt: 'desc' },
  }),
  db.User.count(where),
]);

const totalPages = Math.ceil(total / pageSize);
```

## Generated Query

```sql
-- count()
SELECT count() FROM user GROUP ALL

-- count({ isActive: true })
SELECT count() FROM user WHERE isActive = $0 GROUP ALL
```

The `GROUP ALL` clause collapses the result into a single row with the total count. No record data is transferred over the wire.

## Return Value

- Returns a `number` representing the count of matching records.
- Returns `0` if no records match.
