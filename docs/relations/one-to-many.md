---
title: One-to-Many
parent: Relations
nav_order: 2
---

# One-to-Many Relations

A one-to-many relation links a single record in one model (the "one" side) to multiple records in another model (the "many" side). The "many" side stores the foreign key.

## Required One-to-Many

```cerial
model User {
  id Record @id
  name String
  posts Relation[] @model(Post)                  # Reverse relation (array)
}

model Post {
  id Record @id
  title String
  authorId Record                                # FK storage (required)
  author Relation @field(authorId) @model(User)  # Forward relation
}
```

- `Post.authorId` stores the foreign key — every Post must belong to a User.
- `Post.author` is the forward relation resolving `authorId` to a `User`.
- `User.posts` is the reverse relation querying all Posts where `authorId` matches the User.
- Deleting a User **cascades** to delete all Posts with `authorId` pointing to that User (required FK = auto-cascade).

## Optional One-to-Many

```cerial
model User {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  authorId Record?                                        # FK storage (optional)
  author Relation? @field(authorId) @model(User) @onDelete(SetNull)
}
```

- `Post.authorId` is `Record?` — a Post can exist without an author.
- Deleting a User **sets `authorId` to null** on all Posts (default for optional relations).

## Creating Records

### Create from the "many" side (forward)

```typescript
// Create a post connected to an existing user
const post = await db.Post.create({
  data: {
    title: 'Getting Started with Cerial',
    author: { connect: userId },
  },
});
```

### Create from the "one" side (reverse) with nested create

```typescript
// Create a user with multiple posts in one operation
const user = await db.User.create({
  data: {
    name: 'John',
    posts: {
      create: [{ title: 'First Post' }, { title: 'Second Post' }],
    },
  },
});
// Both posts are created with authorId set to the new user's id
```

### Create from the "one" side with connect

```typescript
// Create a user and connect existing posts
const user = await db.User.create({
  data: {
    name: 'Jane',
    posts: {
      connect: [postId1, postId2],
    },
  },
});
// postId1.authorId and postId2.authorId are updated to point to the new user
```

## Querying

### Include the reverse relation

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  include: { posts: true },
});
// user: { id: CerialId, name: string, posts: Post[] }
```

### Include with ordering and limit

```typescript
const user = await db.User.findOne({
  where: { id: userId },
  include: {
    posts: {
      orderBy: { title: 'asc' },
      limit: 10,
    },
  },
});
// user.posts is sorted by title, limited to 10 results
```

### Include the forward relation

```typescript
const post = await db.Post.findOne({
  where: { id: postId },
  include: { author: true },
});
// post: { id: CerialId, title: string, authorId: CerialId, author: User }
```

### Filter by related records

```typescript
// Find all posts by a specific user
const posts = await db.Post.findMany({
  where: { authorId: userId },
});

// Find all users who have at least one post (via the FK side)
const users = await db.User.findMany({
  where: {
    posts: { some: { title: { contains: 'Cerial' } } },
  },
});
```

## Updating Relations

### Reassign a post to a different user

```typescript
await db.Post.updateMany({
  where: { id: postId },
  data: { author: { connect: newUserId } },
});
```

### Disconnect an optional relation

```typescript
// Only works when authorId is Record? (optional)
await db.Post.updateMany({
  where: { id: postId },
  data: { author: { disconnect: true } },
});
// Sets authorId to null
```

### Add posts to a user from the reverse side

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    posts: {
      create: [{ title: 'New Post' }],
      connect: [existingPostId],
    },
  },
});
```

## Delete Behavior

| FK Type              | Default Behavior                    | Configurable         |
| -------------------- | ----------------------------------- | -------------------- |
| Required (`Record`)  | Cascade — deletes all related Posts | No (always cascade)  |
| Optional (`Record?`) | SetNull — sets `authorId` to null   | Yes, via `@onDelete` |

See [Delete Behavior](on-delete.md) for all `@onDelete` options.
