---
title: $transaction
parent: Queries
nav_order: 12
---

# $transaction

Executes multiple independent queries atomically in a single SurrealDB transaction. All queries either succeed together or are rolled back entirely.

## Basic Usage

```typescript
const [user, post] = await client.$transaction([
  client.db.User.create({ data: { name: 'Alice', email: 'alice@example.com' } }),
  client.db.Post.create({ data: { title: 'Hello World', authorId: existingUserId } }),
]);
// user: User, post: Post — both created atomically
```

## Supported Operations

All model methods work inside `$transaction`:

| Method         | Result Type | Example                                                  |
| -------------- | ----------- | -------------------------------------------------------- |
| `findOne`      | `T \| null` | `db.User.findOne({ where: { id } })`                     |
| `findMany`     | `T[]`       | `db.User.findMany({ where: { isActive: true } })`        |
| `findUnique`   | `T \| null` | `db.User.findUnique({ where: { email } })`               |
| `create`       | `T`         | `db.User.create({ data: { ... } })`                      |
| `updateMany`   | `T[]`       | `db.User.updateMany({ where: { ... }, data: { ... } })`  |
| `updateUnique` | `T \| null` | `db.User.updateUnique({ where: { id }, data: { ... } })` |
| `deleteMany`   | `number`    | `db.User.deleteMany({ where: { ... } })`                 |
| `deleteUnique` | `boolean`   | `db.User.deleteUnique({ where: { id } })`                |
| `count`        | `number`    | `db.User.count({ where: { ... } })`                      |
| `exists`       | `boolean`   | `db.User.exists({ where: { ... } })`                     |

## Typed Tuple Results

Each position in the result array is individually typed:

```typescript
const [users, postCount, tagExists] = await client.$transaction([
  client.db.User.findMany({ where: { isActive: true } }),
  client.db.Post.count({ where: { published: true } }),
  client.db.Tag.exists({ where: { name: 'typescript' } }),
]);
// users: User[]
// postCount: number
// tagExists: boolean
```

## Mixed Models

Queries can span different models in the same transaction:

```typescript
const [user, profile] = await client.$transaction([
  client.db.User.create({ data: { name: 'Bob', email: 'bob@example.com' } }),
  client.db.Profile.create({ data: { bio: 'Hello', userId: existingUserId } }),
]);
```

## Nested Operations

Nested create, connect/disconnect, and cascade delete all work inside `$transaction`. Everything is covered by the same atomic guarantee:

```typescript
const [user] = await client.$transaction([
  client.db.User.create({
    data: {
      name: 'Charlie',
      posts: { create: [{ title: 'Post 1' }, { title: 'Post 2' }] },
    },
  }),
]);
// The user and both posts are created atomically
```

## Atomicity

If any query in the transaction fails, all changes are rolled back:

```typescript
try {
  await client.$transaction([
    client.db.User.create({ data: { name: 'Alice', email: 'alice@example.com' } }),
    client.db.User.create({ data: { name: 'Bob', email: 'alice@example.com' } }), // duplicate email
  ]);
} catch (error) {
  // Neither user was created — the transaction rolled back
}
```

## Constraints

- **Independent queries only** — queries in the array are independent. One query cannot reference the result of another query in the same transaction.
- **No nesting** — you cannot nest `$transaction` inside `$transaction`.
- **Validation is eager** — input validation happens when the model method is called, before the transaction executes. Invalid inputs throw immediately.

## Select and Include

`select` and `include` work normally inside transactions:

```typescript
const [user] = await client.$transaction([
  client.db.User.findOne({
    where: { id: userId },
    select: { id: true, name: true },
    include: { posts: true },
  }),
]);
// user: ({ id: CerialId; name: string } & { posts: Post[] }) | null
```
