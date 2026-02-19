---
title: $transaction
parent: Queries
nav_order: 13
---

# $transaction

Execute queries atomically with three modes: **array**, **callback**, and **manual**. All queries either succeed together or roll back entirely.

```typescript
// Array: batch independent queries
const [user, posts] = await client.$transaction([...]);

// Callback: complex logic with automatic commit/rollback
const result = await client.$transaction(async (tx) => { ... });

// Manual: explicit commit/cancel control
const txn = await client.$transaction();
```

## Array Mode

Pass an array of query promises. All run inside a single transaction, and results come back as a typed tuple.

```typescript
const [user, post] = await client.$transaction([
  client.db.User.create({ data: { name: 'Alice', email: 'alice@example.com' } }),
  client.db.Post.create({ data: { title: 'Hello World', authorId: existingUserId } }),
]);
// user: User, post: Post
```

### Typed Tuple Results

Each position in the result array matches the type of its corresponding query:

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

### Function Items

Array items can be functions that receive previous results. This lets later queries depend on earlier ones:

```typescript
const [user, profile] = await client.$transaction([
  client.db.User.create({ data: { name: 'Alice', email: 'alice@example.com' } }),
  (prevResults) => {
    const createdUser = prevResults[0] as User;
    return client.db.Profile.create({
      data: { bio: 'Hello!', userId: createdUser.id },
    });
  },
]);
```

You can mix regular query promises and functions in the same array.

### Supported Operations

All model methods work inside array-mode transactions:

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

### Nested Operations

Nested create, connect/disconnect, and cascade delete all work inside transactions. Everything falls under the same atomic guarantee:

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

### Select and Include

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

## Callback Mode

Pass a function to get a transaction client. Cerial commits automatically when the callback returns, or rolls back if it throws.

```typescript
const user = await client.$transaction(async (tx) => {
  const user = await tx.User.create({
    data: { name: 'Alice', email: 'alice@example.com' },
  });

  await tx.Post.create({
    data: { title: 'First Post', authorId: user.id },
  });

  return user;
});
// user: User (transaction committed)
```

The callback receives `tx`, which mirrors `client.db` but scopes all queries to the transaction. Access models directly on `tx`:

```typescript
await tx.User.findMany({ where: { isActive: true } });
await tx.Post.updateUnique({ where: { id: postId }, data: { title: 'Updated' } });
await tx.Tag.deleteMany({ where: { name: 'old-tag' } });
```

### Return Values

Whatever the callback returns becomes the return value of `$transaction`:

```typescript
const count = await client.$transaction(async (tx) => {
  await tx.User.create({ data: { name: 'Bob', email: 'bob@example.com' } });

  return tx.User.count();
});
// count: number
```

### Throw to Rollback

Throwing inside the callback cancels the transaction. There's no `tx.rollback()` method. Just throw:

```typescript
try {
  await client.$transaction(async (tx) => {
    await tx.User.create({ data: { name: 'Alice', email: 'alice@example.com' } });

    const exists = await tx.User.exists({ email: 'alice@example.com' });
    if (exists) {
      throw new Error('Duplicate detected');
    }
  });
} catch (error) {
  // Transaction rolled back, no user was created
}
```

### Timeout

Set a timeout (in milliseconds) to prevent long-running transactions from blocking:

```typescript
await client.$transaction(
  async (tx) => {
    await tx.User.updateMany({ where: { isActive: false }, data: { archived: true } });
  },
  { timeout: 5000 },
);
// Throws 'Transaction timeout' if the callback takes longer than 5 seconds
```

## Manual Mode

Call `$transaction()` with no arguments to get a transaction object with explicit lifecycle control.

```typescript
const txn = await client.$transaction();

try {
  await txn.User.create({ data: { name: 'Alice', email: 'alice@example.com' } });
  await txn.Post.create({ data: { title: 'Hello', authorId: aliceId } });

  await txn.commit();
} catch (error) {
  await txn.cancel();
  throw error;
}
```

### Two Access Patterns

Manual mode gives you two ways to run queries inside the transaction:

**Model proxy** (access models directly on `txn`):

```typescript
const txn = await client.$transaction();
await txn.User.create({ data: { name: 'Alice', email: 'alice@example.com' } });
await txn.commit();
```

**Option pattern** (pass `txn` to regular model methods):

```typescript
const txn = await client.$transaction();
await client.db.User.create({
  data: { name: 'Alice', email: 'alice@example.com' },
  txn,
});
await txn.commit();
```

The option pattern is useful when you have helper functions that accept `txn` as a parameter:

```typescript
async function createUserWithProfile(
  client: CerialClient,
  txn: CerialTransaction,
  name: string,
  email: string,
) {
  const user = await client.db.User.create({
    data: { name, email },
    txn,
  });
  await client.db.Profile.create({
    data: { userId: user.id, bio: '' },
    txn,
  });

  return user;
}

// Usage
const txn = await client.$transaction();
try {
  const alice = await createUserWithProfile(client, txn, 'Alice', 'alice@example.com');
  const bob = await createUserWithProfile(client, txn, 'Bob', 'bob@example.com');
  await txn.commit();
} catch (error) {
  await txn.cancel();
  throw error;
}
```

### Transaction State

Check the current state of a manual transaction:

```typescript
const txn = await client.$transaction();
console.log(txn.state); // 'active'

await txn.commit();
console.log(txn.state); // 'committed'
```

Possible states: `'active'`, `'committed'`, `'cancelled'`. Calling `commit()` or `cancel()` on an already-ended transaction throws an error.

### Automatic Cleanup with `await using`

If your environment supports `Symbol.asyncDispose` (TypeScript 5.2+), you can use `await using` to ensure the transaction is always cleaned up:

```typescript
{
  await using txn = await client.$transaction();

  await txn.User.create({ data: { name: 'Alice', email: 'alice@example.com' } });
  await txn.commit();
}
// If commit() wasn't called (e.g., an exception was thrown),
// the transaction is automatically cancelled when txn goes out of scope
```

This replaces try/catch/cancel boilerplate. If `commit()` was never called by the time `txn` is disposed, the transaction cancels itself.

## Choosing a Mode

| Feature        | Array                          | Callback                 | Manual                                       |
| -------------- | ------------------------------ | ------------------------ | -------------------------------------------- |
| Best for       | Independent queries            | Complex logic, branching | Helper functions, long-lived transactions     |
| Rollback       | Automatic on error             | Throw to rollback        | Explicit `cancel()`                          |
| Model access   | `client.db.Model`              | `tx.Model`               | `txn.Model` or `client.db.Model({ txn })`   |
| Return type    | Typed tuple                    | Callback return value    | void (`commit()` / `cancel()`)               |
| Timeout        | No                             | Yes (`{ timeout: ms }`)  | No (manage yourself)                         |
| Auto cleanup   | N/A                            | Automatic                | `await using` or manual try/catch            |

**Use array mode** when you have a batch of independent queries that don't depend on each other's results (or only use simple function items for result passing).

**Use callback mode** when your transaction has conditional logic, loops, or branching. It handles commit and rollback for you.

**Use manual mode** when you need to pass the transaction to helper functions, or when the transaction spans across multiple function calls.

## Error Handling & Rollback

Every mode guarantees atomicity: either all changes persist, or none do.

**Array mode** rolls back automatically if any query fails:

```typescript
try {
  await client.$transaction([
    client.db.User.create({ data: { name: 'Alice', email: 'alice@example.com' } }),
    client.db.User.create({ data: { name: 'Bob', email: 'alice@example.com' } }), // duplicate
  ]);
} catch (error) {
  // Neither user was created
}
```

**Callback mode** rolls back when the callback throws. If it returns normally, the transaction commits:

```typescript
try {
  await client.$transaction(async (tx) => {
    await tx.User.create({ data: { name: 'Alice', email: 'alice@example.com' } });
    throw new Error('Changed my mind');
  });
} catch (error) {
  // Alice was not created
}
```

**Manual mode** requires you to handle the lifecycle yourself. Always pair `commit()` with a `cancel()` fallback:

```typescript
const txn = await client.$transaction();
try {
  await txn.User.create({ data: { name: 'Alice', email: 'alice@example.com' } });
  await txn.commit();
} catch (error) {
  await txn.cancel();
  throw error;
}
```

Or use `await using` to guarantee cleanup without the try/catch:

```typescript
{
  await using txn = await client.$transaction();
  await txn.User.create({ data: { name: 'Alice', email: 'alice@example.com' } });
  await txn.commit();
}
```

## WebSocket Requirement

Transactions require a WebSocket connection to SurrealDB. If you connect via HTTP, Cerial automatically creates a secondary WebSocket connection for transaction support. No extra configuration needed.

For connection management, `closeHttp()` drops the HTTP connection and routes all operations through WebSocket. `reopenHttp()` restores the HTTP connection.

## Conflict Retry

By default, Cerial does **not** retry transaction conflicts. You can opt in by passing `retries` and an optional `backoff` function in the options:

```typescript
// Array mode with retry
const [user] = await client.$transaction(
  [client.db.User.create({ data: { email: 'a@b.c', name: 'A', isActive: true } })],
  { retries: 3, backoff: (attempt) => 2 ** attempt * 100 },
);

// Callback mode with retry
const result = await client.$transaction(
  async (tx) => {
    return tx.User.create({ data: { email: 'a@b.c', name: 'A', isActive: true } });
  },
  { retries: 3 },
);
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retries` | `number` | `0` | Number of retry attempts on transaction conflict |
| `backoff` | `(attempt: number) => number` | Exponential with jitter | Returns delay in ms for each attempt (0-based) |

The default backoff uses exponential with jitter: `(attempt) => 2 ** attempt * 10 + Math.random() * 10`. Each retry begins a **fresh transaction**.

Manual mode (`const txn = await client.$transaction()`) does not support retry options — you control the lifecycle yourself.

## Limitations

- **No nesting.** SurrealDB doesn't support savepoints. Calling `$transaction` inside a transaction throws immediately.
- **Array mode function items don't get `tx`.** Function items in array mode receive `prevResults` only. Cerial routes them through the transaction internally.
- **Validation is eager.** Input validation happens when the model method is called, not when the transaction executes. Invalid inputs throw before the transaction starts.
- **`$transaction` is blocked on `tx`/`txn`.** You can't call `$transaction` on a transaction client. Attempting it throws an error.
