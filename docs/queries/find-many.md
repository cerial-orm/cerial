---
title: findMany
parent: Queries
nav_order: 2
---

# findMany

Finds all records matching the where clause. Returns `T[]`.

Returns an empty array `[]` if no records match.

## Options

| Option    | Type           | Required | Description                                   |
| --------- | -------------- | -------- | --------------------------------------------- |
| `where`   | `WhereInput`   | No       | Filter conditions (omit to fetch all records) |
| `select`  | `SelectInput`  | No       | Narrow which fields are returned              |
| `include` | `IncludeInput` | No       | Include related records                       |
| `orderBy` | `OrderByInput` | No       | Sort order for results                        |
| `limit`   | `number`       | No       | Maximum number of records to return           |
| `offset`  | `number`       | No       | Number of records to skip                     |

## Basic Usage

```typescript
// Fetch all active users
const users = await db.User.findMany({
  where: { isActive: true },
});
// users: User[]
```

## Fetch All Records

Omit the `where` clause to retrieve every record in the table:

```typescript
const allUsers = await db.User.findMany();
// allUsers: User[]
```

## With All Options

```typescript
const users = await db.User.findMany({
  where: {
    isActive: true,
    age: { gte: 18, lt: 65 },
  },
  select: { id: true, name: true },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
  include: {
    profile: { select: { bio: true } },
  },
});
```

## Pagination

Use `limit` and `offset` together for cursor-free pagination:

```typescript
const page = 2;
const pageSize = 10;

const users = await db.User.findMany({
  where: { isActive: true },
  orderBy: { createdAt: 'desc' },
  limit: pageSize,
  offset: (page - 1) * pageSize,
});
```

You can combine this with [`count`](count) to calculate total pages:

```typescript
const total = await db.User.count({ isActive: true });
const totalPages = Math.ceil(total / pageSize);
```

## Ordering

Sort results by one or more fields using `'asc'` or `'desc'`:

```typescript
const users = await db.User.findMany({
  orderBy: { name: 'asc' },
});
```

## With Select

```typescript
const users = await db.User.findMany({
  where: { isActive: true },
  select: { id: true, name: true, email: true },
});
// users: { id: CerialId; name: string; email: string }[]
```

## With Include

```typescript
const users = await db.User.findMany({
  where: { isActive: true },
  include: {
    posts: { limit: 3, orderBy: { createdAt: 'desc' } },
    profile: true,
  },
});
// users: (User & { posts: Post[]; profile: Profile })[]
```

## Return Value

- Returns an array of matching records with types narrowed by `select` and `include`.
- Returns an empty array `[]` if no records match.
