---
title: updateUnique
parent: Queries
nav_order: 8
---

# updateUnique

Updates a single record identified by a unique field. Provides flexible return options to control what the method gives back.

## Options

| Option    | Type                                       | Required | Description                                                    |
| --------- | ------------------------------------------ | -------- | -------------------------------------------------------------- |
| `where`   | `UniqueWhereInput`                         | Yes      | Must contain a unique field; may include additional conditions |
| `data`    | `UpdateInput`                              | Yes      | The fields and values to update                                |
| `unset`   | `UnsetInput`                               | No       | Fields to remove (set to NONE) in bulk                         |
| `select`  | `SelectInput`                              | No       | Narrow returned fields (not available with `return: 'before'`) |
| `include` | `IncludeInput`                             | No       | Include relations (not available with `return: 'before'`)      |
| `return`  | `undefined \| 'after' \| true \| 'before'` | No       | Controls the return value                                      |

## Return Options

| `return` Value        | Return Type     | Description                                                                  |
| --------------------- | --------------- | ---------------------------------------------------------------------------- |
| `undefined` (default) | `Model \| null` | The updated record, or `null` if not found                                   |
| `'after'`             | `Model \| null` | Same as default — the post-update state                                      |
| `true`                | `boolean`       | `true` if the record was found and updated, `false` if not                   |
| `'before'`            | `Model \| null` | The pre-update state of the record; `select` and `include` are not available |

## Basic Usage

```typescript
const user = await db.User.updateUnique({
  where: { id: '123' },
  data: { name: 'New Name' },
});
// user: User | null
```

## By Unique Field

```typescript
const user = await db.User.updateUnique({
  where: { email: 'john@example.com' },
  data: { name: 'John Doe' },
});
// user: User | null
```

## With Select

```typescript
const user = await db.User.updateUnique({
  where: { id: '123' },
  data: { name: 'John' },
  select: { id: true, name: true },
});
// user: { id: CerialId; name: string } | null
```

## With Include

```typescript
const user = await db.User.updateUnique({
  where: { id: '123' },
  data: { name: 'John' },
  include: { profile: true },
});
// user: (User & { profile: Profile }) | null
```

## Boolean Return

When you only need to know whether the update succeeded:

```typescript
const updated = await db.User.updateUnique({
  where: { id: '123' },
  data: { name: 'John' },
  return: true,
});
// updated: boolean
```

## Get State Before Update

Retrieve the record as it was before the update was applied:

```typescript
const oldUser = await db.User.updateUnique({
  where: { id: '123' },
  data: { name: 'New Name' },
  return: 'before',
});
// oldUser: User | null (state before update)
```

Note: `select` and `include` are not available when using `return: 'before'`. The full model type is always returned.

## Additional Where Conditions

You can include additional filter conditions alongside the unique field. The update only proceeds if all conditions are satisfied:

```typescript
const user = await db.User.updateUnique({
  where: { id: '123', isActive: true },
  data: { name: 'Active User' },
});
// Only updates if BOTH id matches AND isActive is true
// Returns null if the record exists but isActive is false
```

## Unsetting Fields

The `unset` parameter removes optional fields in bulk. See [`updateMany` — Unsetting Fields](update-many#unsetting-fields) for full details and examples. The behavior is identical for `updateUnique`:

```typescript
const user = await db.User.updateUnique({
  where: { id: '123' },
  data: { name: 'Updated' },
  unset: { bio: true, address: { zip: true } },
});
// Updates name, removes bio and address.zip
```

## Nested Relation Operations

Like `updateMany`, you can use `connect`, `disconnect`, and `create` on relation fields:

```typescript
const user = await db.User.updateUnique({
  where: { id: '123' },
  data: {
    profile: { create: { bio: 'Hello world' } },
    tags: { connect: ['tag:typescript', 'tag:surreal'] },
  },
});
```

## Return Value

Depends on the `return` option — see the [return options table](#return-options) above.
