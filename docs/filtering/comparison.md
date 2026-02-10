---
title: Comparison Operators
parent: Filtering
nav_order: 1
---

# Comparison Operators

Comparison operators let you match records based on equality, inequality, and ordering. They work on `String`, `Int`, `Float`, `Date`, `Bool`, and `Email` field types.

## Equals (Shorthand)

The simplest way to filter by equality is to pass a value directly:

```typescript
const users = await db.User.findMany({
  where: { name: 'John' },
});
// SurrealQL: WHERE name = 'John'
```

## Equals (Explicit)

Use the `eq` operator for explicit equality checks. This is equivalent to the shorthand form:

```typescript
const users = await db.User.findMany({
  where: { name: { eq: 'John' } },
});
// SurrealQL: WHERE name = 'John'
```

## Not Equals

Use `neq` to find records where a field does not equal a value:

```typescript
const users = await db.User.findMany({
  where: { status: { neq: 'deleted' } },
});
// SurrealQL: WHERE status != 'deleted'
```

## Greater Than

Use `gt` for strict greater-than comparisons:

```typescript
const users = await db.User.findMany({
  where: { age: { gt: 18 } },
});
// SurrealQL: WHERE age > 18
```

## Greater Than or Equal

Use `gte` for greater-than-or-equal comparisons:

```typescript
const users = await db.User.findMany({
  where: { age: { gte: 18 } },
});
// SurrealQL: WHERE age >= 18
```

## Less Than

Use `lt` for strict less-than comparisons:

```typescript
const users = await db.User.findMany({
  where: { age: { lt: 65 } },
});
// SurrealQL: WHERE age < 65
```

## Less Than or Equal

Use `lte` for less-than-or-equal comparisons:

```typescript
const users = await db.User.findMany({
  where: { age: { lte: 65 } },
});
// SurrealQL: WHERE age <= 65
```

## Combining Operators on One Field

You can combine multiple comparison operators on the same field to create range queries:

```typescript
// Range: 18 <= age < 65
const users = await db.User.findMany({
  where: { age: { gte: 18, lt: 65 } },
});
// SurrealQL: WHERE age >= 18 AND age < 65
```

## Full Query Example

Comparison operators can be mixed freely across multiple fields:

```typescript
const adults = await db.User.findMany({
  where: {
    age: { gte: 18, lt: 65 },
    isActive: true,
    name: { neq: 'Anonymous' },
  },
});
```

This finds all users who are between 18 and 64 years old, are currently active, and whose name is not "Anonymous".

## Date Comparisons

Date fields use JavaScript `Date` objects for comparison values:

```typescript
const recentUsers = await db.User.findMany({
  where: {
    createdAt: { gte: new Date('2024-01-01') },
  },
});

const usersInRange = await db.User.findMany({
  where: {
    createdAt: {
      gte: new Date('2024-01-01'),
      lt: new Date('2025-01-01'),
    },
  },
});
```

## Boolean Comparisons

Boolean fields typically use shorthand equality, but explicit operators work too:

```typescript
// Shorthand (most common)
const activeUsers = await db.User.findMany({
  where: { isActive: true },
});

// Explicit operator
const inactiveUsers = await db.User.findMany({
  where: { isActive: { eq: false } },
});

// Not equals
const nonActiveUsers = await db.User.findMany({
  where: { isActive: { neq: true } },
});
```

## Supported Types

| Operator | String | Int | Float | Date | Bool | Email |
| -------- | ------ | --- | ----- | ---- | ---- | ----- |
| `eq`     | Yes    | Yes | Yes   | Yes  | Yes  | Yes   |
| `neq`    | Yes    | Yes | Yes   | Yes  | Yes  | Yes   |
| `gt`     | Yes    | Yes | Yes   | Yes  | Yes  | Yes   |
| `gte`    | Yes    | Yes | Yes   | Yes  | Yes  | Yes   |
| `lt`     | Yes    | Yes | Yes   | Yes  | Yes  | Yes   |
| `lte`    | Yes    | Yes | Yes   | Yes  | Yes  | Yes   |
