---
title: upsert
parent: Queries
nav_order: 6
---

# upsert

Creates a record if it doesn't exist, or updates it if it does. The `where` clause determines which record to match, `create` provides data for new records, and `update` provides data for existing records. `create` is required — `update` is optional.

## Options

| Option    | Type                                       | Required | Description                                                  |
| --------- | ------------------------------------------ | -------- | ------------------------------------------------------------ |
| `where`   | `WhereInput` or `UniqueWhereInput`         | Yes      | Identifies the record to upsert                              |
| `create`  | `CreateInput`                              | Yes      | Data used when creating a new record (all required fields)   |
| `update`  | `UpdateInput`                              | No       | Data used when updating an existing record (partial)         |
| `unset`   | `UnsetInput`                               | No       | Fields to remove on update (set to NONE). Ignored on create. |
| `select`  | `SelectInput`                              | No       | Narrow which fields are returned                             |
| `include` | `IncludeInput`                             | No       | Include relations in the result                              |
| `return`  | `undefined \| 'after' \| true \| 'before'` | No       | Controls the return value                                    |

## Return Type

The return type depends on the `where` clause and the `return` option:

### Unique where (ID or unique field)

| `return` Value        | Return Type     | Description                                            |
| --------------------- | --------------- | ------------------------------------------------------ |
| `undefined` (default) | `Model \| null` | The upserted record, or `null` if not found/created    |
| `'after'`             | `Model \| null` | Same as default — the post-upsert state                |
| `true`                | `boolean`       | `true` if a record was created or updated              |
| `'before'`            | `Model \| null` | The pre-upsert state; `null` for newly created records |

### Non-unique where

| `return` Value        | Return Type | Description                                      |
| --------------------- | ----------- | ------------------------------------------------ |
| `undefined` (default) | `Model[]`   | All upserted records (updated matches + created) |
| `'after'`             | `Model[]`   | Same as default                                  |
| `true`                | `boolean`   | `true` if any records were affected              |
| `'before'`            | `Model[]`   | Previous states of matched records               |

## Basic Usage

Create or update a user identified by a unique email:

```typescript
const user = await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', isActive: true },
  update: { name: 'Jane Updated' },
});
// user: User | null
```

- If no user with that email exists, a new user is created with the `create` data.
- If a user already exists, only the `update` fields are applied. Fields not in `update` are preserved.

## By ID

```typescript
const user = await db.User.upsert({
  where: { id: 'user:abc123' },
  create: { name: 'John', email: 'john@example.com', isActive: true },
  update: { name: 'John Updated' },
});
// user: User | null
```

## Create Only (no update)

When only `create` is provided (no `update`), the record is created if it doesn't exist. If it already exists, the existing record is returned unchanged:

```typescript
const user = await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', isActive: true },
});
// Creates if not exists, returns existing unchanged if exists
```

This is useful for idempotent inserts — ensuring a record exists without modifying it.

## With Select

Return only specific fields from the upserted record:

```typescript
const user = await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', isActive: true },
  update: { name: 'Jane Updated' },
  select: { id: true, name: true },
});
// user: { id: CerialId; name: string } | null
```

## With Include

Include related records in the result:

```typescript
const user = await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', isActive: true },
  update: { name: 'Jane Updated' },
  include: { posts: true },
});
// user: (User & { posts: Post[] }) | null
```

## Boolean Return

When you only need to know whether the upsert succeeded:

```typescript
const success = await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', isActive: true },
  update: { name: 'Jane Updated' },
  return: true,
});
// success: boolean
```

## Get State Before Upsert

Retrieve the record as it was before the upsert. Returns `null` when the record didn't exist (i.e., it was created):

```typescript
const previous = await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', isActive: true },
  update: { name: 'Jane Updated' },
  return: 'before',
});
// Created: previous === null
// Updated: previous === User (pre-update state)
```

## Non-Unique Where

When the `where` clause does not contain an ID or `@unique` field, the upsert matches all records satisfying the condition. Matched records are updated, and if no records match, a new record is created. The result is always an array:

```typescript
const users = await db.User.upsert({
  where: { isActive: true },
  create: { name: 'Default User', email: 'default@example.com', isActive: true },
  update: { name: 'Bulk Updated' },
});
// users: User[]
```

The `return` option is also supported for non-unique upserts:

```typescript
const updated = await db.User.upsert({
  where: { isActive: true },
  create: { name: 'Default User', email: 'default@example.com', isActive: true },
  update: { name: 'Bulk Updated' },
  return: true,
});
// updated: boolean
```

## Nested Relations

Nested `create` and `connect` operations are supported in the `create` and `update` data for upserts with a unique where clause (ID or `@unique` field):

```typescript
const profile = await db.Profile.upsert({
  where: { id: 'profile:abc' },
  create: {
    bio: 'New profile',
    user: { create: { name: 'New User', email: 'new@example.com' } },
  },
  update: {
    bio: 'Updated profile',
    user: { connect: existingUserId },
  },
});
```

When the record is created, nested operations from the `create` data are executed. When the record is updated, nested operations from the `update` data are executed.

## Unsetting Fields

The `unset` parameter removes optional fields by setting them to NONE. It only applies to the **update path** — when a new record is created, `unset` is ignored:

```typescript
const user = await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', bio: 'Hello' },
  update: { name: 'Jane Updated' },
  unset: { bio: true },
});
// Create path: bio = 'Hello' (unset ignored)
// Update path: name updated, bio removed
```

See [`updateMany` — Unsetting Fields](update-many#unsetting-fields) for full details on nested object/tuple unset syntax and `SafeUnset` cross-exclusion with `update` data.

## Field Behavior

The `create` and `update` data are independent — each field is handled based on which object(s) it appears in:

| Field appears in | On create (new record)  | On update (existing record)  |
| ---------------- | ----------------------- | ---------------------------- |
| `create` only    | Uses the `create` value | Preserves the existing value |
| `update` only    | Field is absent (NONE)  | Uses the `update` value      |
| Both             | Uses the `create` value | Uses the `update` value      |

```typescript
await db.User.upsert({
  where: { email: 'jane@example.com' },
  create: { name: 'Jane', email: 'jane@example.com', isActive: true, age: 30 },
  update: { name: 'Jane Updated' },
});
// Create path: name='Jane', email='jane@example.com', isActive=true, age=30
// Update path: name='Jane Updated', all other fields preserved
```

## Transaction Support

Upsert queries work with `$transaction` for atomic batch execution:

```typescript
const [user1, user2] = await client.$transaction([
  client.db.User.upsert({
    where: { email: 'alice@example.com' },
    create: { name: 'Alice', email: 'alice@example.com', isActive: true },
    update: { name: 'Alice Updated' },
  }),
  client.db.User.upsert({
    where: { email: 'bob@example.com' },
    create: { name: 'Bob', email: 'bob@example.com', isActive: true },
    update: { name: 'Bob Updated' },
  }),
]);
```

## Auto-Populated Fields

On the create path, the same auto-population rules as [`create`](create) apply:

| Field Type        | Behavior                                                          |
| ----------------- | ----------------------------------------------------------------- |
| `@id`             | SurrealDB auto-generates the record ID                            |
| `@createdAt`      | Set to the current timestamp at creation time (can be overridden) |
| `@updatedAt`      | Set to the current timestamp at creation and on every update      |
| `@now`            | Computed at query time (not stored, cannot be set)                |
| `@default(value)` | Uses the default if the field is not provided                     |
| Array fields      | Default to `[]` if not provided                                   |
