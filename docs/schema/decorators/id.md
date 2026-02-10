---
title: '@id'
parent: Decorators
grand_parent: Schema
nav_order: 1
---

# @id

Marks a field as the model's primary record identifier. Every model must have exactly one `@id` field.

## Syntax

```cerial
model User {
  id Record @id
  name String
}
```

## Rules

- **One per model** — Each model must have exactly one field with `@id`.
- **Must be `Record` type** — SurrealDB IDs are record references in `table:id` format, so the `@id` field must be a `Record`.
- **Field name is conventionally `id`** — While the decorator is what matters, the field should be named `id` by convention.

## Special Handling

The `@id` field receives special treatment throughout the system:

- **Skipped in migrations** — SurrealDB automatically manages the `id` field, so no `DEFINE FIELD` statement is generated for it.
- **No "Record needs Relation" validation** — Normally, a `Record` field must be paired with a `Relation` field. The `@id` field is exempt from this rule.
- **No null defaulting** — Optional `Record` fields can be defaulted to `null`, but the `@id` field is never treated this way.
- **Always present** — The `id` field is always returned by SurrealDB and is always available on query results.

## TypeScript Types

The `@id` field produces a `CerialId` on output and accepts `RecordIdInput` on input:

```typescript
const user = await db.User.create({ data: { name: 'Alice' } });

// Output is CerialId
console.log(user.id); // CerialId { table: 'user', id: '...' }
console.log(user.id.id); // 'ulid-or-generated-id'
console.log(user.id.table); // 'user'
console.log(user.id.toString()); // 'user:ulid-or-generated-id'

// Input accepts string
await db.User.findOne({ where: { id: 'some-id' } });

// Input accepts CerialId
await db.User.findOne({ where: { id: user.id } });
```
