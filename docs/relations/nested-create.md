---
title: Nested Create
parent: Relations
nav_order: 7
---

# Nested Create

Nested create allows you to create related records inline within a single operation. Instead of creating records separately and then connecting them, you define the related data directly in the `data` object.

All nested create operations are executed within a **transaction** to ensure atomicity — either all records are created, or none are.

## Creating from the PK Side (Forward Relation)

When creating from the model that stores the FK, you can create the related record inline:

```typescript
// Create a post and its author in one operation
const post = await db.Post.create({
  data: {
    title: 'My First Post',
    author: {
      create: {
        name: 'John',
        email: 'john@example.com',
        isActive: true,
      },
    },
  },
});
// A new User is created first, then the Post is created with authorId pointing to the new User
```

The `create` object contains all the fields needed to create the related record. The FK (`authorId`) is automatically set — you do not provide it manually.

## Creating from the Non-PK Side (Reverse Relation)

When creating from the model that is _referenced by_ the FK, you can create child records that will automatically reference the new parent:

```typescript
// Create a user and their posts in one operation
const user = await db.User.create({
  data: {
    name: 'John',
    email: 'john@example.com',
    isActive: true,
    posts: {
      create: [{ title: 'First Post' }, { title: 'Second Post' }],
    },
  },
});
// The User is created first, then both Posts are created with authorId set to the new User's id
```

## Single vs Array Relations

The shape of the `create` value depends on whether the relation is singular or an array:

| Relation Type         | Create Syntax                                |
| --------------------- | -------------------------------------------- |
| `Relation` (singular) | `{ create: { ...fields } }`                  |
| `Relation[]` (array)  | `{ create: [{ ...fields }, { ...fields }] }` |

### Singular relation

```typescript
const profile = await db.Profile.create({
  data: {
    bio: 'Hello world',
    user: {
      create: { name: 'Alice', email: 'alice@example.com', isActive: true },
    },
  },
});
```

### Array relation

```typescript
const user = await db.User.create({
  data: {
    name: 'Alice',
    posts: {
      create: [{ title: 'Post 1' }, { title: 'Post 2' }, { title: 'Post 3' }],
    },
  },
});
```

## Mixing Create and Connect

You can use `create` and `connect` together in the same relation operation for array relations:

```typescript
const user = await db.User.create({
  data: {
    name: 'Bob',
    tags: {
      create: [{ name: 'new-tag' }],
      connect: [existingTagId],
    },
  },
});
// Creates a new Tag and connects to an existing Tag, all in one transaction
```

## Nested Create in Updates

Nested create is also available in update operations:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    posts: {
      create: [{ title: 'Another Post' }],
    },
  },
});
// Creates a new Post with authorId set to userId
```

## N:N with Nested Create

For many-to-many relations, nested create handles bidirectional sync automatically:

```typescript
const user = await db.User.create({
  data: {
    name: 'Charlie',
    tags: {
      create: [{ name: 'javascript' }, { name: 'typescript' }],
    },
  },
});
// 1. Creates the User
// 2. Creates both Tags
// 3. Sets User.tagIds to the new tag IDs
// 4. Sets each Tag.userIds to include the new User's ID
// All within a single transaction
```

## Type Safety

The `create` object is fully typed based on the target model's create input type. TypeScript will enforce that all required fields are present and all field types are correct:

```typescript
// Type error: 'email' is missing
const post = await db.Post.create({
  data: {
    title: 'My Post',
    author: {
      create: { name: 'John' }, // Error: Property 'email' is missing
    },
  },
});
```

## Transaction Guarantees

Nested create operations are wrapped in a transaction:

- If any part of the nested create fails (e.g., a unique constraint violation on a nested record), the entire operation is rolled back.
- The parent record is not created if a child record fails to create.
- For N:N relations, bidirectional sync is included in the same transaction.

Nested creates also work inside [`$transaction`](../queries/transaction.md) — all operations are covered by a single atomic transaction.
