---
title: deleteUnique
parent: Queries
nav_order: 9
---

# deleteUnique

Deletes a single record identified by a unique field. Provides flexible return options to indicate whether the record existed and optionally retrieve its data.

## Options

| Option   | Type                                    | Required | Description                                         |
| -------- | --------------------------------------- | -------- | --------------------------------------------------- |
| `where`  | `UniqueWhereInput`                      | Yes      | Must contain a unique field (id or `@unique` field) |
| `return` | `undefined \| null \| true \| 'before'` | No       | Controls the return value                           |

## Return Options

| `return` Value        | Return Type     | Description                                                        |
| --------------------- | --------------- | ------------------------------------------------------------------ |
| `undefined` (default) | `boolean`       | Always `true` (operation completed)                                |
| `null`                | `boolean`       | Always `true` (operation completed)                                |
| `true`                | `boolean`       | `true` if the record existed and was deleted, `false` if not found |
| `'before'`            | `Model \| null` | The deleted record's data, or `null` if not found                  |

## Basic Usage

```typescript
const result = await db.User.deleteUnique({
  where: { id: '123' },
});
// result: boolean (always true)
```

## Check If Record Existed

Use `return: true` to find out whether a record was actually deleted:

```typescript
const existed = await db.User.deleteUnique({
  where: { id: '123' },
  return: true,
});
// existed: boolean (true if record existed and was deleted)

if (!existed) {
  console.log('User was already deleted or never existed');
}
```

## Get Deleted Record Data

Use `return: 'before'` to retrieve the full record data as it was before deletion:

```typescript
const deletedUser = await db.User.deleteUnique({
  where: { id: '123' },
  return: 'before',
});
// deletedUser: User | null

if (deletedUser) {
  console.log(`Deleted user: ${deletedUser.name}`);
  // Useful for audit logs, undo operations, etc.
}
```

## Delete by Unique Field

Any field decorated with `@unique` in your schema can be used in the `where` clause:

```typescript
await db.User.deleteUnique({
  where: { email: 'john@example.com' },
});
```

```typescript
const deleted = await db.User.deleteUnique({
  where: { email: 'john@example.com' },
  return: 'before',
});
// deleted: User | null
```

## Cascade Behavior

The same cascade rules as [`deleteMany`](delete-many#cascade-behavior) apply:

- Required foreign keys pointing to the deleted record trigger auto-cascade deletion.
- Optional foreign keys follow their `@onDelete` strategy.
- Array foreign keys have the deleted record's ID removed.

## Return Value

Depends on the `return` option — see the [return options table](#return-options) above.
