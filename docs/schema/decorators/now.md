---
title: '@now'
parent: Decorators
grand_parent: Schema
nav_order: 3
---

# @now

A computed field that evaluates to the current timestamp at query time. The value is **not stored** in the database — it is computed fresh on every read.

## Syntax

```cerial
model Post {
  id Record @id
  title String
  currentTime Date @now
}
```

## Behavior

- **Only for `Date` fields** — The `@now` decorator can only be applied to fields of type `Date`.
- **Computed, not stored** — The field is defined as `COMPUTED time::now()` in SurrealDB. It does not exist in the stored record — it is evaluated each time the record is read.
- **Output-only** — Because the value is computed by the database, it cannot be set in `create` or `update` operations. It is excluded from `CreateInput`, `UpdateInput`, and `WhereInput` types.
- **Always present in output** — The field is always returned when the record is read (unless excluded by `select`).

## TypeScript

The `@now` field is excluded from create and update inputs — you cannot provide or override it:

```typescript
const post = await db.Post.create({
  data: { title: 'Hello World' },
  // currentTime cannot be set — it's computed
});

// currentTime is always the current server time at read time
console.log(post.currentTime); // Date object — e.g., 2025-01-15T10:30:00.000Z
```

Since the value is computed on every read, it reflects the time the query was executed, not the time the record was created.

## Restrictions

`@now` is **only allowed on model fields**, not object fields. SurrealDB requires `COMPUTED` fields to be top-level — they cannot be defined on embedded object sub-fields. Use [`@createdAt`](created-at) or [`@updatedAt`](updated-at) for timestamp fields within objects.

## When to Use @now vs @createdAt vs @updatedAt

| Decorator    | Stored | Set on create  | Updated on write | Use case                    |
| ------------ | ------ | -------------- | ---------------- | --------------------------- |
| `@now`       | No     | N/A (computed) | N/A (computed)   | Current server time at read |
| `@createdAt` | Yes    | Yes            | No               | Record creation timestamp   |
| `@updatedAt` | Yes    | Yes            | Yes              | Last modification timestamp |

- Use [`@createdAt`](created-at) for timestamps that record when something was created.
- Use [`@updatedAt`](updated-at) for timestamps that track the last modification.
- Use `@now` when you need the current server time at the moment of reading, not a stored value.
