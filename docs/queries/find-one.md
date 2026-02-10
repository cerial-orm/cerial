---
title: findOne
parent: Queries
nav_order: 1
---

# findOne

Finds the first record matching the where clause. Returns `T | null`.

If multiple records match, the one returned depends on the `orderBy` option (or SurrealDB's default ordering if none is specified). Returns `null` if no record matches.

## Options

| Option    | Type           | Required | Description                                   |
| --------- | -------------- | -------- | --------------------------------------------- |
| `where`   | `WhereInput`   | Yes      | Filter conditions to match against            |
| `select`  | `SelectInput`  | No       | Narrow which fields are returned              |
| `include` | `IncludeInput` | No       | Include related records                       |
| `orderBy` | `OrderByInput` | No       | Ordering (determines which record is "first") |

## Basic Usage

```typescript
const user = await db.User.findOne({
  where: { email: 'john@example.com' },
});
// user: User | null
```

## With Select

Use `select` to return only specific fields. The return type is narrowed to include only the selected fields.

```typescript
const user = await db.User.findOne({
  where: { email: 'john@example.com' },
  select: { id: true, name: true, email: true },
});
// user: { id: CerialId; name: string; email: string } | null
```

## With Include

Use `include` to fetch related records alongside the main record. Included relations support their own filtering, ordering, and limiting.

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  include: {
    profile: true,
    posts: { limit: 5, orderBy: { createdAt: 'desc' } },
  },
});
// user: (User & { profile: Profile; posts: Post[] }) | null
```

## With Select and Include

When both `select` and `include` are provided, the base fields are narrowed by `select` while included relations are merged via intersection.

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  select: { id: true, email: true },
  include: { profile: true },
});
// user: ({ id: CerialId; email: string } & { profile: Profile }) | null
```

## Object Sub-Field Select

For embedded object fields, you can select specific sub-fields instead of the entire object:

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  select: { name: true, address: { city: true, state: true } },
});
// user: { name: string; address: { city: string; state: string } } | null
```

Passing `true` for an object field returns the full object type:

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  select: { name: true, address: true },
});
// user: { name: string; address: Address } | null
```

## With OrderBy

The `orderBy` option determines which record is returned when multiple records match:

```typescript
const latestUser = await db.User.findOne({
  where: { isActive: true },
  orderBy: { createdAt: 'desc' },
});
// Returns the most recently created active user
```

## Return Value

- Returns the matching record with the appropriate type based on `select` and `include` options.
- Returns `null` if no record matches the `where` clause.
