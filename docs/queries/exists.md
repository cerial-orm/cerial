---
title: exists
parent: Queries
nav_order: 12
---

# exists

Checks whether any records match the where clause. Returns a `boolean`.

Uses an efficient `SELECT count() FROM ... GROUP ALL` query under the hood and checks if the count is greater than zero. No record data is transferred over the wire.

## Options

| Option  | Type         | Required | Description       |
| ------- | ------------ | -------- | ----------------- |
| `where` | `WhereInput` | No       | Filter conditions |

The `where` argument is passed directly — not wrapped in an options object.

## Basic Usage

### Check If Any Record Matches

```typescript
const hasAdmin = await db.User.exists({ role: 'admin' });
// hasAdmin: boolean
```

### Check Uniqueness Before Create

```typescript
const emailTaken = await db.User.exists({ email: 'john@example.com' });

if (emailTaken) {
  throw new Error('Email already in use');
}

await db.User.create({
  data: {
    email: 'john@example.com',
    name: 'John',
    isActive: true,
    address: { street: '1 St', city: 'NYC', state: 'NY' },
  },
});
```

### Check with Complex Filter

```typescript
const hasRecentPosts = await db.Post.exists({
  createdAt: { gte: new Date('2024-01-01') },
});
```

## exists vs count

|              | `exists`                       | `count`                        |
| ------------ | ------------------------------ | ------------------------------ |
| **Returns**  | `boolean`                      | `number`                       |
| **Use when** | You need a yes/no answer       | You need the exact count       |
| **Query**    | `SELECT count() ... GROUP ALL` | `SELECT count() ... GROUP ALL` |

Both use the same efficient aggregate query. Prefer `exists` when you only need a boolean — it makes intent clearer.

```typescript
// Prefer exists when you only need a boolean
if (await db.User.exists({ role: 'admin' })) {
  // ...
}

// Use count when you need the actual number
const adminCount = await db.User.count({ role: 'admin' });
console.log(`There are ${adminCount} admins`);
```

## Return Value

- Returns `true` if at least one record matches the `where` clause.
- Returns `false` if no records match.
