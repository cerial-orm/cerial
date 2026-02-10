---
title: '@now'
parent: Decorators
grand_parent: Schema
nav_order: 3
---

# @now

Automatically sets a `Date` field to the current timestamp at creation time.

## Syntax

```cerial
model Post {
  id Record @id
  title String
  createdAt Date @now
}
```

## Behavior

- **Only for `Date` fields** — The `@now` decorator can only be applied to fields of type `Date`.
- **Auto-populated on create** — The field is set to the current server time (`time::now()` in SurrealQL) when a record is created. You do not need to provide it in the create data.
- **Not auto-updated** — The value is set once at creation and does not update automatically on subsequent changes. If you need an "updated at" timestamp, set it manually in update operations.

## TypeScript

The `@now` field is omitted from the required create input — it is automatically populated by the database.

```typescript
// No need to provide createdAt
const post = await db.Post.create({
  data: { title: 'Hello World' },
});

// createdAt is automatically set
console.log(post.createdAt); // Date object — e.g., 2025-01-15T10:30:00.000Z
```

## Example: Timestamps

A common pattern is to add a `createdAt` timestamp to models:

```cerial
model User {
  id Record @id
  email Email @unique
  name String
  createdAt Date @now
}

model Comment {
  id Record @id
  content String
  createdAt Date @now
  postId Record
  post Relation @field(postId) @model(Post)
}
```

```typescript
const user = await db.User.create({
  data: { email: 'alice@example.com', name: 'Alice' },
});
console.log(user.createdAt); // automatically set to creation time

const comment = await db.Comment.create({
  data: { content: 'Great post!', post: { connect: postId } },
});
console.log(comment.createdAt); // automatically set to creation time
```
