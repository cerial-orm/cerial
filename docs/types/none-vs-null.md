---
title: NONE vs null
parent: Type System
nav_order: 2
---

# NONE vs null

SurrealDB distinguishes between two kinds of "empty" values:

- **NONE** — the field doesn't exist at all (absent from the record)
- **null** — the field exists and its value is explicitly `null`

This is different from most databases where `NULL` means both "absent" and "no value." Cerial's type system preserves this distinction in TypeScript using `undefined` for NONE and `null` for null.

## Schema-Level Behavior

How your schema definition maps to TypeScript types and runtime behavior:

| Schema                         | TypeScript Type            | `undefined` on create         | `null` on create                 |
| ------------------------------ | -------------------------- | ----------------------------- | -------------------------------- |
| `field String?`                | `field?: string \| null`   | NONE (field absent)           | null stored in DB                |
| `field String? @default(null)` | `field?: string \| null`   | null stored (default applies) | null stored in DB                |
| `field Relation?`              | `field?: Related \| null`  | NONE                          | null stored                      |
| `field Record?`                | `field?: CerialId \| null` | NONE                          | NONE (record refs can't be null) |

Key observations:

- **Optional fields without `@default`** treat `undefined` as NONE — the field is simply not stored.
- **Optional fields with `@default(null)`** treat `undefined` as "apply the default" — so `null` gets stored.
- **Optional Record fields** treat `null` as NONE because SurrealDB record references cannot hold a null value.

## Runtime Behavior

### Optional String (no default)

```typescript
// field String? — user chooses NONE or null

await db.User.create({ data: { name: 'John' } });
// name = 'John'

await db.User.create({ data: { name: undefined } });
// name field NOT stored (NONE)

await db.User.create({ data: { name: null } });
// name = null (explicitly stored)
```

### Optional String with @default(null)

```typescript
// field String? @default(null) — undefined defaults to null

await db.User.create({ data: { bio: 'Hello' } });
// bio = 'Hello'

await db.User.create({ data: { bio: undefined } });
// bio = null (default applied by Cerial)

await db.User.create({ data: { bio: null } });
// bio = null (explicit null)
```

### Optional Record Field

```typescript
// field Record? — null is treated as NONE

await db.User.create({ data: { profileId: 'abc' } });
// profileId = record reference to profile:abc

await db.User.create({ data: { profileId: undefined } });
// profileId NOT stored (NONE)

await db.User.create({ data: { profileId: null } });
// profileId NOT stored (NONE — record refs can't be null)
```

## Query Operators

Cerial provides specific operators for querying NONE and null values:

| Operator            | SurrealQL       | Description                       |
| ------------------- | --------------- | --------------------------------- |
| `{ eq: null }`      | `field = NULL`  | Field is null (not NONE)          |
| `{ neq: null }`     | `field != NULL` | Field is not null (could be NONE) |
| `{ isNone: true }`  | `field = NONE`  | Field is absent                   |
| `{ isNone: false }` | `field != NONE` | Field is present (could be null)  |

### Finding null Values

```typescript
// Find users where bio is explicitly null
await db.User.findMany({
  where: { bio: { eq: null } },
});
// SurrealQL: SELECT * FROM user WHERE bio = NULL
```

### Finding Absent Fields (NONE)

```typescript
// Find users where bio doesn't exist at all
await db.User.findMany({
  where: { bio: { isNone: true } },
});
// SurrealQL: SELECT * FROM user WHERE bio = NONE
```

### Finding Present Fields

```typescript
// Find users where bio exists (could be null or have a value)
await db.User.findMany({
  where: { bio: { isNone: false } },
});
// SurrealQL: SELECT * FROM user WHERE bio != NONE
```

### Combining Operators

```typescript
// Find users where bio exists AND is not null (has an actual value)
await db.User.findMany({
  where: {
    bio: {
      isNone: false,
      neq: null,
    },
  },
});
```

## Update Behavior

When updating records, the distinction between NONE and null determines whether a field is cleared or removed:

### Setting a Field to null

Sets the field value to `null` in the database. The field still exists and is queryable with `{ eq: null }`.

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { bio: null },
});
// SurrealQL: UPDATE user SET bio = NULL
```

### Removing a Field (NONE)

Removes the field entirely from the record. After this, `{ isNone: true }` will match.

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { bio: { unset: true } },
});
// SurrealQL: UPDATE user SET bio = NONE
```

### Disconnecting Optional Relations

For optional relation fields, disconnecting sets the field to `NULL` (so it's queryable):

```typescript
await db.User.updateUnique({
  where: { id: userId },
  data: {
    profile: { disconnect: true },
  },
});
// SurrealQL: UPDATE user SET profileId = NULL
```

## Implementation Details

The NONE/null distinction is handled in several places:

| Component                                     | Responsibility                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `applyNowDefaults()` in `data-transformer.ts` | Applies `@default(null)` — converts `undefined` to `null` for fields with null defaults |
| `applyNowDefaults()` in `data-transformer.ts` | Filters out `null` for Record fields — converts to NONE since record refs can't be null |
| Nested builder                                | Skips `undefined` values (NONE) and `null` for Record fields                            |
| Type generator                                | Adds `\| null` for all optional non-Record fields                                       |
| Migration generator                           | Uses `option<T \| null>` for optional fields to accept both NONE and null               |

## Practical Guidelines

1. **Use `null` when you want to explicitly mark a field as "no value"** — the field still exists and can be queried with `{ eq: null }`.

2. **Use `undefined` (or omit the field) when the field shouldn't exist** — this is useful for sparse data where most records don't have a particular field.

3. **Use `@default(null)` when you want optional fields to always have a value** — this ensures the field is never NONE, making queries simpler since you only need to check for `null`.

4. **Remember that Record fields can't be null** — if you set a Record field to `null`, Cerial silently treats it as NONE. This is by design since SurrealDB record references must point to a valid record or not exist.
