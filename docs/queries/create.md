---
title: create
parent: Queries
nav_order: 4
---

# create

Creates a new record in the database. Returns the created record, or `null` if the creation fails.

## Options

| Option   | Type          | Required | Description                      |
| -------- | ------------- | -------- | -------------------------------- |
| `data`   | `CreateInput` | Yes      | The record data to insert        |
| `select` | `SelectInput` | No       | Narrow which fields are returned |

## Basic Usage

```typescript
const user = await db.User.create({
  data: {
    email: 'jane@example.com',
    name: 'Jane Doe',
    isActive: true,
    address: { street: '123 Main St', city: 'NYC', state: 'NY' },
    nicknames: ['Jane'],
  },
});
// user: User
```

## With Select

Return only specific fields from the newly created record:

```typescript
const user = await db.User.create({
  data: {
    email: 'jane@example.com',
    name: 'Jane',
    isActive: true,
    address: { street: '1 St', city: 'LA', state: 'CA' },
  },
  select: { id: true, email: true },
});
// user: { id: CerialId; email: string }
```

## Auto-Populated Fields

Several field types are automatically populated when you create a record:

| Field Type             | Behavior                                            |
| ---------------------- | --------------------------------------------------- |
| `@id`                  | SurrealDB auto-generates the record ID              |
| `@now`                 | Set to the current timestamp at creation time       |
| `@default(value)`      | Uses the default value if the field is not provided |
| Array fields           | Default to `[]` if not provided                     |
| Optional object fields | Set to NONE (field absent) if not provided          |

```typescript
// Schema:
// model Post {
//   id Record @id
//   title String
//   views Int @default(0)
//   tags String[]
//   createdAt Date @now
// }

const post = await db.Post.create({
  data: { title: 'Hello World' },
});
// post.id       → CerialId (auto-generated)
// post.views    → 0 (default)
// post.tags     → [] (array default)
// post.createdAt → current timestamp (@now)
```

## Nested Create

Create a related record inline within the parent create operation:

```typescript
const post = await db.Post.create({
  data: {
    title: 'My Post',
    author: {
      create: {
        name: 'John',
        email: 'john@example.com',
        isActive: true,
        address: { street: '1 St', city: 'NYC', state: 'NY' },
      },
    },
  },
});
```

The related record is created within the same transaction as the parent.

## Connect to Existing Record

Link a new record to an existing related record by its ID:

```typescript
const post = await db.Post.create({
  data: {
    title: 'My Post',
    author: { connect: userId },
  },
});
```

The `connect` value accepts any `RecordIdInput`: a plain string, a `CerialId`, a `RecordId`, or a `StringRecordId`.

## Array Relations

For array (one-to-many) relations, you can create or connect multiple records:

```typescript
const user = await db.User.create({
  data: {
    name: 'Jane',
    email: 'jane@example.com',
    isActive: true,
    address: { street: '1 St', city: 'NYC', state: 'NY' },
    posts: {
      create: [{ title: 'Post 1' }, { title: 'Post 2' }],
    },
  },
});
```

```typescript
const user = await db.User.create({
  data: {
    name: 'Jane',
    email: 'jane@example.com',
    isActive: true,
    address: { street: '1 St', city: 'NYC', state: 'NY' },
    posts: {
      connect: [postId1, postId2],
    },
  },
});
```

## NONE vs null for Optional Fields

How optional fields are handled on create depends on their schema definition:

```typescript
// field String? (no @default)
{
  bio: 'Hello';
} // bio = 'Hello'
{
  bio: undefined;
} // bio field NOT stored (NONE)
{
  bio: null;
} // bio = null (explicit null stored)

// field String? @default(null)
{
  bio: undefined;
} // bio = null (default applied)
{
  bio: null;
} // bio = null (explicit null)

// field Record? (record references can't be null)
{
  userId: 'abc';
} // userId = record reference
{
  userId: undefined;
} // userId field NOT stored (NONE)
{
  userId: null;
} // userId field NOT stored (NONE)
```

## Return Value

Returns the created record with all fields populated (including auto-generated and default values), narrowed by `select` if provided. Returns `null` if the creation fails (e.g., unique constraint violation).
