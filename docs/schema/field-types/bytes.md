---
title: Bytes
parent: Field Types
grand_parent: Schema
nav_order: 12
---

# Bytes

Binary data stored as SurrealDB's native `bytes` type. Output is a `CerialBytes` instance; input accepts `CerialBytesInput` (Uint8Array, base64 string, or `CerialBytes`).

## Schema Syntax

```cerial
model Document {
  id Record @id
  payload Bytes
  thumbnail Bytes?
  checksum Bytes @nullable
  chunks Bytes[]
}
```

## Types

| Direction | Type                                                     |
| --------- | -------------------------------------------------------- |
| Output    | `CerialBytes`                                            |
| Input     | `CerialBytesInput` (Uint8Array \| string \| CerialBytes) |
| SurrealDB | `bytes`                                                  |

## CerialBytes API

```typescript
import { CerialBytes } from 'cerial';

// Create from Uint8Array
const data = new CerialBytes(new Uint8Array([1, 2, 3]));

// Create from base64 string
const fromBase64 = new CerialBytes('AQID');

// Static constructors
CerialBytes.from(input); // from CerialBytesInput
CerialBytes.fromBase64(base64); // from base64 string
CerialBytes.fromBuffer(buffer); // from Buffer or Uint8Array

// Properties
data.length; // number of bytes
data.byteLength; // byte length

// Conversion
data.toUint8Array(); // Uint8Array
data.toBuffer(); // Node.js Buffer
data.toBase64(); // base64 string
data.toString(); // same as toBase64()
data.toJSON(); // same as toBase64()

// Comparison
data.equals(other); // true if byte-equal

// SDK interop
data.toNative(); // Uint8Array (SurrealDB SDK uses plain Uint8Array)
data.clone(); // new CerialBytes copy

// Type guard
CerialBytes.is(value); // value is CerialBytes
```

## Usage

```typescript
// Create with Uint8Array
const doc = await db.Document.create({
  data: { payload: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]), checksum: null },
});

// Create with base64 string
const doc2 = await db.Document.create({
  data: { payload: 'SGVsbG8=', checksum: null },
});

// Create with CerialBytes
const doc3 = await db.Document.create({
  data: { payload: CerialBytes.from(new Uint8Array([1, 2, 3])), checksum: null },
});

// Output is CerialBytes
console.log(doc.payload); // CerialBytes instance
console.log(doc.payload.toBase64()); // 'SGVsbG8='
console.log(doc.payload.length); // 5
```

## Filtering

Bytes fields support equality and set operators only. Comparison operators (`gt`, `lt`, `gte`, `lte`, `between`) are **not** available.

```typescript
// Direct equality
const docs = await db.Document.findMany({
  where: { payload: new Uint8Array([1, 2, 3]) },
});

// Equality operators
const match = await db.Document.findMany({
  where: { payload: { eq: new Uint8Array([1, 2, 3]) } },
});

// Set operators
const specific = await db.Document.findMany({
  where: {
    payload: { in: [new Uint8Array([1]), new Uint8Array([2])] },
  },
});
```

## Array Operations

```typescript
// Create with bytes array
const doc = await db.Document.create({
  data: { payload: new Uint8Array([1]), checksum: null, chunks: [new Uint8Array([10]), new Uint8Array([20])] },
});

// Push to array
await db.Document.updateUnique({
  where: { id: doc.id },
  data: { chunks: { push: new Uint8Array([30]) } },
});

// Full replace
await db.Document.updateUnique({
  where: { id: doc.id },
  data: { chunks: [new Uint8Array([100])] },
});
```

## Limitations

- **No `@default` support** — Bytes fields do not support the `@default` decorator. SurrealDB's bytes literal syntax (`<bytes>"..."`) cannot be expressed in `@default`.
- **Equality-only filtering** — No comparison operators (`gt`, `lt`, `gte`, `lte`, `between`). Use `eq`, `neq`, `in`, `notIn` only.
