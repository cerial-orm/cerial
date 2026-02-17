---
title: Field Types
parent: Schema
nav_order: 1
---

# Field Types

Cerial supports 15 built-in field types plus user-defined enum, tuple, object, and literal types. Each type maps to a specific SurrealDB type and TypeScript type.

## Type Reference

| Type       | Description                                      | TypeScript                                                | SurrealDB                                     | Can be Array    | Can be Optional |
| ---------- | ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------- | --------------- | --------------- |
| `String`   | Text string                                      | `string`                                                  | `string`                                      | Yes             | Yes             |
| `Email`    | Email address (validated)                        | `string`                                                  | `string` (with `string::is::email` assertion) | No              | Yes             |
| `Int`      | Integer number                                   | `number`                                                  | `int`                                         | Yes             | Yes             |
| `Float`    | Floating point number                            | `number`                                                  | `float`                                       | Yes             | Yes             |
| `Number`   | Auto-detect numeric (int or float)               | `number`                                                  | `number`                                      | Yes             | Yes             |
| `Bool`     | Boolean value                                    | `boolean`                                                 | `bool`                                        | Yes             | Yes             |
| `Date`     | Date/DateTime                                    | `Date`                                                    | `datetime`                                    | Yes             | Yes             |
| `Uuid`     | UUID identifier                                  | `CerialUuid` (output) / `CerialUuidInput` (input)         | `uuid`                                        | Yes             | Yes             |
| `Duration` | Time duration                                    | `CerialDuration` (output) / `CerialDurationInput` (input) | `duration`                                    | Yes             | Yes             |
| `Decimal`  | Arbitrary-precision decimal                      | `CerialDecimal` (output) / `CerialDecimalInput` (input)   | `decimal`                                     | Yes             | Yes             |
| `Bytes`    | Binary data                                      | `CerialBytes` (output) / `CerialBytesInput` (input)       | `bytes`                                       | Yes             | Yes             |
| `Geometry` | Geospatial data                                  | `CerialGeometry` (output) / `CerialGeometryInput` (input) | `geometry<subtype>`                           | Yes             | Yes             |
| `Any`      | Pass-through (any SurrealDB value)               | `CerialAny`                                               | `any`                                         | Yes             | No              |
| `Record`   | Record reference                                 | `CerialId` (output) / `RecordIdInput` (input)             | `record<tablename>`                           | Yes             | Yes             |
| `Relation` | Virtual relation                                 | N/A (not stored)                                          | Virtual                                       | As `Relation[]` | As `Relation?`  |
| `Enum`     | Named string constants                           | `'VALUE1' \| 'VALUE2'`                                    | `'VALUE1' \| 'VALUE2'`                        | Yes             | Yes             |
| `Literal`  | Union type (specific values or structured types) | `'value' \| number \| Object \| Tuple`                    | `'value' \| int \| { ... } \| [...]`          | Yes             | Yes             |

## String

Plain text string. The most common field type.

```cerial
model User {
  id Record @id
  name String
  bio String?
}
```

## Email

An email address stored as a string with built-in validation. SurrealDB enforces email format via a `string::is::email` assertion in the field definition. Maps to `string` in both TypeScript and SurrealDB.

```cerial
model User {
  id Record @id
  email Email @unique
}
```

## Int

Integer number. Use for whole numbers like counts, ages, and quantities.

```cerial
model Product {
  id Record @id
  name String
  stock Int
  rating Int?
}
```

## Float

Floating-point number. Use for decimals like prices, coordinates, and measurements.

```cerial
model GeoLocation {
  id Record @id
  lat Float
  lng Float
}
```

## Number

Auto-detect numeric type (integer or decimal). Use when you want to accept both integers and decimals without explicit type conversion. SurrealDB decides the internal representation based on the value.

```cerial
model Product {
  id Record @id
  price Number
  rating Number?
}
```

See [Number field type](field-types/number) for detailed comparison with Int and Float.

## Bool

Boolean value (`true` or `false`).

```cerial
model User {
  id Record @id
  name String
  isActive Bool @default(true)
  isVerified Bool @default(false)
}
```

## Date

Date/DateTime value. Stored as `datetime` in SurrealDB, represented as a JavaScript `Date` in TypeScript.

```cerial
model Event {
  id Record @id
  title String
  startDate Date
  endDate Date?
  createdAt Date @createdAt
}
```

## Uuid

A universally unique identifier. Stored as SurrealDB's native `uuid` type, represented as a `CerialUuid` in TypeScript.

- **Output type**: `CerialUuid` — an object with `.value`, `.toString()`, `.toNative()`, and `.equals()` methods
- **Input type**: `CerialUuidInput` — accepts `string`, `CerialUuid`, or SDK `Uuid`

```cerial
model Session {
  id Record @id
  token Uuid
  autoId Uuid @uuid       # auto-generated on create
  tokens Uuid[]
}
```

```typescript
const session = await db.Session.create({
  data: { token: '550e8400-e29b-41d4-a716-446655440000' },
});
console.log(session.token); // CerialUuid instance
console.log(session.token.toString()); // '550e8400-e29b-41d4-a716-446655440000'
```

See [Uuid field type](field-types/uuid) for the full CerialUuid API and filtering details.

## Duration

A time duration value. Stored as SurrealDB's native `duration` type, represented as a `CerialDuration` in TypeScript.

- **Output type**: `CerialDuration` — an object with accessors (`.hours`, `.minutes`, `.seconds`, etc.), `.toString()`, `.toNative()`, `.equals()`, and `.compareTo()` methods
- **Input type**: `CerialDurationInput` — accepts `string`, `CerialDuration`, or SDK `Duration`

```cerial
model Task {
  id Record @id
  name String
  ttl Duration
  timeout Duration?
  intervals Duration[]
}
```

```typescript
const task = await db.Task.create({
  data: { name: 'job', ttl: '2h30m' },
});
console.log(task.ttl); // CerialDuration instance
console.log(task.ttl.toString()); // '2h30m'
console.log(task.ttl.hours); // 2
console.log(task.ttl.minutes); // 150
```

See [Duration field type](field-types/duration) for the full CerialDuration API and filtering details.

## Decimal

An arbitrary-precision decimal number. Use for financial calculations, precise measurements, or any value where floating-point rounding is unacceptable. Stored as SurrealDB's native `decimal` type, represented as a `CerialDecimal` in TypeScript.

- **Output type**: `CerialDecimal` — an object with arithmetic methods (`.add()`, `.sub()`, `.mul()`, `.div()`), comparison (`.equals()`, `.compareTo()`), `.toNumber()`, `.toString()`, `.toNative()`, and `.clone()` methods
- **Input type**: `CerialDecimalInput` — accepts `number`, `string`, `CerialDecimal`, or SDK `Decimal`

```cerial
model Product {
  id Record @id
  name String
  price Decimal
  discount Decimal?
  amounts Decimal[]
}
```

```typescript
const product = await db.Product.create({
  data: { name: 'Widget', price: '99999999.99' },
});
console.log(product.price); // CerialDecimal instance
console.log(product.price.toString()); // '99999999.99'
console.log(product.price.toNumber()); // 99999999.99
```

See [Decimal field type](field-types/decimal) for the full CerialDecimal API and filtering details.

## Bytes

Binary data stored as SurrealDB's native `bytes` type, represented as a `CerialBytes` in TypeScript.

- **Output type**: `CerialBytes` — an object with `.toUint8Array()`, `.toBuffer()`, `.toBase64()`, `.toString()`, `.toNative()`, `.equals()`, and `.clone()` methods
- **Input type**: `CerialBytesInput` — accepts `Uint8Array`, base64 `string`, or `CerialBytes`

```cerial
model Document {
  id Record @id
  payload Bytes
  thumbnail Bytes?
  chunks Bytes[]
}
```

```typescript
const doc = await db.Document.create({
  data: { payload: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) },
});
console.log(doc.payload); // CerialBytes instance
console.log(doc.payload.toBase64()); // 'SGVsbG8='
console.log(doc.payload.length); // 5
```

See [Bytes field type](field-types/bytes) for the full CerialBytes API and filtering details.

## Geometry

Geospatial data stored using SurrealDB's native `geometry` type. Use subtype decorators (`@point`, `@line`, `@polygon`, etc.) to constrain which geometry types a field accepts. Without decorators, a field accepts any geometry subtype.

- **Output type**: `CerialGeometry` (or narrowed subclass like `CerialPoint` with decorators)
- **Input type**: `CerialGeometryInput` — accepts GeoJSON objects, `[lon, lat]` shorthand for points, `CerialGeometry` instances, or SDK types

```cerial
model Location {
  id Record @id
  point Geometry @point
  area Geometry @polygon
  shape Geometry
  multi Geometry @point @polygon
}
```

```typescript
const loc = await db.Location.create({
  data: {
    point: [1.5, 2.5],
    area: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    shape: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [5, 5],
      ],
    },
    multi: [3, 4],
  },
});
console.log(loc.point); // CerialPoint instance
console.log(loc.point.coordinates); // [1.5, 2.5]
```

See [Geometry field type](field-types/geometry) for the full CerialGeometry API, subtype decorators, and filtering details.

## Any

A pass-through type that stores any SurrealDB value. Uses the `CerialAny` recursive union type.

- **Output type**: `CerialAny` — a recursive union of all Cerial types including string, number, boolean, Date, CerialId, null, arrays, and objects
- **Input type**: `CerialAny`
- **No optional (`?`)** — SurrealDB `TYPE any` natively accepts NONE and null
- **No `@nullable`** — CerialAny already includes null

```cerial
model Flexible {
  id Record @id
  data Any
  items Any[]
}
```

See [Any field type](field-types/any) for the full CerialAny definition and filtering.

## Record

A SurrealDB record reference. Record fields store foreign keys in the `table:id` format. They are the storage mechanism for relations.

- **Output type**: `CerialId` — an object with `.table`, `.id`, `.toString()`, `.toRecordId()`, and `.equals()` methods
- **Input type**: `RecordIdInput` — accepts `string`, `CerialId`, `RecordId`, or `StringRecordId`

```cerial
model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}
```

```typescript
// Input: plain string (just the ID part)
const post = await db.Post.create({
  data: { title: 'Hello', author: { connect: 'user-abc' } },
});

// Output: CerialId object
console.log(post.authorId); // CerialId { table: 'user', id: 'user-abc' }
console.log(post.authorId.id); // 'user-abc'
console.log(post.authorId.table); // 'user'
console.log(post.authorId.toString()); // 'user:user-abc'
```

The `id Record @id` field is a special case — it serves as the model's primary key and has special handling (see [@id decorator](decorators/id)).

## Relation

A virtual field that defines a relationship between models. Relation fields are **not stored** in the database — they describe how to traverse between models using the underlying Record field.

- Forward relations use `@field()` and `@model()` decorators
- Reverse relations use only `@model()`
- `Relation` = required one-to-one
- `Relation?` = optional one-to-one
- `Relation[]` = one-to-many or many-to-many

```cerial
model User {
  id Record @id
  name String
  posts Relation[] @model(Post)           # Reverse: User has many Posts
}

model Post {
  id Record @id
  title String
  authorId Record                          # FK storage field
  author Relation @field(authorId) @model(User)  # Forward: Post belongs to User
}
```

See [@field and @model](decorators/field-and-model) for full relation configuration.

## Enum Types

Enums define a fixed set of named string constants. They resolve to SurrealDB `literal` types internally, but are declared with the `enum` keyword and generate a const object for runtime access.

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }

model User {
  id Record @id
  name String
  status Status          # required enum
  role Status?           # optional enum
  tags Status[]          # array of enum values
}
```

```typescript
import { StatusEnum } from './generated/client';

// Runtime access via const object
console.log(StatusEnum.ACTIVE); // 'ACTIVE'
```

See [Enums](enums) for full syntax, generated types, and filtering details.

## Object Types

In addition to the 8 built-in types, you can use user-defined object types as field types. Objects are embedded inline within the model (not stored as separate tables). See the [Objects](../objects/) section for details.

```cerial
object Address {
  street String
  city String
  state String
}

model User {
  id Record @id
  name String
  address Address        # embedded object
  shipping Address?      # optional embedded object
}
```

## Tuple Types

User-defined tuple types provide fixed-length, typed arrays. Each element has a specific type and position. Unlike objects, tuple output is always an array. See the [Tuples](../tuples/) section for details.

```cerial
tuple Coordinate {
  lat Float,
  lng Float
}

model User {
  id Record @id
  name String
  location Coordinate       # required tuple
  backup Coordinate?        # optional tuple
  history Coordinate[]      # array of tuples
}
```

Input accepts both array form (`[40.7, -74.0]`) and object form (`{ lat: 40.7, lng: -74.0 }`). Output is always array form.

## Literal Types

Literals define union types for fields, allowing a field to hold one of several specific values or structured types:

```cerial
literal Status { 'active', 'inactive', 'pending' }
literal Shape { 'none', Point }
```

See [Literals](literals) for details on defining and using literal types.
