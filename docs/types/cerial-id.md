---
title: CerialId
parent: Type System
nav_order: 1
---

# CerialId

SurrealDB uses a `table:id` format for record IDs (e.g., `user:abc123`). Rather than exposing raw strings, Cerial wraps all record IDs in `CerialId` objects on output and accepts a flexible `RecordIdInput` union on input.

## CerialId Properties and Methods

| Property/Method  | Type       | Description                                       |
| ---------------- | ---------- | ------------------------------------------------- |
| `.id`            | `string`   | The raw ID portion (e.g., `'abc123'`)             |
| `.table`         | `string`   | The table name (e.g., `'user'`)                   |
| `.toString()`    | `string`   | Full record ID string (e.g., `'user:abc123'`)     |
| `.toRecordId()`  | `RecordId` | Convert to a native SurrealDB `RecordId` instance |
| `.equals(other)` | `boolean`  | Compare with another `CerialId` by value          |

## Output Types Return CerialId

Every query that returns data produces `CerialId` objects for ID fields and record reference fields:

```typescript
const user = await db.User.findOne({ where: { id: '123' } });

console.log(user.id); // CerialId { table: 'user', id: '123' }
console.log(user.id.id); // '123'
console.log(user.id.table); // 'user'
console.log(user.id.toString()); // 'user:123'
console.log(user.id.toRecordId()); // RecordId('user', '123')
```

Record reference fields (defined as `Record` in your schema) also return `CerialId`:

```typescript
const post = await db.Post.findOne({ where: { id: 'post1' } });

console.log(post.authorId); // CerialId { table: 'user', id: 'abc123' }
console.log(post.authorId.table); // 'user'
console.log(post.authorId.id); // 'abc123'
```

## RecordIdInput — The Input Union Type

Input types accept any of the following via the `RecordIdInput` union:

```typescript
type RecordIdInput = string | CerialId | RecordId | StringRecordId;
```

This gives you flexibility in how you pass IDs to queries:

### Plain String

Pass just the ID portion as a string. Cerial resolves the table name from the schema.

```typescript
await db.User.findOne({ where: { id: '123' } });
```

### CerialId from a Previous Query

Pass a `CerialId` returned from a previous query directly:

```typescript
const user = await db.User.findOne({ where: { id: '123' } });

// Use the CerialId directly in another query
await db.Post.findMany({ where: { authorId: user.id } });
```

### CerialId in Relation Operations

```typescript
const user = await db.User.findOne({ where: { id: '123' } });

await db.Post.create({
  data: {
    title: 'Hello World',
    authorId: user.id, // CerialId accepted here
  },
});
```

### Native SurrealDB RecordId

If you're working with the SurrealDB SDK directly:

```typescript
import { RecordId } from 'surrealdb';

await db.User.findOne({
  where: { id: new RecordId('user', '123') },
});
```

## Comparing CerialIds

Always use the `.equals()` method to compare `CerialId` values. Do **not** use `==` or `===`.

```typescript
// Correct — compares by value
user1.id.equals(user2.id); // true or false

// Wrong — compares object references, not values
user1.id === user2.id; // false (different object instances!)
user1.id == user2.id; // false (same problem)
```

The `.equals()` method compares both the `table` and `id` properties, so two `CerialId` instances pointing to the same record will always be equal:

```typescript
const a = await db.User.findOne({ where: { id: '123' } });
const b = await db.User.findOne({ where: { id: '123' } });

a.id.equals(b.id); // true — same table and id
```

## Transformation Flow

Cerial handles the conversion between `RecordIdInput` and `CerialId` automatically at the query layer.

### Sending to SurrealDB (Input)

When you pass a `RecordIdInput` value in a query, Cerial calls `transformOrValidateRecordId(tableName, value)` to convert it into a native `RecordId(table, id)` that SurrealDB understands.

```
RecordIdInput → transformOrValidateRecordId() → RecordId(table, id) → SurrealDB
```

- **`string`** — wrapped as `RecordId(tableName, value)`
- **`CerialId`** — extracted via `.toRecordId()`
- **`RecordId`** — passed through directly
- **`StringRecordId`** — parsed and converted

### Receiving from SurrealDB (Output)

When SurrealDB returns query results, Cerial calls `transformRecordIdToValue(recordId)` to convert native `RecordId` instances into `CerialId` objects.

```
SurrealDB → RecordId → transformRecordIdToValue() → CerialId → Your Code
```

This transformation is applied recursively to all fields in the result, so nested record references (e.g., inside included relations) are also converted.

## Key Source Files

| File                                         | Purpose                                              |
| -------------------------------------------- | ---------------------------------------------------- |
| `src/utils/cerial-id.ts`                     | `CerialId` class definition and `RecordIdInput` type |
| `src/query/mappers/result-mapper.ts`         | Converts `RecordId` → `CerialId` on query output     |
| `src/query/transformers/data-transformer.ts` | Converts `RecordIdInput` → `RecordId` on query input |
