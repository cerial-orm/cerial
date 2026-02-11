---
title: Logical Operators
parent: Filtering
nav_order: 4
---

# Logical Operators

Logical operators let you build complex filter conditions by combining multiple conditions with boolean logic. Cerial supports three logical operators: `AND`, `OR`, and `NOT`.

## AND

The `AND` operator requires ALL conditions in the array to match:

```typescript
const users = await db.User.findMany({
  where: {
    AND: [{ age: { gte: 18 } }, { isActive: true }, { email: { endsWith: '@example.com' } }],
  },
});
```

### Implicit AND

Multiple conditions at the top level of a `where` clause are implicitly ANDed together. The following query is equivalent to the explicit `AND` above:

```typescript
const users = await db.User.findMany({
  where: {
    age: { gte: 18 },
    isActive: true,
    email: { endsWith: '@example.com' },
  },
});
```

### When to Use Explicit AND

The explicit `AND` operator is mainly useful when you need to apply multiple conditions to the **same field**, since object keys must be unique:

```typescript
const users = await db.User.findMany({
  where: {
    AND: [{ name: { startsWith: 'J' } }, { name: { endsWith: 'n' } }],
  },
});
// Matches: "John", "Jason", "Jordan"
```

Without `AND`, you would not be able to specify two separate condition objects for the `name` field at the same level. However, note that multiple operators on the same field within a single object work fine:

```typescript
// This works without AND because both operators are in one object
const users = await db.User.findMany({
  where: {
    name: { startsWith: 'J', endsWith: 'n' },
  },
});
```

## OR

The `OR` operator requires at least one condition in the array to match:

```typescript
const users = await db.User.findMany({
  where: {
    OR: [{ role: 'admin' }, { role: 'moderator' }],
  },
});
```

```typescript
// Find users with either a company email or an admin role
const users = await db.User.findMany({
  where: {
    OR: [{ email: { endsWith: '@company.com' } }, { role: 'admin' }],
  },
});
```

`OR` is essential when you need to match records that satisfy any one of several distinct conditions:

```typescript
// Find users who signed up recently OR are VIP members
const users = await db.User.findMany({
  where: {
    OR: [{ createdAt: { gte: new Date('2024-06-01') } }, { membershipTier: 'vip' }],
  },
});
```

## NOT

The `NOT` operator negates a condition. It takes a single condition object (not an array):

```typescript
const users = await db.User.findMany({
  where: {
    NOT: { status: 'deleted' },
  },
});
```

```typescript
// Find users who are NOT in the 'bot' role AND NOT inactive
const users = await db.User.findMany({
  where: {
    NOT: { role: 'bot' },
    isActive: true,
  },
});
```

`NOT` can negate complex conditions:

```typescript
const users = await db.User.findMany({
  where: {
    NOT: {
      email: { endsWith: '@test.com' },
      role: 'bot',
    },
  },
});
// Excludes users where email ends with '@test.com' AND role is 'bot'
```

## Combining Logical Operators

Logical operators can be nested and combined for sophisticated queries:

```typescript
const users = await db.User.findMany({
  where: {
    isActive: true,
    OR: [
      { role: 'admin' },
      {
        AND: [{ age: { gte: 18 } }, { email: { endsWith: '@company.com' } }],
      },
    ],
    NOT: { status: 'banned' },
  },
});
```

This query finds users who:

- Are active, **AND**
- Are either an admin OR (at least 18 years old AND have a company email), **AND**
- Are NOT banned

### Nested OR within AND

```typescript
const users = await db.User.findMany({
  where: {
    AND: [
      {
        OR: [{ role: 'admin' }, { role: 'moderator' }],
      },
      {
        OR: [{ email: { endsWith: '@company.com' } }, { email: { endsWith: '@company.org' } }],
      },
    ],
  },
});
// (admin OR moderator) AND (company.com OR company.org)
```

### NOT with OR

```typescript
const users = await db.User.findMany({
  where: {
    NOT: {
      OR: [{ status: 'deleted' }, { status: 'banned' }],
    },
  },
});
// Excludes users who are deleted OR banned
```

## Usage Across Query Methods

Logical operators work in `where` clauses across all query methods:

```typescript
// Count users matching complex criteria
const count = await db.User.count({
  OR: [{ role: 'admin' }, { isActive: true }],
});

// Check if any matching user exists
const hasAdmin = await db.User.exists({ role: 'admin' });

// Update matching users
await db.User.updateMany({
  where: {
    NOT: { role: 'admin' },
    isActive: false,
  },
  data: { status: 'inactive' },
});

// Delete matching users
await db.User.deleteMany({
  where: {
    AND: [{ status: 'deleted' }, { deletedAt: { lt: new Date('2023-01-01') } }],
  },
});
```
