---
title: Array Operators
parent: Filtering
nav_order: 3
---

# Array Operators

Array operators allow you to filter records based on array field contents and scalar field membership. There are two categories:

- **Array field operators** (`has`, `hasAll`, `hasAny`, `isEmpty`) — check the contents of array fields
- **Scalar membership operators** (`in`, `notIn`) — check if a scalar field's value is in a provided list

## Array Field Operators

These operators work on fields defined as arrays in your schema (e.g., `nicknames String[]`, `tags String[]`).

### has

Checks if the array contains a specific element:

```typescript
const users = await db.User.findMany({
  where: { nicknames: { has: 'John' } },
});
// SurrealQL: WHERE nicknames CONTAINS 'John'
```

```typescript
// Find posts with a specific tag
const posts = await db.Post.findMany({
  where: { tags: { has: 'typescript' } },
});
```

### hasAll

Checks if the array contains ALL of the specified elements:

```typescript
const users = await db.User.findMany({
  where: { nicknames: { hasAll: ['John', 'Johnny'] } },
});
// SurrealQL: WHERE nicknames CONTAINSALL ['John', 'Johnny']
```

```typescript
// Find posts tagged with both 'typescript' and 'tutorial'
const posts = await db.Post.findMany({
  where: { tags: { hasAll: ['typescript', 'tutorial'] } },
});
```

### hasAny

Checks if the array contains ANY of the specified elements:

```typescript
const users = await db.User.findMany({
  where: { nicknames: { hasAny: ['John', 'Jane'] } },
});
// SurrealQL: WHERE nicknames CONTAINSANY ['John', 'Jane']
```

```typescript
// Find posts tagged with either 'react' or 'vue'
const posts = await db.Post.findMany({
  where: { tags: { hasAny: ['react', 'vue'] } },
});
```

### isEmpty

Checks if the array is empty or not:

```typescript
// Find users with no nicknames
const users = await db.User.findMany({
  where: { nicknames: { isEmpty: true } },
});

// Find users with at least one nickname
const usersWithNicknames = await db.User.findMany({
  where: { nicknames: { isEmpty: false } },
});
```

## Scalar Membership Operators

These operators work on scalar (non-array) fields. They check whether the field's value is present in a provided list of values.

### in

Checks if the field value is in the provided list:

```typescript
const users = await db.User.findMany({
  where: { status: { in: ['active', 'pending'] } },
});
// SurrealQL: WHERE status IN ['active', 'pending']
```

```typescript
// Find users by a list of IDs
const users = await db.User.findMany({
  where: { id: { in: ['user1', 'user2', 'user3'] } },
});
```

### notIn

Checks if the field value is NOT in the provided list:

```typescript
const users = await db.User.findMany({
  where: { status: { notIn: ['deleted', 'banned'] } },
});
// SurrealQL: WHERE status NOT IN ['deleted', 'banned']
```

```typescript
// Exclude certain roles
const users = await db.User.findMany({
  where: { role: { notIn: ['bot', 'system'] } },
});
```

## Key Distinction: Array vs Scalar Operators

It is important to understand the difference between array field operators and scalar membership operators:

| Operator  | Works on      | What it checks                                |
| --------- | ------------- | --------------------------------------------- |
| `has`     | Array fields  | Does the array contain this element?          |
| `hasAll`  | Array fields  | Does the array contain ALL of these elements? |
| `hasAny`  | Array fields  | Does the array contain ANY of these elements? |
| `isEmpty` | Array fields  | Is the array empty?                           |
| `in`      | Scalar fields | Is the field value in this list?              |
| `notIn`   | Scalar fields | Is the field value NOT in this list?          |

```typescript
// ARRAY operator: does the tags array contain 'typescript'?
{ tags: { has: 'typescript' } }

// SCALAR operator: is the status value in the list ['active', 'pending']?
{ status: { in: ['active', 'pending'] } }
```

## Combining with Other Operators

Array operators can be combined with logical operators and other filters:

```typescript
const posts = await db.Post.findMany({
  where: {
    tags: { hasAny: ['typescript', 'javascript'] },
    status: { in: ['published', 'featured'] },
    createdAt: { gte: new Date('2024-01-01') },
  },
});
```

```typescript
const users = await db.User.findMany({
  where: {
    OR: [{ nicknames: { has: 'Admin' } }, { role: { in: ['admin', 'superadmin'] } }],
  },
});
```
