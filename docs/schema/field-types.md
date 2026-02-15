---
title: Field Types
parent: Schema
nav_order: 1
---

# Field Types

Cerial supports 8 built-in field types plus user-defined enum, tuple, object, and literal types. Each type maps to a specific SurrealDB type and TypeScript type.

## Type Reference

| Type       | Description                                      | TypeScript                                    | SurrealDB                                     | Can be Array    | Can be Optional |
| ---------- | ------------------------------------------------ | --------------------------------------------- | --------------------------------------------- | --------------- | --------------- |
| `String`   | Text string                                      | `string`                                      | `string`                                      | Yes             | Yes             |
| `Email`    | Email address (validated)                        | `string`                                      | `string` (with `string::is::email` assertion) | No              | Yes             |
| `Int`      | Integer number                                   | `number`                                      | `int`                                         | Yes             | Yes             |
| `Float`    | Floating point number                            | `number`                                      | `float`                                       | Yes             | Yes             |
| `Bool`     | Boolean value                                    | `boolean`                                     | `bool`                                        | Yes             | Yes             |
| `Date`     | Date/DateTime                                    | `Date`                                        | `datetime`                                    | Yes             | Yes             |
| `Record`   | Record reference                                 | `CerialId` (output) / `RecordIdInput` (input) | `record<tablename>`                           | Yes             | Yes             |
| `Relation` | Virtual relation                                 | N/A (not stored)                              | Virtual                                       | As `Relation[]` | As `Relation?`  |
| `Enum`     | Named string constants                           | `'VALUE1' \| 'VALUE2'`                        | `'VALUE1' \| 'VALUE2'`                        | Yes             | Yes             |
| `Literal`  | Union type (specific values or structured types) | `'value' \| number \| Object \| Tuple`        | `'value' \| int \| { ... } \| [...]`          | Yes             | Yes             |

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
