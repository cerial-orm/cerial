---
title: '@createdAt'
parent: Decorators
grand_parent: Schema
nav_order: 4
---

# @createdAt

Automatically sets a `Date` field to the current timestamp when a record is created. The value is stored in the database and does not change on subsequent updates.

## Syntax

```cerial
model Post {
  id Record @id
  title String
  createdAt Date @createdAt
}
```

## Behavior

- **Only for `Date` fields** — The `@createdAt` decorator can only be applied to fields of type `Date`.
- **Set on creation** — The field defaults to `time::now()` when a record is created and the field is not provided. The SurrealQL definition is `DEFAULT time::now()`.
- **Can be overridden** — Unlike `@now`, you can provide an explicit value when creating a record. If you supply a value, the database uses your value instead of the current timestamp.
- **Not auto-updated** — The value is set once at creation and does not change on subsequent updates.
- **Optional in create input** — The generated `CreateInput` type makes this field optional since the database provides a default.

## TypeScript

The `@createdAt` field is optional in the create input — it is automatically populated by the database if omitted:

```typescript
// createdAt is auto-set to the current time
const post = await db.Post.create({
  data: { title: 'Hello World' },
});
console.log(post.createdAt); // Date object — e.g., 2025-01-15T10:30:00.000Z

// Or provide an explicit value
const backdatedPost = await db.Post.create({
  data: {
    title: 'Old Post',
    createdAt: new Date('2024-01-01'),
  },
});
console.log(backdatedPost.createdAt); // 2024-01-01T00:00:00.000Z
```

The field is present in `WhereInput` for filtering:

```typescript
const recentPosts = await db.Post.findMany({
  where: { createdAt: { gte: new Date('2025-01-01') } },
});
```

## Object Fields

`@createdAt` can be applied to `Date` fields within object definitions:

```cerial
object ContactInfo {
  email Email
  createdAt Date @createdAt
}

model User {
  id Record @id
  contact ContactInfo
}
```

When an object has `@createdAt` fields, Cerial generates an additional `ContactInfoCreateInput` type where those fields are optional:

```typescript
// createdAt is auto-set by the database
const user = await db.User.create({
  data: {
    contact: { email: 'alice@example.com' },
    // createdAt will be set to the current time
  },
});
```

## Example: Timestamps

A common pattern is to add a `createdAt` timestamp to models:

```cerial
model User {
  id Record @id
  email Email @unique
  name String
  createdAt Date @createdAt
}

model Comment {
  id Record @id
  content String
  createdAt Date @createdAt
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

## Comparison

| Decorator                  | Stored | Set on create  | Updated on write | Can override |
| -------------------------- | ------ | -------------- | ---------------- | ------------ |
| `@createdAt`               | Yes    | Yes            | No               | Yes          |
| [`@updatedAt`](updated-at) | Yes    | Yes            | Yes              | Yes          |
| [`@now`](now)              | No     | N/A (computed) | N/A (computed)   | No           |
