# Cerial

A Prisma-like ORM for [SurrealDB](https://surrealdb.com/) with schema-driven code generation and full TypeScript type safety.

## Features

- **Schema-first** - Define models in `.cerial` files with a clean, readable syntax
- **Type-safe client** - Generated TypeScript types with full IntelliSense
- **Prisma-like API** - Familiar `db.Model.findMany()` with `select`, `include`, `where`, `orderBy`
- **Dynamic return types** - Return types narrow based on `select` and `include`
- **Embedded objects** - Inline `object {}` types with sub-field select, filtering, and updates
- **Relations** - 1:1, 1:N, N:N with nested create/connect/disconnect and bidirectional sync
- **Array support** - `String[]`, `Int[]`, `Date[]`, `Record[]`, `ObjectType[]` with query and update operators
- **Advanced filtering** - Comparison, string, array, logical, nested relation, and object operators
- **Upsert** - Create-or-update with `upsert` and conditional field logic
- **Transactions** - Atomic batch execution with `$transaction` and typed tuple results
- **Parameterized queries** - All values bound via variables, safe from injection
- **Auto migrations** - Schema changes generate SurrealQL `DEFINE TABLE/FIELD/INDEX` statements

## Installation

```bash
bun add cerial
```

## Quick Start

### 1. Define your schema

```
model User {
  id Record @id
  email Email @unique
  name String
  age Int?
  isActive Bool @default(true)
  createdAt Date @now
  posts Relation[] @model(Post)
  nicknames String[]
}

model Post {
  id Record @id
  title String
  content String?
  authorId Record
  author Relation @field(authorId) @model(User)
  createdAt Date @now
}
```

### 2. Generate the client

```bash
bunx cerial generate -s ./schemas -o ./db-client
```

### 3. Use it

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();

await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});

// Create
const user = await client.db.User.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    isActive: true,
    nicknames: ['Johnny'],
  },
});

// Query with type-safe select
const users = await client.db.User.findMany({
  where: { isActive: true, age: { gte: 18 } },
  select: { id: true, name: true, email: true },
  orderBy: { createdAt: 'desc' },
  limit: 10,
});
// users: { id: CerialId; name: string; email: string }[]

// Include relations
const userWithPosts = await client.db.User.findOne({
  where: { id: user.id },
  include: {
    posts: { limit: 5, orderBy: { createdAt: 'desc' } },
  },
});
// userWithPosts: (User & { posts: Post[] }) | null

await client.disconnect();
```

## Documentation

Full documentation is available at the [Cerial Docs](docs/) site, covering:

- [Getting Started](docs/getting-started.md) - Installation, setup, first queries
- [Schema](docs/schema/) - Field types, decorators, arrays, optionals, cross-file references
- [Embedded Objects](docs/objects/) - Defining objects, sub-field select, filtering, updates
- [Relations](docs/relations/) - 1:1, 1:N, N:N, self-referential, nested operations, delete behavior
- [Queries](docs/queries/) - findOne, findMany, findUnique, create, upsert, update, delete, count, exists, $transaction
- [Filtering](docs/filtering/) - Comparison, string, array, logical, special, nested, object operators
- [Select & Include](docs/select-and-include/) - Dynamic return types, sub-field selection, nested includes
- [Array Operations](docs/array-operations/) - push, unset, replace, @distinct, @sort decorators
- [Type System](docs/types/) - CerialId, NONE vs null, generated types, dynamic return types
- [CLI](docs/cli/) - generate command, flags, generated output structure
- [Connection](docs/connection/) - Client setup, connection config, migrations

## Requirements

- [Bun](https://bun.sh/) runtime
- [SurrealDB](https://surrealdb.com/) database

## License

MIT
