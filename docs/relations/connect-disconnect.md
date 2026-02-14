---
title: Connect & Disconnect
parent: Relations
nav_order: 8
---

# Connect & Disconnect

Connect links a record to an existing related record by setting the FK. Disconnect removes the link by clearing the FK. These operations work on both singular and array relations.

## Connect

### Connect on Create (Singular)

```typescript
// Connect a post to an existing user
const post = await db.Post.create({
  data: {
    title: 'My Post',
    author: { connect: userId },
  },
});
// Sets Post.authorId to the user's record ID
```

The `connect` value accepts any `RecordIdInput` — a plain string, a `CerialId` object, a `RecordId`, or a `StringRecordId`:

```typescript
// All valid connect values
author: {
  connect: 'abc123';
} // string (just the ID part)
author: {
  connect: user.id;
} // CerialId from a previous query
author: {
  connect: new RecordId('user', 'abc123');
} // SurrealDB RecordId
```

### Connect on Create (Array — N:N)

```typescript
// Connect multiple tags to a new user
const user = await db.User.create({
  data: {
    name: 'John',
    tags: { connect: ['tag:javascript', 'tag:typescript'] },
  },
});
// Sets User.tagIds = [tag:javascript, tag:typescript]
// Updates Tag:javascript.userIds += newUserId
// Updates Tag:typescript.userIds += newUserId
```

### Connect on Update (Singular — Replace)

For singular relations, connecting on update **replaces** the existing FK value:

```typescript
// Change a post's author
await db.Post.updateMany({
  where: { id: postId },
  data: { author: { connect: newUserId } },
});
// Sets Post.authorId to newUserId (replacing the previous value)
```

### Connect on Update (Array — Append)

For array relations, connecting on update **appends** to the existing FK array:

```typescript
// Add more tags to a user
await db.User.updateMany({
  where: { id: userId },
  data: { tags: { connect: ['tag:rust'] } },
});
// Appends 'tag:rust' to User.tagIds
// Updates Tag:rust.userIds += userId
```

## Disconnect

### Disconnect a Singular Relation

Disconnecting a singular relation clears the FK. This only works on **optional** relations (`Record?`). The clear behavior depends on whether the FK has `@nullable`:

| FK Schema                  | Disconnect sets FK to    | Description                       |
| -------------------------- | ------------------------ | --------------------------------- |
| `Record?` (no `@nullable`) | NONE (field removed)     | Field can only be value or absent |
| `Record? @nullable`        | NULL (field set to null) | Field supports null               |

```typescript
// Remove the author from a post
await db.Post.updateMany({
  where: { id: postId },
  data: { author: { disconnect: true } },
});
// If authorId has @nullable: sets authorId = NULL
// If authorId has no @nullable: sets authorId = NONE
```

For singular relations, `disconnect` takes a boolean `true` — there is only one value to disconnect.

Required relations (`Record`) **cannot be disconnected**. Attempting to disconnect a required relation will result in a type error.

### Disconnect from an Array Relation

Disconnecting from an array relation removes specific IDs from the FK array:

```typescript
// Remove specific tags from a user
await db.User.updateMany({
  where: { id: userId },
  data: { tags: { disconnect: ['tag:javascript'] } },
});
// Removes 'tag:javascript' from User.tagIds
// Removes userId from Tag:javascript.userIds
```

For array relations, `disconnect` takes an array of IDs to remove.

## Combining Connect and Disconnect

For array relations, you can connect and disconnect in the same update operation:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    tags: {
      connect: ['tag:go', 'tag:rust'],
      disconnect: ['tag:javascript', 'tag:python'],
    },
  },
});
// Adds tag:go and tag:rust to User.tagIds
// Removes tag:javascript and tag:python from User.tagIds
// All reverse sides (Tag.userIds) are updated accordingly
```

Both operations happen atomically within a single transaction.

Connect/disconnect operations also work inside [`$transaction`](../queries/transaction.md), covered by a single atomic transaction.

## Combining Connect and Create

You can also mix `connect` with `create` for array relations:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    tags: {
      create: [{ name: 'brand-new-tag' }],
      connect: [existingTagId],
    },
  },
});
// Creates a new Tag, connects to an existing Tag, and syncs all FK arrays
```

## Validation

Connect validates that the target record exists before linking:

```typescript
// This will throw an error if the user doesn't exist
const post = await db.Post.create({
  data: {
    title: 'My Post',
    author: { connect: 'nonexistent-id' },
  },
});
// Error: Cannot connect to non-existent User record
```

The validation query runs inside the transaction:

```sql
LET $exists_0_0 = (SELECT id FROM ONLY $validate_0_0);
IF $exists_0_0 IS NONE { THROW "Cannot connect to non-existent User record" };
```

## Summary

| Operation           | Singular Relation                             | Array Relation              |
| ------------------- | --------------------------------------------- | --------------------------- |
| `connect` on create | Sets FK to record ID                          | Sets FK array to record IDs |
| `connect` on update | Replaces FK value                             | Appends to FK array         |
| `disconnect: true`  | Clears FK (NONE or NULL based on `@nullable`) | N/A                         |
| `disconnect: [ids]` | N/A                                           | Removes IDs from FK array   |
| Bidirectional sync  | N/A                                           | Automatic for N:N           |
| Validation          | Target must exist                             | All targets must exist      |
