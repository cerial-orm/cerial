---
title: NONE vs null
parent: Type System
nav_order: 2
---

# NONE vs null

SurrealDB distinguishes between three field states:

- **Value** — the field exists and has a typed value
- **NONE** — the field doesn't exist at all (absent from the record)
- **null** — the field exists and its value is explicitly `null`

Cerial models these states using two independent schema modifiers:

- **`?` (optional)** — enables NONE. Maps to `undefined` in TypeScript.
- **`@nullable`** — enables null. Maps to `| null` in TypeScript.

## The Three-State Model

| Schema                  | TypeScript Output      | Allowed States    | Migration                     |
| ----------------------- | ---------------------- | ----------------- | ----------------------------- |
| `name String`           | `name: string`         | value             | `TYPE string`                 |
| `bio String?`           | `bio?: string`         | value, NONE       | `TYPE option<string>`         |
| `bio String @nullable`  | `bio: string \| null`  | value, null       | `TYPE string \| null`         |
| `bio String? @nullable` | `bio?: string \| null` | value, null, NONE | `TYPE option<string \| null>` |

Key observations:

- **`?` without `@nullable`** — the field can be absent (NONE) but **cannot** be null. Passing `null` is a validation error.
- **`@nullable` without `?`** — the field must always be present but can be null. The field is required on create (you must pass a value or `null`).
- **Both `?` and `@nullable`** — the field can be any of: a typed value, `null`, or absent (NONE).

## Runtime Behavior

### Optional-Only (`String?`)

```typescript
// Schema: bio String?

await db.User.create({ data: { name: 'Alice' } });
// bio is NONE (field absent in DB)

await db.User.create({ data: { name: 'Bob', bio: 'Hello' } });
// bio = 'Hello'

await db.User.create({ data: { name: 'Carol', bio: null } });
// Error: bio is not nullable — use undefined/omit to unset
```

### Nullable-Only (`String @nullable`)

```typescript
// Schema: deletedAt Date @nullable

await db.User.create({ data: { name: 'Alice', deletedAt: null } });
// deletedAt = null (stored as null)

await db.User.create({ data: { name: 'Bob', deletedAt: new Date() } });
// deletedAt = current date

await db.User.create({ data: { name: 'Carol' } });
// Error: deletedAt is required (must be a Date or null)
```

### Optional + Nullable (`String? @nullable`)

```typescript
// Schema: bio String? @nullable

await db.User.create({ data: { name: 'Alice' } });
// bio is NONE (field absent)

await db.User.create({ data: { name: 'Bob', bio: null } });
// bio = null (explicit null stored)

await db.User.create({ data: { name: 'Carol', bio: 'Hello' } });
// bio = 'Hello'
```

### Optional Record Fields

```typescript
// Schema: authorId Record? @nullable

await db.Post.create({ data: { title: 'Draft' } });
// authorId is NONE (field absent — no FK stored)

await db.Post.create({ data: { title: 'Orphan', authorId: null } });
// authorId = null (explicit null — "unassigned")

await db.Post.create({ data: { title: 'Post', authorId: userId } });
// authorId = record reference to user
```

Without `@nullable`, `Record?` only supports value or NONE — `null` is rejected.

## Query Operators

Cerial provides specific operators based on the field modifiers:

| Operator           | Available on          | SurrealQL       | Description               |
| ------------------ | --------------------- | --------------- | ------------------------- |
| `isNull: true`     | `@nullable` fields    | `field = NULL`  | Field is null             |
| `isNull: false`    | `@nullable` fields    | `field != NULL` | Field is not null         |
| `isNone: true`     | `?` (optional) fields | `field = NONE`  | Field is absent           |
| `isNone: false`    | `?` (optional) fields | `field != NONE` | Field is present          |
| `isDefined: true`  | `?` (optional) fields | `field != NONE` | Alias for `isNone: false` |
| `isDefined: false` | `?` (optional) fields | `field = NONE`  | Alias for `isNone: true`  |

### Finding null Values

```typescript
// Only on @nullable fields
await db.User.findMany({
  where: { deletedAt: { isNull: true } },
});
// SurrealQL: WHERE deletedAt = NULL
```

### Finding Absent Fields (NONE)

```typescript
// Only on optional (?) fields
await db.User.findMany({
  where: { bio: { isNone: true } },
});
// SurrealQL: WHERE bio = NONE
```

### Combining on Optional + Nullable Fields

```typescript
// Schema: bio String? @nullable — has all three operators

// Find users where bio doesn't exist at all
await db.User.findMany({ where: { bio: { isNone: true } } });

// Find users where bio is explicitly null
await db.User.findMany({ where: { bio: { isNull: true } } });

// Find users where bio has an actual value (not null, not NONE)
await db.User.findMany({
  where: { bio: { isNone: false, isNull: false } },
});
```

## Update Behavior

### Setting a Field to null

Only works on `@nullable` fields. Sets the field value to `null` in the database:

```typescript
// Schema: bio String? @nullable
await db.User.updateMany({
  where: { id: userId },
  data: { bio: null },
});
// SurrealQL: UPDATE user SET bio = NULL
```

### Removing a Field (NONE)

Only works on optional (`?`) fields. Import the `NONE` sentinel from cerial:

```typescript
import { NONE } from 'cerial';

await db.User.updateMany({
  where: { id: userId },
  data: { bio: NONE },
});
// SurrealQL: UPDATE user SET bio = NONE
```

### Disconnecting Optional Relations

How disconnect works depends on `@nullable`:

```typescript
// Record? (no @nullable) — disconnect sets FK to NONE
await db.Post.updateUnique({
  where: { id: postId },
  data: { author: { disconnect: true } },
});
// SurrealQL: UPDATE post SET authorId = NONE

// Record? @nullable — disconnect sets FK to NULL
await db.Post.updateUnique({
  where: { id: postId },
  data: { author: { disconnect: true } },
});
// SurrealQL: UPDATE post SET authorId = NULL
```

## The `@default(null)` Pattern

`@default(null)` requires `@nullable` on the field. It converts omitted values to `null` on create:

```cerial
model User {
  id Record @id
  bio String? @nullable @default(null)
}
```

```typescript
// Without @default(null): omitting = NONE
// With @default(null): omitting = null (default applied)
await db.User.create({ data: { name: 'Alice' } });
// bio = null (not NONE)
```

## Practical Guidelines

1. **Use `?` alone when the field is truly optional** — it either has a value or doesn't exist. Most optional fields fall here.

2. **Use `@nullable` alone for soft-delete patterns** — `deletedAt Date @nullable` is required but can be null (not deleted) or a Date (deleted at timestamp).

3. **Use `? @nullable` for FK fields that need null queries** — `authorId Record? @nullable` lets you query `{ isNull: true }` to find unassigned records, and `{ isNone: true }` to find records where the field was never set.

4. **Use `@default(null)` with `@nullable`** to ensure optional fields are always queryable by null instead of being absent.
