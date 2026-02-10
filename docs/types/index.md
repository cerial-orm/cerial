---
title: Type System
nav_order: 10
has_children: true
---

# Type System

Cerial generates fully type-safe TypeScript code from your `.cerial` schema files. Every model and object in your schema produces a rich set of TypeScript types that give you compile-time safety, IntelliSense autocompletion, and runtime correctness guarantees.

## Key Aspects

### Typed Interfaces for Every Model

Every model in your schema generates typed interfaces, input types, where types, select types, and payload types. This means your queries are validated at compile time — if you misspell a field name, reference a wrong type, or forget a required field, TypeScript catches it before your code ever runs.

```typescript
// All of these are fully typed and validated at compile time
const user = await db.User.create({
  data: { email: 'alice@example.com', name: 'Alice' },
});

const users = await db.User.findMany({
  where: { email: { contains: 'example' } },
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
});
```

### CerialId — Not Raw Strings

SurrealDB record IDs use a `table:id` format. Rather than exposing raw strings, Cerial wraps all record IDs in [`CerialId`](cerial-id.md) objects that provide type-safe access to the table name, raw ID, and comparison methods. Input types accept a flexible `RecordIdInput` union so you can pass strings, `CerialId` instances, or native SurrealDB `RecordId` objects.

### NONE vs null

SurrealDB distinguishes between a field that doesn't exist (`NONE`) and a field that exists with a null value (`null`). Cerial's type system [fully represents this distinction](none-vs-null.md) in TypeScript, giving you precise control over field presence and nullability.

### Dynamic Return Types

Return types change based on your `select` and `include` options. If you select only `id` and `name`, the return type contains only those fields. If you include a relation, the return type adds that relation's data. This is powered by TypeScript conditional types and the [`GetModelPayload`](dynamic-return-types.md) generic type.

## Child Pages

| Page                                            | Description                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [CerialId](cerial-id.md)                        | The `CerialId` class, `RecordIdInput` union, and record ID transformation flow            |
| [NONE vs null](none-vs-null.md)                 | How SurrealDB's NONE/null distinction maps to TypeScript types and query operators        |
| [Generated Types](generated-types.md)           | Complete reference of all types generated per model and per object                        |
| [Dynamic Return Types](dynamic-return-types.md) | How `GetModelPayload`, `ResolveFieldSelect`, and `ApplyObjectSelect` compute return types |
