---
title: Uuid
parent: Field Types
grand_parent: Schema
nav_order: 9
---

# Uuid

A universally unique identifier stored as SurrealDB's native `uuid` type. Output is a `CerialUuid` instance; input accepts `CerialUuidInput` (string, `CerialUuid`, or SDK `Uuid`).

## Schema Syntax

```cerial
model Session {
  id Record @id
  token Uuid
  optionalToken Uuid?
  nullableToken Uuid? @nullable
  tokens Uuid[]
}
```

## Types

| Direction | Type                                             |
| --------- | ------------------------------------------------ |
| Output    | `CerialUuid`                                     |
| Input     | `CerialUuidInput` (string \| CerialUuid \| Uuid) |
| SurrealDB | `uuid`                                           |

## CerialUuid API

```typescript
import { CerialUuid } from 'cerial';

// Create from string
const uuid = new CerialUuid('550e8400-e29b-41d4-a716-446655440000');

// Static constructors
CerialUuid.from(input); // from CerialUuidInput
CerialUuid.fromString(str); // from string
CerialUuid.fromNative(uuid); // from SDK Uuid
CerialUuid.parse(input); // alias for from()
CerialUuid.v4(); // generate random v4 UUID
CerialUuid.v7(); // generate time-ordered v7 UUID

// Instance methods
uuid.toString(); // '550e8400-e29b-41d4-a716-446655440000'
uuid.toJSON(); // same as toString()
uuid.valueOf(); // same as toString()
uuid.toNative(); // SDK Uuid instance
uuid.equals(other); // compare with CerialUuidInput
uuid.clone(); // new CerialUuid copy

// Type guard
CerialUuid.is(value); // value is CerialUuid
```

## Usage

```typescript
// Create with string UUID
const session = await db.Session.create({
  data: { token: '550e8400-e29b-41d4-a716-446655440000' },
});

// Create with CerialUuid
const session2 = await db.Session.create({
  data: { token: CerialUuid.v4() },
});

// Output is CerialUuid
console.log(session.token); // CerialUuid instance
console.log(session.token.toString()); // '550e8400-e29b-41d4-a716-446655440000'
```

## Filtering

UUID fields support comparison and set operators:

```typescript
// Direct equality
const sessions = await db.Session.findMany({
  where: { token: '550e8400-e29b-41d4-a716-446655440000' },
});

// Comparison operators
const sessions2 = await db.Session.findMany({
  where: {
    token: {
      eq: '550e8400-e29b-41d4-a716-446655440000',
      neq: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      gt: '00000000-0000-0000-0000-000000000000',
      lt: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    },
  },
});

// Set operators
const sessions3 = await db.Session.findMany({
  where: {
    token: { in: [uuid1, uuid2] },
  },
});
```

## Array Operations

```typescript
// Create with UUID array
const session = await db.Session.create({
  data: { tokens: [CerialUuid.v4(), CerialUuid.v4()] },
});

// Push to array
await db.Session.updateUnique({
  where: { id: session.id },
  data: { tokens: { push: CerialUuid.v4() } },
});
```

## Auto-Generation

Use `@uuid`, `@uuid4`, or `@uuid7` decorators for database-side auto-generation. See [@uuid / @uuid4 / @uuid7](../decorators/uuid) for details.
