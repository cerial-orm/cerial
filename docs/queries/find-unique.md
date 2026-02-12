---
title: findUnique
parent: Queries
nav_order: 3
---

# findUnique

Finds a record by a unique field — either the `id` or any field decorated with `@unique` in your schema. Returns `T | null`.

The `where` clause must contain exactly one unique field.

## Options

| Option    | Type               | Required | Description                           |
| --------- | ------------------ | -------- | ------------------------------------- |
| `where`   | `UniqueWhereInput` | Yes      | Must contain exactly one unique field |
| `select`  | `SelectInput`      | No       | Narrow which fields are returned      |
| `include` | `IncludeInput`     | No       | Include related records               |

## Basic Usage

### Find by ID

```typescript
const user = await db.User.findUnique({
  where: { id: '123' },
});
// user: User | null
```

### Find by Unique Field

```typescript
const user = await db.User.findUnique({
  where: { email: 'john@example.com' },
});
// user: User | null
```

## With Select

```typescript
const user = await db.User.findUnique({
  where: { id: '123' },
  select: { id: true, name: true },
});
// user: { id: CerialId; name: string } | null
```

## With Include

```typescript
const user = await db.User.findUnique({
  where: { email: 'john@example.com' },
  include: { profile: true },
});
// user: (User & { profile: Profile }) | null
```

## Find by Object @unique Field

When an object type has a field marked with `@unique`, you can use it in `findUnique` with nested syntax:

```cerial
object LocationInfo {
  address String
  zip String @unique
}

model Store {
  id Record @id
  name String
  location LocationInfo
  warehouse LocationInfo?
}
```

```typescript
// Find by object @unique field (nested syntax)
const store = await db.Store.findUnique({
  where: { location: { zip: '10001' } },
});

// Each embedding is independent
const byWarehouse = await db.Store.findUnique({
  where: { warehouse: { zip: '90210' } },
});

// With additional filters
const filtered = await db.Store.findUnique({
  where: { location: { zip: '10001' }, name: 'Downtown' },
});
```

## With Select and Include

```typescript
const user = await db.User.findUnique({
  where: { id: '123' },
  select: { id: true, email: true },
  include: { posts: true },
});
// user: ({ id: CerialId; email: string } & { posts: Post[] }) | null
```

## findUnique vs findOne

Both methods return a single record or `null`, but they serve different purposes:

|                  | `findUnique`                            | `findOne`                                  |
| ---------------- | --------------------------------------- | ------------------------------------------ |
| **Where clause** | Must target a unique field              | Any filter conditions                      |
| **Use case**     | Look up a specific record by identifier | Find first match from potentially many     |
| **OrderBy**      | Not needed (result is deterministic)    | Useful to control which record is returned |
| **Type safety**  | `where` only accepts unique fields      | `where` accepts any filterable fields      |

Use `findUnique` when you know the exact identifier of the record you want. Use `findOne` when you need to find a record by non-unique criteria.

## Return Value

- Returns the matching record with the appropriate type based on `select` and `include` options.
- Returns `null` if no record with the given unique field value exists.
