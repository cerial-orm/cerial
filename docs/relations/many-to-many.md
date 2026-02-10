---
title: Many-to-Many
parent: Relations
nav_order: 3
---

# Many-to-Many Relations

A many-to-many relation allows multiple records in one model to be linked to multiple records in another. In Cerial, true N:N relations require **both sides** to define `Record[]` + `Relation[]` fields — both sides are PK sides.

## Schema Definition

```cerial
model User {
  id Record @id
  name String
  tagIds Record[]                                # FK storage (array)
  tags Relation[] @field(tagIds) @model(Tag)     # Forward relation
}

model Tag {
  id Record @id
  name String @unique
  userIds Record[]                               # FK storage (array)
  users Relation[] @field(userIds) @model(User)  # Forward relation
}
```

Key characteristics:

- **Both sides store foreign keys.** `User.tagIds` stores an array of Tag record IDs. `Tag.userIds` stores an array of User record IDs.
- **Both sides are PK sides.** Each side has a `Record[]` paired with a `Relation[] @field`.
- **Bidirectional sync is automatic.** When you connect a User to a Tag, both `User.tagIds` and `Tag.userIds` are updated atomically in a single transaction.

## Bidirectional Sync

Cerial manages both sides of the N:N relationship automatically. You only need to operate on one side — the other side is kept in sync.

### Connecting Records

```typescript
// Connect tags to a user
const user = await db.User.create({
  data: {
    name: 'John',
    tags: { connect: ['tag:javascript', 'tag:typescript'] },
  },
});
```

After this operation, two things happen atomically:

1. `User.tagIds` is set to `['tag:javascript', 'tag:typescript']`
2. `Tag:javascript.userIds` has the new user's ID appended
3. `Tag:typescript.userIds` has the new user's ID appended

The generated SurrealQL wraps this in a transaction:

```sql
BEGIN TRANSACTION;
  -- Create the user with tagIds
  LET $result = CREATE user SET name = $name, tagIds = $tags_connect;
  -- Sync the reverse side
  UPDATE $sync_0_0 SET userIds += $resultId;
  UPDATE $sync_0_1 SET userIds += $resultId;
COMMIT TRANSACTION;
```

### Disconnecting Records

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    tags: { disconnect: ['tag:javascript'] },
  },
});
```

After this operation:

1. `User.tagIds` has `'tag:javascript'` removed
2. `Tag:javascript.userIds` has the user's ID removed

### Connect and Disconnect in One Update

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    tags: {
      connect: ['tag:rust', 'tag:go'],
      disconnect: ['tag:javascript'],
    },
  },
});
```

All operations are executed atomically within a single transaction.

## Creating with Nested Create

You can create related records inline:

```typescript
// Create a user and new tags simultaneously
const user = await db.User.create({
  data: {
    name: 'Alice',
    tags: {
      create: [{ name: 'python' }, { name: 'rust' }],
    },
  },
});
// New Tag records are created, and both sides are linked
```

You can also mix `create` and `connect`:

```typescript
const user = await db.User.create({
  data: {
    name: 'Bob',
    tags: {
      create: [{ name: 'new-tag' }],
      connect: ['tag:existing-tag'],
    },
  },
});
```

## Querying

### Include related records

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  include: { tags: true },
});
// user: { id: CerialId, name: string, tagIds: CerialId[], tags: Tag[] }

const tag = await db.Tag.findOne({
  where: { name: 'javascript' },
  include: { users: true },
});
// tag: { id: CerialId, name: string, userIds: CerialId[], users: User[] }
```

### Include with options

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  include: {
    tags: {
      orderBy: { name: 'asc' },
      limit: 20,
    },
  },
});
```

### Filter by related records

```typescript
// Find users who have a specific tag
const users = await db.User.findMany({
  where: {
    tags: { some: { name: 'javascript' } },
  },
});
```

## Deleting Records in N:N

When a record participating in an N:N relation is deleted, its ID is **automatically removed** from all `Record[]` arrays on the other side.

```typescript
await db.User.deleteMany({ where: { id: userId } });
// All Tags that had this user in their userIds array
// will have the user's ID removed automatically
```

This cleanup is handled atomically in the delete transaction. See [Delete Behavior](on-delete.md) for details.

## Transaction Guarantees

All N:N operations — connect, disconnect, create, and delete cleanup — are wrapped in `BEGIN TRANSACTION` / `COMMIT TRANSACTION` blocks. This ensures:

- Both sides are always consistent
- No partial updates if an operation fails
- Validation errors (e.g., connecting to a non-existent record) roll back the entire operation
