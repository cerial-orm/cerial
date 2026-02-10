---
title: Nested Includes
parent: Select & Include
nav_order: 4
---

# Nested Includes

Cerial supports nested include chains — including relations of relations in a single query. This lets you load deeply connected data in one operation.

## Basic Nested Include

Include a relation on an included relation using a nested `include` option:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: {
    posts: {
      include: {
        author: true,
      },
    },
  },
});
// user: (User & {
//   posts: (Post & { author: User })[]
// }) | null

// Access the nested data:
// user.posts[0].author.name
```

Each post in the `posts` array now includes its `author` relation, which is a full `User` object.

## Nested Include with Select

Combine nested includes with `select` to narrow the type at any level:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: {
    posts: {
      include: {
        author: { select: { name: true } },
      },
    },
  },
});
// user: (User & {
//   posts: (Post & { author: { name: string } })[]
// }) | null

// user.posts[0].author.name  — OK
// user.posts[0].author.email — TypeScript error
```

Remember that `select` within `include` is type-level only — the runtime data contains all fields.

## Multi-Level Nesting

You can nest includes to arbitrary depth:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: {
    posts: {
      include: {
        author: {
          include: { profile: true },
        },
      },
    },
  },
});
// user: (User & {
//   posts: (Post & {
//     author: User & { profile: Profile }
//   })[]
// }) | null

// Access deeply nested data:
// user.posts[0].author.profile.bio
```

## Nested Includes with Filters

Each level of include supports the full set of query options. You can filter, order, and paginate at every level independently:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: {
    posts: {
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      limit: 5,
      include: {
        author: true,
        tags: {
          where: { active: true },
          orderBy: { name: 'asc' },
        },
      },
    },
  },
});
// user: (User & {
//   posts: (Post & { author: User; tags: Tag[] })[]
// }) | null
```

In this example:

- Only published posts are included, ordered by creation date, limited to 5
- Each post includes its author and active tags (sorted by name)

## Full Option Set at Each Level

Every level of include supports:

| Option    | Description                          |
| --------- | ------------------------------------ |
| `where`   | Filter the included records          |
| `orderBy` | Sort the included records            |
| `limit`   | Maximum number of records to include |
| `offset`  | Number of records to skip            |
| `select`  | Type-level field narrowing           |
| `include` | Further nested relation loading      |

## Practical Example

Loading a blog post with its author, author's profile, and comments with their authors:

```typescript
const post = await db.Post.findOne({
  where: { id: postId },
  include: {
    author: {
      include: { profile: true },
    },
    comments: {
      where: { approved: true },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          include: { profile: true },
        },
      },
    },
  },
});
// post: (Post & {
//   author: User & { profile: Profile };
//   comments: (Comment & {
//     author: User & { profile: Profile }
//   })[]
// }) | null
```

This fetches everything needed to render a full blog post page in a single query, with type-safe access to all nested data.
