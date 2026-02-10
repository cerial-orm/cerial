---
title: Select + Include
parent: Select & Include
nav_order: 5
---

# Select + Include

You can combine `select` and `include` in the same query to control both which fields of the main model are returned and which relations are loaded.

## How It Works

When both options are used, the return type is the **intersection** of selected fields and included relations:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { id: true, email: true },
  include: { profile: true },
});
// user: ({ id: CerialId; email: string } & { profile: Profile }) | null
```

- `select` controls which **scalar fields** of the main model are returned
- `include` adds **related records** on top of the selected fields

Fields not listed in `select` are excluded from the main model type, but included relations are always fully available.

## Practical Example

Select only the fields you need from the main model while loading related data:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { id: true, name: true, email: true },
  include: {
    posts: { limit: 5, orderBy: { createdAt: 'desc' } },
    profile: true,
  },
});
// user: ({
//   id: CerialId;
//   name: string;
//   email: string;
// } & {
//   posts: Post[];
//   profile: Profile;
// }) | null

// user.name       — OK (selected)
// user.email      — OK (selected)
// user.age        — TypeScript error (not selected)
// user.posts      — OK (included)
// user.profile    — OK (included)
```

This pattern is useful when you want to minimize the data returned from the main model while still loading the full related records.

## Object Sub-Select with Include

You can use object sub-selects in `select` alongside `include`:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { name: true, address: { city: true } },
  include: { posts: true },
});
// user: ({
//   name: string;
//   address: { city: string };
// } & {
//   posts: Post[];
// }) | null
```

The embedded `address` object is narrowed to only `city`, while `posts` are included in full.

## Include with Select on Relations

You can also narrow the included relation types with `select` inside `include`:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { id: true, name: true },
  include: {
    profile: { select: { bio: true, avatarUrl: true } },
    posts: {
      limit: 10,
      select: { title: true, createdAt: true },
    },
  },
});
// user: ({
//   id: CerialId;
//   name: string;
// } & {
//   profile: { bio: string; avatarUrl: string };
//   posts: { title: string; createdAt: Date }[];
// }) | null
```

Remember that `select` within `include` is type-level only — the runtime data contains all fields of the related records.

## When to Use This Pattern

Combining `select` and `include` is most useful when:

- **Performance**: You have a model with many fields but only need a few, while still needing related data
- **Type safety**: You want to ensure your code only depends on specific fields, making it resilient to schema changes
- **API responses**: You're building a response payload and want to precisely control the shape of the data

```typescript
// Building an API response with minimal data
const users = await db.User.findMany({
  where: { active: true },
  select: { id: true, name: true, email: true },
  include: {
    posts: {
      where: { published: true },
      limit: 3,
      orderBy: { createdAt: 'desc' },
    },
  },
});
// users: ({
//   id: CerialId;
//   name: string;
//   email: string;
// } & {
//   posts: Post[];
// })[]
```
