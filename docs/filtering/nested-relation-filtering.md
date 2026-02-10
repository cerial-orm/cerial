---
title: Nested Relation Filtering
parent: Filtering
nav_order: 6
---

# Nested Relation Filtering

Cerial supports filtering records based on the fields of related models. You can traverse forward relations, reverse relations, and even multi-level relation chains.

## Basic Nested Filtering

Filter on a related model's fields by nesting conditions under the relation field name:

```typescript
// Find users whose profile bio contains 'developer'
const users = await db.User.findMany({
  where: {
    profile: { bio: { contains: 'developer' } },
  },
});
```

The filter is applied as a subquery — it finds records where **at least one** related record matches the criteria.

## Forward Relations

Forward relations are defined with the `@field()` decorator and represent a direct reference from one model to another:

```typescript
// Schema:
// model Post {
//   author Relation @field(authorId) @model(User)
//   authorId Record
// }

// Find posts by a specific author name
const posts = await db.Post.findMany({
  where: {
    author: { name: 'Alice' },
  },
});
```

## Reverse Relations

Reverse relations are the inverse of forward relations — they represent the "has many" or "has one" side:

```typescript
// Schema:
// model User {
//   posts Relation[] @model(Post)
// }

// Find users who have at least one published post
const users = await db.User.findMany({
  where: {
    posts: { status: 'published' },
  },
});
```

## Multiple Conditions on Related Fields

You can apply multiple conditions to the related model's fields:

```typescript
// Find users who have posts about TypeScript created in 2024
const users = await db.User.findMany({
  where: {
    posts: {
      title: { contains: 'TypeScript' },
      createdAt: { gte: new Date('2024-01-01') },
    },
  },
});
```

All conditions within a nested relation filter are ANDed together — the related record must match all specified conditions.

## Multi-Level Nesting

You can chain nested filters through multiple levels of relations:

```typescript
// Find users who have posts written by authors whose name starts with 'J'
const users = await db.User.findMany({
  where: {
    posts: {
      author: { name: { startsWith: 'J' } },
    },
  },
});
```

```typescript
// Find categories that contain posts by active users
const categories = await db.Category.findMany({
  where: {
    posts: {
      author: {
        isActive: true,
        role: { in: ['admin', 'editor'] },
      },
    },
  },
});
```

## Using All Filter Operators

All standard filter operators work inside nested relation filters — comparison, string, array, logical, and special operators:

```typescript
const users = await db.User.findMany({
  where: {
    posts: {
      // Comparison
      viewCount: { gte: 100 },
      // String
      title: { startsWith: 'Guide' },
      // Array
      tags: { hasAny: ['typescript', 'javascript'] },
      // Special
      deletedAt: { isNull: true },
    },
  },
});
```

### Logical Operators in Nested Filters

```typescript
const users = await db.User.findMany({
  where: {
    posts: {
      OR: [{ status: 'published' }, { status: 'featured' }],
    },
  },
});
```

```typescript
const users = await db.User.findMany({
  where: {
    posts: {
      NOT: { status: 'draft' },
      createdAt: { gte: new Date('2024-01-01') },
    },
  },
});
```

## Combining Nested and Top-Level Filters

Nested relation filters can be combined with direct field filters on the parent model:

```typescript
const users = await db.User.findMany({
  where: {
    // Direct field filter
    isActive: true,
    age: { gte: 18 },
    // Nested relation filter
    posts: { status: 'published' },
    profile: { bio: { isNone: false } },
  },
});
```

## Nested Filters Across Query Methods

Nested relation filters work in `where` clauses for all query methods:

```typescript
// Count users with published posts
const count = await db.User.count({
  where: {
    posts: { status: 'published' },
  },
});

// Check if any user has a verified profile
const hasVerified = await db.User.exists({
  where: {
    profile: { isVerified: true },
  },
});

// Update users who have overdue tasks
await db.User.updateMany({
  where: {
    tasks: { dueDate: { lt: new Date() } },
  },
  data: { hasOverdueTasks: true },
});

// Delete posts by inactive authors
await db.Post.deleteMany({
  where: {
    author: { isActive: false },
  },
});
```
