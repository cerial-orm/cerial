---
title: Queries
nav_order: 6
has_children: true
---

# Query API

Cerial provides a Prisma-like query API with full TypeScript type inference. All queries are parameterized — values are bound via `$varName`, never inlined into query strings — ensuring injection safety by default.

You access the query API through the model proxy on your client instance:

```typescript
const client = new CerialClient(/* ... */);
const user = await client.db.User.findOne({ where: { id: '123' } });
```

## Methods Overview

| Method                          | Description                           | Returns                |
| ------------------------------- | ------------------------------------- | ---------------------- |
| [`findOne`](find-one)           | Find first matching record            | `T \| null`            |
| [`findMany`](find-many)         | Find all matching records             | `T[]`                  |
| [`findAll`](find-all)           | Find all records (alias for findMany) | `T[]`                  |
| [`findUnique`](find-unique)     | Find by unique field                  | `T \| null`            |
| [`create`](create)              | Create a new record                   | `T`                    |
| [`upsert`](upsert)              | Create or update a record             | `T \| null \| T[]`     |
| [`updateMany`](update-many)     | Update matching records               | `T[]`                  |
| [`updateUnique`](update-unique) | Update by unique field                | `T \| null \| boolean` |
| [`deleteMany`](delete-many)     | Delete matching records               | `number`               |
| [`deleteUnique`](delete-unique) | Delete by unique field                | `boolean \| T \| null` |
| [`count`](count)                | Count matching records                | `number`               |
| [`exists`](exists)              | Check if any match                    | `boolean`              |
| [`$transaction`](transaction)   | Atomic batch execution                | Typed tuple            |

## Dynamic Return Types

The actual TypeScript return type of read queries depends on the `select` and `include` options you pass. Cerial uses conditional types to infer the narrowest possible return type at compile time.

### No select/include — full model type

```typescript
const user = await db.User.findOne({ where: { id: '123' } });
// user: User | null
```

### With select — only selected fields

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { id: true, name: true },
});
// user: { id: CerialId; name: string } | null
```

### With include — model plus relations

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  include: { profile: true },
});
// user: (User & { profile: Profile }) | null
```

### Combined select + include

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { id: true },
  include: { posts: true },
});
// user: ({ id: CerialId } & { posts: Post[] }) | null
```

When both `select` and `include` are provided, the base fields are narrowed by `select` while the included relations are merged in via intersection.

## Parameterized Queries

All values you pass in `where`, `data`, and other options are bound as parameters in the generated SurrealQL — they are never interpolated into query strings. This prevents injection attacks and ensures correct handling of all data types.

```typescript
// Cerial generates: SELECT * FROM user WHERE email = $email
const user = await db.User.findOne({
  where: { email: userInput },
});
```

## CerialId

All `id` fields returned from queries are `CerialId` objects, not plain strings. `CerialId` provides structured access to the table name and record identifier:

```typescript
const user = await db.User.findOne({ where: { id: '123' } });
console.log(user.id); // CerialId { table: 'user', id: '123' }
console.log(user.id.id); // '123'
console.log(user.id.table); // 'user'
console.log(user.id.toString()); // 'user:123'
```

When passing IDs as input, you can use any of the accepted `RecordIdInput` types: a plain string, a `CerialId`, a `RecordId`, or a `StringRecordId`.

## Introspection Methods

Every model exposes metadata methods for runtime inspection:

| Method           | Returns         | Description                                          |
| ---------------- | --------------- | ---------------------------------------------------- |
| `getMetadata()`  | `ModelMetadata` | Full model metadata (name, table, fields, relations) |
| `getName()`      | `string`        | Model name (e.g., `'User'`)                          |
| `getTableName()` | `string`        | SurrealDB table name (e.g., `'user'`)                |

```typescript
const metadata = client.db.User.getMetadata();
console.log(metadata.name); // 'User'
console.log(metadata.tableName); // 'user'
console.log(metadata.fields); // Array of field definitions

const name = client.db.User.getName(); // 'User'
const table = client.db.User.getTableName(); // 'user'
```
