---
title: Typed IDs
parent: Schema
nav_order: 8
---

# Typed IDs

By default, SurrealDB models use string IDs. The `Record(Type)` syntax lets you control the ID's value type, which flows through to all generated TypeScript types.

## Syntax

```cerial
model ModelName {
  id Record(Type) @id
  ...
}
```

Replace `Type` with one or more supported ID types. Multiple types create a union.

## Supported ID Types

| Type        | Schema                    | TypeScript         | Required on Create? |
| ----------- | ------------------------- | ------------------ | ------------------- |
| _(default)_ | `Record @id`              | `string`           | No (auto-generated) |
| `string`    | `Record(string) @id`      | `string`           | No (auto-generated) |
| `int`       | `Record(int) @id`         | `number`           | Yes                 |
| `float`     | `Record(float) @id`       | `number`           | Yes                 |
| `number`    | `Record(number) @id`      | `number`           | Yes                 |
| `uuid`      | `Record(uuid) @id`        | `string`           | No (auto-generated) |
| Tuple ref   | `Record(TupleName) @id`   | `TupleName`        | Yes                 |
| Object ref  | `Record(ObjName) @id`     | `ObjName`          | Yes                 |
| Union       | `Record(string, int) @id` | `string \| number` | Depends (see below) |

### Union Types

Pass multiple types separated by commas to accept more than one ID form:

```cerial
model FlexModel {
  id Record(string, int) @id
  label String
}
```

A union ID is **optional** on create if `string` is one of the types (SurrealDB auto-generates string IDs). Otherwise, it's required.

```typescript
// string is in the union, so id is optional
await db.FlexModel.create({ data: { label: 'test' } });

// You can still provide an explicit ID of either type
await db.FlexModel.create({ data: { id: 'abc', label: 'test' } });
await db.FlexModel.create({ data: { id: 42, label: 'test' } });
```

## Create Input Optionality

Whether the `id` field is required or optional on create depends on the ID type:

| Declaration               | Create `id` field       | Why                                       |
| ------------------------- | ----------------------- | ----------------------------------------- |
| `Record @id`              | `id?: string`           | SurrealDB auto-generates string IDs       |
| `Record(string) @id`      | `id?: string`           | SurrealDB auto-generates string IDs       |
| `Record(int) @id`         | `id: number`            | No auto-generation for integers           |
| `Record(float) @id`       | `id: number`            | No auto-generation for floats             |
| `Record(number) @id`      | `id: number`            | No auto-generation for numbers            |
| `Record(uuid) @id`        | `id?: string`           | SurrealDB auto-generates UUIDs            |
| `Record(TupleName) @id`   | `id: TupleNameInput`    | No auto-generation for tuple IDs          |
| `Record(ObjName) @id`     | `id: ObjNameInput`      | No auto-generation for object IDs         |
| `Record(string, int) @id` | `id?: string \| number` | `string` in union enables auto-generation |
| `Record(int, float) @id`  | `id: number`            | No `string` in union, so required         |

The rule is simple: if `string` or `uuid` is in the type (or it's a plain `Record @id`), the ID is optional because SurrealDB can generate one. For all other types, you must provide the ID yourself.

## FK Type Inference

When a model declares a typed ID, any FK `Record` field that references it via `@model()` inherits the ID type automatically. You don't need to repeat the type on FK fields, and doing so is an error.

```cerial
model Product {
  id Record(int) @id
  name String
  orders Relation[] @model(Order)
}

model Order {
  id Record @id
  productId Record                                  // Just Record, not Record(int)
  product Relation @field(productId) @model(Product)
}
```

Cerial sees that `productId` points to `Product` (which has `Record(int) @id`) and generates:

```typescript
// Output type
interface Order {
  id: CerialId<string>;
  productId: CerialId<number>; // inferred from Product's int ID
}

// Input type
interface OrderCreate {
  product: { connect: RecordIdInput<number> } | { create: ProductNestedCreate };
}
```

The FK field's type always matches the target model's ID type. This keeps things consistent without manual repetition.

## Standalone Record Typing

`Record(Type)` can also be used on non-FK record fields (without a paired `Relation`). This is useful when you store a reference to a record but don't need Cerial's relation features (nested create/connect/disconnect).

```cerial
model AuditLog {
  id Record @id
  targetId Record(int)          // typed record ref, no Relation
  action String
}
```

```typescript
// Output
interface AuditLog {
  id: CerialId<string>;
  targetId: CerialId<number>; // typed
}

// Input
interface AuditLogCreate {
  targetId: number | RecordIdInput<number>;
}
```

## Practical Examples

### Integer IDs

```cerial
model Product {
  id Record(int) @id
  name String
  price Float
}
```

```typescript
// id is required (no auto-generation for integers)
const product = await db.Product.create({
  data: { id: 1, name: 'Widget', price: 9.99 },
});

product.id; // CerialId<number>
product.id.id; // 1

// Querying with integer ID
const found = await db.Product.findOne({ where: { id: 1 } });
```

### UUID IDs

```cerial
model Session {
  id Record(uuid) @id
  token String
  expiresAt Date
}
```

```typescript
// id is optional (SurrealDB auto-generates UUIDs)
const session = await db.Session.create({
  data: { token: 'abc', expiresAt: new Date() },
});

session.id; // CerialId<string>
session.id.id; // '01942f3e-...' (auto-generated UUID string)

// Or provide your own
const session2 = await db.Session.create({
  data: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    token: 'def',
    expiresAt: new Date(),
  },
});
```

### Union IDs

```cerial
model Asset {
  id Record(string, int) @id
  name String
}
```

```typescript
// Optional: SurrealDB auto-generates when omitted (string in union)
const a1 = await db.Asset.create({ data: { name: 'Auto' } });

// Provide a string ID
const a2 = await db.Asset.create({ data: { id: 'logo', name: 'Logo' } });

// Provide an integer ID
const a3 = await db.Asset.create({ data: { id: 100, name: 'Banner' } });

a1.id; // CerialId<string | number>
a2.id; // CerialId<string | number>
a3.id; // CerialId<string | number>
```

### FK Inference in Action

```cerial
model Author {
  id Record(int) @id
  name String
  books Relation[] @model(Book)
}

model Book {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(Author)
}
```

```typescript
const author = await db.Author.create({
  data: { id: 1, name: 'Alice' },
});

// connect accepts number (inferred from Author's int ID)
const book = await db.Book.create({
  data: {
    title: 'My Book',
    author: { connect: 1 },
  },
});

book.authorId; // CerialId<number>
book.authorId.id; // 1

// CerialId from a previous query works too
const book2 = await db.Book.create({
  data: {
    title: 'Another Book',
    author: { connect: author.id },
  },
});
```

### Tuple IDs

```cerial
tuple Coordinate {
  x Int,
  y Int
}

model Tile {
  id Record(Coordinate) @id
  terrain String
}
```

```typescript
// Tuple IDs are always required
const tile = await db.Tile.create({
  data: { id: [10, 20], terrain: 'grass' },
});

tile.id; // CerialId<[number, number]>
tile.id.id; // [10, 20]
```
