---
title: String Operators
parent: Filtering
nav_order: 2
---

# String Operators

String operators allow you to filter records based on substring matching and pattern matching within string fields. They work on `String` and `Email` field types.

## contains

Matches records where the field value contains the given substring:

```typescript
const users = await db.User.findMany({
  where: { name: { contains: 'john' } },
});
// SurrealQL: WHERE name CONTAINS 'john'
```

```typescript
// Find posts mentioning TypeScript anywhere in the body
const posts = await db.Post.findMany({
  where: { body: { contains: 'TypeScript' } },
});
```

## startsWith

Matches records where the field value starts with the given prefix:

```typescript
const users = await db.User.findMany({
  where: { name: { startsWith: 'J' } },
});
// SurrealQL: WHERE string::starts_with(name, 'J')
```

```typescript
// Find users with company email domains
const users = await db.User.findMany({
  where: { email: { startsWith: 'admin@' } },
});
```

## endsWith

Matches records where the field value ends with the given suffix:

```typescript
const users = await db.User.findMany({
  where: { email: { endsWith: '@example.com' } },
});
// SurrealQL: WHERE string::ends_with(email, '@example.com')
```

```typescript
// Find files by extension
const files = await db.File.findMany({
  where: { filename: { endsWith: '.pdf' } },
});
```

## Combining String Operators

You can combine multiple string operators on the same field:

```typescript
const users = await db.User.findMany({
  where: {
    name: { startsWith: 'J', contains: 'oh' },
  },
});
// Matches: "John", "Johnny", "Johanna" (starts with J AND contains oh)
```

You can also combine string operators across multiple fields:

```typescript
const users = await db.User.findMany({
  where: {
    email: { endsWith: '@example.com' },
    name: { startsWith: 'J', contains: 'oh' },
  },
});
```

## Combining with Comparison Operators

String operators can be mixed with comparison operators on the same field:

```typescript
const users = await db.User.findMany({
  where: {
    name: {
      startsWith: 'A',
      neq: 'Anonymous',
    },
  },
});
// Matches names starting with 'A' but not 'Anonymous'
```

## Using with Logical Operators

String operators work with `AND`, `OR`, and `NOT` for complex queries:

```typescript
const users = await db.User.findMany({
  where: {
    OR: [{ email: { endsWith: '@company.com' } }, { email: { endsWith: '@company.org' } }],
  },
});
```

```typescript
const users = await db.User.findMany({
  where: {
    NOT: { name: { contains: 'test' } },
  },
});
```

## Supported Types

| Operator     | String | Email |
| ------------ | ------ | ----- |
| `contains`   | Yes    | Yes   |
| `startsWith` | Yes    | Yes   |
| `endsWith`   | Yes    | Yes   |
