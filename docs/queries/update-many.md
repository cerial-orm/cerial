---
title: updateMany
parent: Queries
nav_order: 6
---

# updateMany

Updates all records matching the where clause. Returns the updated records as an array.

## Options

| Option   | Type          | Required | Description                        |
| -------- | ------------- | -------- | ---------------------------------- |
| `where`  | `WhereInput`  | Yes      | Filter conditions to match records |
| `data`   | `UpdateInput` | Yes      | The fields and values to update    |
| `select` | `SelectInput` | No       | Narrow which fields are returned   |

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

## Setting Optional Fields to null or NONE

```typescript
// Set to null (field present with null value)
await db.User.updateMany({
  where: { id: userId },
  data: { bio: null },
});

// To remove a field entirely (NONE), omit it from the data object.
// Fields not included in data are left unchanged.
```

## Return Value

- Returns an array of updated records, typed according to `select` if provided.
- Returns an empty array `[]` if no records match the `where` clause.
