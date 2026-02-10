---
title: One-to-One
parent: Relations
nav_order: 1
---

# One-to-One Relations

A one-to-one relation links a single record in one model to a single record in another. The PK side stores the foreign key, and the non-PK side defines an optional reverse lookup.

## Required One-to-One

A required 1:1 means the FK field is non-optional — the child record **must** reference a parent.

```cerial
model User {
  id Record @id
  name String
  profile Relation @model(Profile)              # Reverse relation (optional to define)
}

model Profile {
  id Record @id
  bio String?
  userId Record                                  # FK storage (required)
  user Relation @field(userId) @model(User)      # Forward relation
}
```

Key characteristics:

- `Profile.userId` is a required `Record` field — every Profile must belong to a User.
- `Profile.user` is the forward relation that resolves `userId` into a full `User` object.
- `User.profile` is the reverse relation that queries the `profile` table for a record where `userId` matches.
- Deleting a User **automatically cascades** to delete any Profile with `userId` pointing to that User. Required FK relations always cascade on delete.

### Creating a Required 1:1

```typescript
// Create a profile connected to an existing user
const profile = await db.Profile.create({
  data: {
    bio: 'Hello world',
    user: { connect: userId },
  },
});

// Create a user with a profile in one operation (nested create from reverse side)
const user = await db.User.create({
  data: {
    name: 'Alice',
    profile: { create: { bio: 'Software engineer' } },
  },
});
```

### Querying a Required 1:1

```typescript
// Include the reverse relation
const user = await db.User.findOne({
  where: { id: userId },
  include: { profile: true },
});
// user: { id: CerialId, name: string, profile: Profile }

// Include the forward relation
const profile = await db.Profile.findOne({
  where: { id: profileId },
  include: { user: true },
});
// profile: { id: CerialId, bio: string | null, userId: CerialId, user: User }
```

## Optional One-to-One

An optional 1:1 allows the child record to exist without referencing a parent.

```cerial
model User {
  id Record @id
  name String
  profile Relation? @model(Profile)
}

model Profile {
  id Record @id
  bio String?
  userId Record?                                  # FK storage (optional)
  user Relation? @field(userId) @model(User) @onDelete(SetNull)
}
```

Key differences from required:

- `Profile.userId` is `Record?` — a Profile can exist without a User.
- `Profile.user` and `User.profile` are `Relation?` — they may resolve to `null`.
- Deleting a User **sets `userId` to null** on the Profile (SetNull is the default for optional relations). You can change this with `@onDelete`.

### Creating an Optional 1:1

```typescript
// Create a profile without a user
const profile = await db.Profile.create({
  data: { bio: 'Unattached profile' },
});

// Create a profile connected to a user
const profile = await db.Profile.create({
  data: {
    bio: 'Attached profile',
    user: { connect: userId },
  },
});
```

### Disconnecting an Optional 1:1

```typescript
// Remove the link between profile and user (sets userId to null)
await db.Profile.updateMany({
  where: { id: profileId },
  data: { user: { disconnect: true } },
});
```

### Querying an Optional 1:1

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  include: { profile: true },
});
// user: { id: CerialId, name: string, profile: Profile | null }

// profile is null if no Profile has userId pointing to this user
```

## When to Use Required vs Optional

| Scenario                                           | Use                                    |
| -------------------------------------------------- | -------------------------------------- |
| Every user must have exactly one profile           | Required 1:1                           |
| A profile may or may not be linked to a user       | Optional 1:1                           |
| Deleting a user should delete the profile          | Required 1:1 (auto-cascade)            |
| Deleting a user should unlink but keep the profile | Optional 1:1 with `@onDelete(SetNull)` |
