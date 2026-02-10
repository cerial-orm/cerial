---
title: '@onDelete'
parent: Decorators
grand_parent: Schema
nav_order: 6
---

# @onDelete

Controls what happens to a record when the related record it points to is deleted. Only allowed on **optional** relations (`Relation?`).

## Syntax

```cerial
@onDelete(Action)
```

## Actions

| Action     | Behavior                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| `Cascade`  | Delete this record when the related record is deleted                     |
| `SetNull`  | Set the FK to null when the related record is deleted (default)           |
| `Restrict` | Prevent deletion of the related record if this record still references it |
| `NoAction` | Do nothing (leaves a dangling reference)                                  |

## Relation Type Rules

The allowed delete behavior depends on the relation type:

| Relation Type          | Default Behavior                      | `@onDelete` Allowed?               |
| ---------------------- | ------------------------------------- | ---------------------------------- |
| `Relation` (required)  | Auto-cascade                          | No — `@onDelete` is not allowed    |
| `Relation?` (optional) | SetNull                               | Yes — can override with any action |
| `Relation[]` (array)   | Auto-cleanup (removes ID from arrays) | No — `@onDelete` is not allowed    |

**Required relations** always cascade — if a user is deleted, all posts with a required `author Relation` pointing to that user are also deleted. This cannot be changed because the FK field is required and can't be null.

**Array relations** automatically remove the deleted record's ID from the array. No configuration is needed.

## Examples

### Cascade

Delete the profile when the user is deleted:

```cerial
model Profile {
  id Record @id
  bio String
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Cascade)
}
```

```typescript
// Deleting the user also deletes the profile
await db.User.deleteUnique({ where: { id: userId } });
// Profile with userId pointing to this user is automatically deleted
```

### SetNull

Set the FK to null when the related record is deleted (this is the default for optional relations):

```cerial
model Comment {
  id Record @id
  content String
  postId Record?
  post Relation? @field(postId) @model(Post) @onDelete(SetNull)
}
```

```typescript
// Deleting the post sets comment.postId to null
await db.Post.deleteUnique({ where: { id: postId } });
// Comments that referenced this post now have postId = null
```

### Restrict

Prevent deletion if any records still reference it:

```cerial
model Order {
  id Record @id
  total Float
  customerId Record?
  customer Relation? @field(customerId) @model(Customer) @onDelete(Restrict)
}
```

```typescript
// This will throw an error if any orders reference this customer
await db.Customer.deleteUnique({ where: { id: customerId } });
// Error: cannot delete — referenced by Order records
```

### NoAction

Do nothing — the FK is left as-is, potentially creating a dangling reference:

```cerial
model Log {
  id Record @id
  message String
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(NoAction)
}
```

```typescript
// Deleting the user leaves log.userId pointing to a non-existent record
await db.User.deleteUnique({ where: { id: userId } });
// Log records still have userId set to the deleted user's ID
```
