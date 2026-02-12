---
title: Home
nav_order: 1
---

# Cerial

A Prisma-like ORM for [SurrealDB](https://surrealdb.com/) with schema-driven code generation and full TypeScript type safety.
{: .fs-6 .fw-300 }

---

## Why Cerial?

Cerial brings the developer experience of [Prisma](https://www.prisma.io/) to [SurrealDB](https://surrealdb.com/). Define your data models in `.cerial` schema files, run a single command, and get a fully type-safe TypeScript client with dynamic return types, relation handling, and parameterized queries.

```bash
bun add cerial
```

## Key Features

- **Schema-first approach** - Define your models in `.cerial` files with a clean, readable syntax
- **Type-safe client** - Generated TypeScript types and interfaces with full IntelliSense
- **Prisma-like API** - Familiar `db.Model.findMany()` syntax with `select`, `include`, `where`, `orderBy`
- **Dynamic return types** - Full Prisma-style type inference that narrows based on `select` and `include`
- **Embedded objects** - Inline `object {}` types with sub-field select, where filtering, and update operations
- **Relations** - Forward and reverse relations (1:1, 1:N, N:N) with type-safe includes and bidirectional sync
- **Array support** - `String[]`, `Int[]`, `Date[]`, `Record[]`, `ObjectType[]` with query and update operators
- **Parameterized queries** - All values are bound via variables, safe from injection
- **Full CRUD** - `findOne`, `findMany`, `findUnique`, `create`, `updateMany`, `updateUnique`, `deleteMany`, `deleteUnique`, `count`, `exists`
- **Advanced filtering** - Comparison, string, array, logical, nested relation, and object operators
- **Auto migrations** - Schema changes automatically generate SurrealQL `DEFINE TABLE/FIELD/INDEX` statements

## Quick Example

```cerial
model User {
  id Record @id
  email Email @unique
  name String
  age Int?
  isActive Bool @default(true)
  createdAt Date @createdAt
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(User)
}
```

```typescript
const users = await client.db.User.findMany({
  where: { isActive: true, age: { gte: 18 } },
  select: { id: true, name: true, email: true },
  include: { posts: { limit: 5, orderBy: { createdAt: 'desc' } } },
});
// users: ({ id: CerialId; name: string; email: string } & { posts: Post[] })[]
```

## Getting Started

Head to the [Getting Started](getting-started) guide to install Cerial, define your first schema, and start querying.

## Documentation Sections

| Section                                 | Description                                                       |
| --------------------------------------- | ----------------------------------------------------------------- |
| [Getting Started](getting-started)      | Installation, schema definition, client generation, first queries |
| [Schema](schema/)                       | Schema definition language: types, decorators, arrays, optionals  |
| [Embedded Objects](objects/)            | Inline object types with select, where, update, and orderBy       |
| [Relations](relations/)                 | 1:1, 1:N, N:N relations, self-referential, nested operations      |
| [Queries](queries/)                     | Full CRUD API: find, create, update, delete, count, exists        |
| [Filtering](filtering/)                 | All filter operators: comparison, string, array, logical, special |
| [Select & Include](select-and-include/) | Return type inference, field selection, relation includes         |
| [Array Operations](array-operations/)   | Array update operators and array decorators                       |
| [Type System](types/)                   | CerialId, NONE vs null, generated types, dynamic return types     |
| [CLI](cli/)                             | Command-line interface and generated output structure             |
| [Connection](connection/)               | Client setup, connection management, migrations                   |

## Requirements

- [Bun](https://bun.sh/) runtime
- [SurrealDB](https://surrealdb.com/) database
