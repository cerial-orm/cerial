---
title: updateMany
parent: Queries
nav_order: 6
---

# updateMany

Updates all records matching the where clause. Returns the updated records as an array.

## Options

| Option   | Type          | Required | Description                            |
| -------- | ------------- | -------- | -------------------------------------- |
| `where`  | `WhereInput`  | Yes      | Filter conditions to match records     |
| `data`   | `UpdateInput` | Yes      | The fields and values to update        |
| `unset`  | `UnsetInput`  | No       | Fields to remove (set to NONE) in bulk |
| `select` | `SelectInput` | No       | Narrow which fields are returned       |

## Basic Usage

```typescript
const updated = await db.User.updateMany({
  where: { isActive: false },
  data: { isActive: true },
});
// updated: User[]
```

## With Select

```typescript
const updated = await db.User.updateMany({
  where: { isActive: false },
  data: { isActive: true },
  select: { id: true, isActive: true },
});
// updated: { id: CerialId; isActive: boolean }[]
```

## Scalar Field Updates

Update any scalar field by providing its new value:

```typescript
await db.User.updateMany({
  where: { role: 'guest' },
  data: {
    role: 'member',
    updatedAt: new Date(),
  },
});
```

## Array Field Operations

Array fields support special operations for adding and removing elements:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    nicknames: { push: 'NewNick' }, // Append an element
    scores: { unset: 100 }, // Remove an element by value
  },
});
```

## Object Field Updates

Embedded object fields support partial merging by default. Only the provided sub-fields are updated; other sub-fields remain unchanged.

```typescript
// Partial merge — only city is updated, street and state are preserved
await db.User.updateMany({
  where: { id: userId },
  data: { address: { city: 'New City' } },
});
```

For full replacement of an object field, use the `set` wrapper:

```typescript
// Full replacement — all sub-fields must be provided
await db.User.updateMany({
  where: { id: userId },
  data: {
    address: {
      set: { street: '456 Oak Ave', city: 'Boston', state: 'MA' },
    },
  },
});
```

## Nested Relation Operations

Update relation fields using `connect`, `disconnect`, and `create`:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    tags: {
      connect: ['tag:new1', 'tag:new2'],
      disconnect: ['tag:old'],
    },
  },
});
```

```typescript
await db.Post.updateMany({
  where: { authorId: oldAuthorId },
  data: {
    author: { connect: newAuthorId },
  },
});
```

## Unsetting Fields

The `unset` parameter removes optional fields in bulk by setting them to NONE (absent). This is a declarative alternative to importing and passing `NONE` in `data`.

```typescript
await db.User.updateMany({
  where: { isActive: false },
  unset: { bio: true, age: true },
});
// Removes bio and age from all matching records
```

### Nested Object Fields

Unset specific sub-fields within objects using nested syntax:

```typescript
await db.User.updateMany({
  where: { id: userId },
  unset: { address: { zip: true } },
});
// Removes only address.zip, preserving other address sub-fields
```

Optional objects can also be unset entirely:

```typescript
await db.User.updateMany({
  where: { id: userId },
  unset: { shipping: true },
});
// Removes the entire shipping object
```

### Combining data and unset

You can use `data` and `unset` together, as long as they don't conflict at the leaf level:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { name: 'Updated' },
  unset: { bio: true, address: { zip: true } },
});
// Updates name, removes bio and address.zip
```

TypeScript's `SafeUnset` utility type prevents leaf-level conflicts at compile time — if a field appears in `data`, it is excluded from the `unset` type. For objects, only conflicting sub-fields are excluded; non-overlapping sub-fields remain available.

## Setting Optional Fields to null or NONE

```typescript
// Set to null — requires @nullable on the field
await db.User.updateMany({
  where: { id: userId },
  data: { bio: null },
});
// SurrealQL: UPDATE user SET bio = NULL

// Remove a field entirely (NONE) — requires ? on the field
import { NONE } from 'cerial';

await db.User.updateMany({
  where: { id: userId },
  data: { bio: NONE },
});
// SurrealQL: UPDATE user SET bio = NONE
```

Both `unset` and `NONE` in `data` achieve the same result. Use `unset` for bulk removal of multiple fields; use `NONE` in `data` when removing a single field inline.

Fields not included in `data` or `unset` are left unchanged.

## Return Value

- Returns an array of updated records, typed according to `select` if provided.
- Returns an empty array `[]` if no records match the `where` clause.
