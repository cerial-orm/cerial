---
title: '@field and @model'
parent: Decorators
grand_parent: Schema
nav_order: 5
---

# @field and @model

These two decorators configure relation fields. They are always used on `Relation` type fields to define how models are connected.

- `@field(name)` — Specifies which `Record` field stores the foreign key.
- `@model(Name)` — Specifies the target model of the relation.

## Forward Relations

A forward relation is defined on the model that **owns** the foreign key. It uses both `@field()` and `@model()`:

```cerial
model Post {
  id Record @id
  title String
  authorId Record                                  # FK storage field
  author Relation @field(authorId) @model(User)    # Forward relation
}
```

- `@field(authorId)` tells Cerial that the `authorId` Record field stores the actual foreign key value.
- `@model(User)` tells Cerial that this relation points to the `User` model.

## Reverse Relations

A reverse relation is defined on the model that **does not** own the foreign key. It uses only `@model()` (no `@field`):

```cerial
model User {
  id Record @id
  name String
  posts Relation[] @model(Post)                    # Reverse relation
}
```

Cerial automatically resolves the reverse relation by finding the matching forward relation on the `Post` model.

## Complete Example

```cerial
model User {
  id Record @id
  name String
  posts Relation[] @model(Post)
  profile Relation? @model(Profile)
}

model Post {
  id Record @id
  title String
  content String
  authorId Record
  author Relation @field(authorId) @model(User)
}

model Profile {
  id Record @id
  bio String
  userId Record
  user Relation @field(userId) @model(User)
}
```

```typescript
// Create a post connected to a user
const post = await db.Post.create({
  data: {
    title: 'Hello World',
    content: 'My first post',
    author: { connect: userId },
  },
});

// Include related posts when querying a user
const user = await db.User.findOne({
  where: { id: userId },
  include: { posts: true },
});
// user.posts: Post[]
```

## Relation Cardinality

The combination of type modifier and direction determines the relation cardinality:

| Schema                           | Cardinality           | Description                 |
| -------------------------------- | --------------------- | --------------------------- |
| `Relation @field(fk) @model(X)`  | One-to-one (required) | FK always has a value       |
| `Relation? @field(fk) @model(X)` | One-to-one (optional) | FK can be null/absent       |
| `Relation[] @model(X)`           | One-to-many (reverse) | No FK, resolved from target |

## Rules

- Every `@field()` must reference a `Record` or `Record?` field in the same model.
- Every `Relation` with `@field()` must also have `@model()`.
- Reverse relations (`Relation[]` or `Relation?` without `@field`) only need `@model()`.
- If multiple relations exist between the same two models, use [`@key`](key) to disambiguate.
