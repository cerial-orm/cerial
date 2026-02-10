---
title: Include
parent: Select & Include
nav_order: 3
---

# Include

The `include` option loads related records alongside the main query result. Relations defined in your Cerial schema (via `Relation` fields) are not fetched by default — you must explicitly include them.

## Boolean Include

Pass `true` to include all fields of the related record:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: { profile: true },
});
// user: (User & { profile: Profile }) | null
```

The return type is the full `User` model intersected with the included `profile` relation. All fields from both `User` and `Profile` are available.

For array relations, the included field is typed as an array:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: { posts: true },
});
// user: (User & { posts: Post[] }) | null
```

## Include with Options

Array relations support additional options to filter, order, and paginate the included records:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: {
    posts: {
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      limit: 10,
      offset: 0,
    },
  },
});
// user: (User & { posts: Post[] }) | null
```

Available options for array relation includes:

| Option    | Description                                                      |
| --------- | ---------------------------------------------------------------- |
| `where`   | Filter included records by conditions                            |
| `orderBy` | Sort included records by field(s)                                |
| `limit`   | Maximum number of included records                               |
| `offset`  | Number of records to skip (for pagination)                       |
| `select`  | Type-level field narrowing (see below)                           |
| `include` | Nested relation loading (see [Nested Includes](nested-includes)) |

## Include with Select

You can pass a `select` option inside an include to narrow the type of the related record:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: {
    profile: { select: { bio: true } },
  },
});
// Type-level: user.profile: { bio: string }
```

{: .warning }

> **Important**: `select` within `include` is **type-level only**. At runtime, the full related object is returned. This means you get type-safe access to only the selected fields in your TypeScript code, but the actual data transferred from SurrealDB contains all fields of the related record.

This behavior exists because SurrealDB's relation fetching loads complete records. The type narrowing ensures your code only depends on the fields you explicitly request, making it safer to refactor later.

## Multiple Includes

Include multiple relations in a single query:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: {
    profile: true,
    posts: { limit: 5 },
    tags: true,
  },
});
// user: (User & { profile: Profile; posts: Post[]; tags: Tag[] }) | null
```

Each included relation is independently configured. You can mix boolean includes with option-based includes freely.

## Optional Relations

If a relation is optional in the schema (e.g., `profile Profile?`), the included type reflects that:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: { profile: true },
});
// user: (User & { profile: Profile | null }) | null
```

The `profile` field may be `null` if the user has no associated profile record.

## Supported Query Methods

Include works on the same query methods as select:

| Method         | Return type with include                  |
| -------------- | ----------------------------------------- |
| `findOne`      | `(Model & { relation: Related }) \| null` |
| `findMany`     | `(Model & { relation: Related })[]`       |
| `findUnique`   | `(Model & { relation: Related }) \| null` |
| `create`       | `Model & { relation: Related }`           |
| `updateMany`   | `(Model & { relation: Related })[]`       |
| `updateUnique` | `(Model & { relation: Related }) \| null` |
