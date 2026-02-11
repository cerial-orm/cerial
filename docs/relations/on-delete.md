---
title: Delete Behavior
parent: Relations
nav_order: 9
---

# Delete Behavior

When you delete a record that is referenced by other records, Cerial determines what happens to those dependent records based on the relation type and the `@onDelete` decorator.

## Default Behavior by Relation Type

| FK Type              | Default Behavior                          | Configurable         |
| -------------------- | ----------------------------------------- | -------------------- |
| Required (`Record`)  | **Cascade** — deletes dependent records   | No (always cascade)  |
| Optional (`Record?`) | **SetNull** — sets FK to null             | Yes, via `@onDelete` |
| Array (`Record[]`)   | **Auto cleanup** — removes ID from arrays | Automatic            |

## Required Relations (Auto-Cascade)

When a FK field is required (`Record` without `?`), deleting the referenced record **always cascades** to delete all dependents. The `@onDelete` decorator is not allowed on required relations.

```cerial
model User {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  authorId Record                                # Required FK
  author Relation @field(authorId) @model(User)  # No @onDelete allowed
}
```

```typescript
// Deleting a user cascades to all their posts
await db.User.deleteMany({ where: { id: userId } });
// All Posts where authorId = userId are also deleted
```

This cascade is recursive — if a deleted Post has its own required dependents, those are deleted too.

## `@onDelete` Options for Optional Relations

The `@onDelete` decorator controls what happens to dependents when the referenced record is deleted. It is only valid on optional relations (`Record?` + `Relation?`).

### Cascade

Deletes the dependent record when the referenced record is deleted.

```cerial
model Profile {
  id Record @id
  bio String?
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Cascade)
}
```

```typescript
await db.User.deleteMany({ where: { id: userId } });
// All Profiles where userId = userId are DELETED
```

Use `Cascade` when the dependent record has no meaning without its parent — even though the FK is technically optional.

### SetNull (Default)

Sets the FK to null on the dependent record when the referenced record is deleted. This is the **default behavior** for optional relations.

```cerial
model Post {
  id Record @id
  title String
  authorId Record?
  author Relation? @field(authorId) @model(User) @onDelete(SetNull)
}
```

```typescript
await db.User.deleteMany({ where: { id: userId } });
// All Posts where authorId = userId have authorId set to null
// The Posts themselves are preserved
```

Since `SetNull` is the default, these two declarations are equivalent:

```cerial
# Explicit
author Relation? @field(authorId) @model(User) @onDelete(SetNull)

# Implicit (same behavior)
author Relation? @field(authorId) @model(User)
```

### Restrict

Prevents deletion of the referenced record if any dependents exist. The delete operation throws an error.

```cerial
model Order {
  id Record @id
  total Float
  customerId Record?
  customer Relation? @field(customerId) @model(Customer) @onDelete(Restrict)
}
```

```typescript
// If the customer has any orders, this throws an error
await db.Customer.deleteMany({ where: { id: customerId } });
// Error: Cannot delete Customer because related Order records exist
```

Use `Restrict` to protect referential integrity when dependents should never become orphaned.

### NoAction

Leaves the FK as-is, creating a dangling reference. The dependent record will have an FK pointing to a non-existent record.

```cerial
model AuditLog {
  id Record @id
  action String
  actorId Record?
  actor Relation? @field(actorId) @model(User) @onDelete(NoAction)
}
```

```typescript
await db.User.deleteMany({ where: { id: userId } });
// AuditLog records still have actorId = userId (dangling reference)
// Querying the actor relation will return null
```

Use `NoAction` sparingly — typically for audit logs or historical records where you intentionally want to preserve the original reference even after the target is gone.

## Array Relations (Auto Cleanup)

When a record is deleted, its ID is **automatically removed** from all `Record[]` arrays that reference it. This happens regardless of any `@onDelete` setting.

```cerial
model User {
  id Record @id
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Tag {
  id Record @id
  userIds Record[]
  users Relation[] @field(userIds) @model(User)
}
```

```typescript
// Delete a tag
await db.Tag.deleteMany({ where: { name: 'deprecated' } });
// All Users who had this tag in their tagIds array
// will have the tag's ID removed automatically
// (User.tagIds -= deletedTagId)
```

For N:N relations, both sides are cleaned up atomically.

## Cascade Chains

Cascade operations can chain through multiple levels:

```cerial
model Organization {
  id Record @id
  name String
  teams Relation[] @model(Team)
}

model Team {
  id Record @id
  name String
  orgId Record
  org Relation @field(orgId) @model(Organization)
  members Relation[] @model(Member)
}

model Member {
  id Record @id
  name String
  teamId Record
  team Relation @field(teamId) @model(Team)
}
```

```typescript
// Deleting an Organization cascades through the chain:
await db.Organization.deleteMany({ where: { id: orgId } });
// 1. All Teams where orgId = orgId are deleted
// 2. All Members where teamId = (any deleted team) are deleted
```

## Transaction Guarantees

All delete operations — including cascades, SetNull updates, Restrict checks, and array cleanup — are executed within a **transaction**. This ensures:

- Either all cascade operations complete, or none do
- Restrict checks happen before any deletions
- Array cleanup is atomic with the delete
- No partial state if any operation fails

Delete operations with cascade/restrict/setNull behavior also work inside [`$transaction`](../queries/transaction.md), covered by a single atomic transaction.

## Summary

| Decorator             | Behavior             | Use Case                                            |
| --------------------- | -------------------- | --------------------------------------------------- |
| _(none, required FK)_ | Cascade (always)     | Child can't exist without parent                    |
| `@onDelete(SetNull)`  | Set FK to null       | Default for optional; preserve the child            |
| `@onDelete(Cascade)`  | Delete dependents    | Optional FK but child is meaningless without parent |
| `@onDelete(Restrict)` | Block deletion       | Protect referential integrity                       |
| `@onDelete(NoAction)` | Leave dangling ref   | Audit logs, historical records                      |
| _(array FK)_          | Remove ID from array | Automatic for all `Record[]` fields                 |
