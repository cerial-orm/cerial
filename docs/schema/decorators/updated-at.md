---
title: '@updatedAt'
parent: Decorators
grand_parent: Schema
nav_order: 5
---

# @updatedAt

Automatically sets a `Date` field to the current timestamp on every create and update. The value is stored in the database and re-set each time the record is written.

## Syntax

```cerial
model Post {
  id Record @id
  title String
  updatedAt Date @updatedAt
}
```

## Behavior

- **Only for `Date` fields** — The `@updatedAt` decorator can only be applied to fields of type `Date`.
- **Set on creation and every update** — The field defaults to `time::now()` when a record is created, and is re-set to `time::now()` on every subsequent update when the field is absent from the update data. The SurrealQL definition is `DEFAULT ALWAYS time::now()`.
- **Always reflects last write** — The value always represents the last time the record was written to.
- **User values respected** — If you explicitly provide a value for an `@updatedAt` field, your value is used instead of the automatic timestamp.
- **Optional in create and update inputs** — The generated `CreateInput` and `UpdateInput` types make this field optional since the database provides a default.
- **Automatic NONE injection** — On update queries, Cerial automatically sets omitted `@updatedAt` fields to `NONE`, which triggers SurrealDB's `DEFAULT ALWAYS` to re-apply `time::now()`. Without this, the existing value would be preserved.

## TypeScript

The `@updatedAt` field is optional in both create and update inputs:

```typescript
// updatedAt is auto-set on creation
const post = await db.Post.create({
  data: { title: 'Hello World' },
});
console.log(post.updatedAt); // Date object — creation time

// updatedAt is auto-updated on every write
const updated = await db.Post.updateUnique({
  where: { id: post.id },
  data: { title: 'Updated Title' },
});
console.log(updated.updatedAt); // Date object — update time (later than creation)
```

The field is present in `WhereInput` for filtering:

```typescript
const recentlyModified = await db.Post.findMany({
  where: { updatedAt: { gte: new Date('2025-01-01') } },
});
```

## Object Fields

`@updatedAt` can be applied to `Date` fields within object definitions:

```cerial
object Metadata {
  source String
  updatedAt Date @updatedAt
}

model Document {
  id Record @id
  title String
  meta Metadata
}
```

When an object has `@updatedAt` fields, Cerial generates an additional `MetadataCreateInput` type where those fields are optional.

## Example: Full Timestamps

Combine `@createdAt` and `@updatedAt` for a complete timestamp pattern:

```cerial
model Article {
  id Record @id
  title String
  content String
  createdAt Date @createdAt
  updatedAt Date @updatedAt
}
```

```typescript
const article = await db.Article.create({
  data: { title: 'My Article', content: 'Hello' },
});
console.log(article.createdAt); // creation time
console.log(article.updatedAt); // same as createdAt initially

// After an update, only updatedAt changes
const updated = await db.Article.updateUnique({
  where: { id: article.id },
  data: { content: 'Updated content' },
});
console.log(updated.createdAt); // unchanged — still creation time
console.log(updated.updatedAt); // new timestamp — update time
```

## Comparison

| Decorator                  | Stored | Set on create  | Updated on write | Can override |
| -------------------------- | ------ | -------------- | ---------------- | ------------ |
| [`@createdAt`](created-at) | Yes    | Yes            | No               | Yes          |
| `@updatedAt`               | Yes    | Yes            | Yes              | Yes          |
| [`@now`](now)              | No     | N/A (computed) | N/A (computed)   | No           |
