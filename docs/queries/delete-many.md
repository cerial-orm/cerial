---
title: deleteMany
parent: Queries
nav_order: 8
---

# deleteMany

Deletes all records matching the where clause. Returns the count of deleted records.

## Options

| Option  | Type         | Required | Description                                     |
| ------- | ------------ | -------- | ----------------------------------------------- |
| `where` | `WhereInput` | Yes      | Filter conditions to match records for deletion |

## Basic Usage

```typescript
const count = await db.User.deleteMany({
  where: { isActive: false },
});
// count: number (number of deleted records)
```

## With Complex Filter

```typescript
const count = await db.Post.deleteMany({
  where: {
    createdAt: { lt: new Date('2024-01-01') },
    content: { isNull: true },
  },
});
// count: number
```

## Multiple Conditions

```typescript
const count = await db.Session.deleteMany({
  where: {
    expiresAt: { lt: new Date() },
    isRevoked: true,
  },
});
```

## Cascade Behavior

When records are deleted, Cerial automatically handles related records based on their relationship configuration:

- **Required foreign keys** pointing to the deleted records trigger auto-cascade deletion. If a `Post` has a required `authorId` and the referenced `User` is deleted, the `Post` is also deleted.
- **Optional foreign keys** follow their `@onDelete` strategy (e.g., set to null or cascade).
- **Array foreign keys** have the deleted record's ID removed from the array.

This cascade logic runs within the same transaction as the delete operation, ensuring data consistency.

## Return Value

- Returns a `number` indicating how many records were deleted.
- Returns `0` if no records match the `where` clause.
