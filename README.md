# Cerial

A Prisma-like ORM for [SurrealDB](https://surrealdb.com/) with schema-driven code generation and full TypeScript type safety.

## Features

- **Schema-first** - Define models in `.cerial` files with a clean, readable syntax
- **Type-safe client** - Generated TypeScript types with full IntelliSense
- **Prisma-like API** - Familiar `db.Model.findMany()` with `select`, `include`, `where`, `orderBy`
- **Dynamic return types** - Return types narrow based on `select` and `include`
- **Embedded objects** - Inline `object {}` types with sub-field select, filtering, and updates
- **Tuples** - Fixed-length typed arrays with `tuple {}` blocks, named elements, and flexible input forms
- **Literal types** — Define union types for fields with specific values, broad types, or structured variants
- **Enums** — String-only named constants with `enum {}`, generating `as const` objects and union types
- **Relations** - 1:1, 1:N, N:N with nested create/connect/disconnect and bidirectional sync
- **Array support** - `String[]`, `Int[]`, `Date[]`, `Record[]`, `ObjectType[]` with query and update operators
- **Advanced filtering** - Comparison, string, array, logical, nested relation, and object operators
- **Upsert** - Create-or-update with `upsert` and conditional field logic
- **Transactions** - Three modes: array (batch queries), callback (managed tx with model access), and manual (explicit commit/cancel with `txn` option)
- **Parameterized queries** - All values bound via variables, safe from injection
- **Auto migrations** - Schema changes generate SurrealQL `DEFINE TABLE/FIELD/INDEX` statements
- **Write-once fields** - `@readonly` decorator for immutable fields, enforced at type level and runtime
- **NONE vs null** - Clean separation of absent fields (`?`) from null values (`@nullable`)
- **UUID fields** - Native UUID type with `CerialUuid` wrapper and `@uuid`/`@uuid4`/`@uuid7` auto-generation decorators
- **Duration fields** - Time duration with `CerialDuration` wrapper, accessors, and comparison
- **Decimal fields** - Arbitrary-precision decimals with `CerialDecimal` wrapper and arithmetic methods
- **Bytes fields** - Binary data with `CerialBytes` wrapper, base64/buffer conversion
- **Geometry fields** - Geospatial data with 7 subtype decorators (`@point`, `@polygon`, etc.) and GeoJSON support
- **Number fields** - Auto-detect numeric type for flexible integer/float input
- **Any type** - Store any SurrealDB value with type-safe CerialAny union
- **Set arrays** - `@set` decorator for auto-deduplicated, sorted arrays
- **Typed IDs** - `Record(int) @id`, `Record(uuid) @id`, union types, and automatic FK type inference
- **Multi-schema** - Multiple independent schema folders with per-schema client generation
- **Configuration** - `cerial.config.ts` / `cerial.config.json` with `defineConfig()` helper
- **Path filtering** — `ignore`/`exclude`/`include` config fields with `.cerialignore` file support for controlling which schemas are processed
- **Watch mode** - Auto-regenerate on schema changes with per-schema isolation
- **CLI init** - `cerial init` scaffolds config from detected schemas

## Installation

```bash
bun add cerial
```

## Quick Start

### 1. Define your schema

```
enum Role {
  Admin
  Editor
  Viewer
}

model User {
  id Record @id
  email Email @unique
  name String
  age Int?
  role Role @default(Viewer)
  isActive Bool @default(true)
  createdAt Date @createdAt
  updatedAt Date @updatedAt
  posts Relation[] @model(Post)
  nicknames String[]
}

model Post {
  id Record @id
  title String
  content String?
  authorId Record
  author Relation @field(authorId) @model(User)
  createdAt Date @createdAt
}
```

### 2. Generate the client

```bash
bunx cerial generate -s ./schemas -o ./db-client
```

Or use a config file:

```typescript
// cerial.config.ts
import { defineConfig } from 'cerial';
export default defineConfig({
  schema: './schemas',
  output: './db-client',
});
```

```bash
bunx cerial generate
```

### 3. Use it

```typescript
import { CerialClient } from "./db-client";

const client = new CerialClient();

await client.connect({
  url: "http://localhost:8000",
  namespace: "main",
  database: "main",
  auth: { username: "root", password: "root" },
});

// Create
const user = await client.db.User.create({
  data: {
    email: "john@example.com",
    name: "John Doe",
    isActive: true,
    nicknames: ["Johnny"],
  },
});

// Query with type-safe select
const users = await client.db.User.findMany({
  where: { isActive: true, age: { gte: 18 } },
  select: { id: true, name: true, email: true },
  orderBy: { createdAt: "desc" },
  limit: 10,
});
// users: { id: CerialId; name: string; email: string }[]

// Include relations
const userWithPosts = await client.db.User.findOne({
  where: { id: user.id },
  include: {
    posts: { limit: 5, orderBy: { createdAt: "desc" } },
  },
});
// userWithPosts: (User & { posts: Post[] }) | null

await client.disconnect();
```

## Documentation

Full documentation is available at the [Cerial Docs](docs/) site, covering:

- [Getting Started](docs/getting-started.md) - Installation, setup, first queries
- [Schema](docs/schema/) - Field types, decorators, arrays, optionals, cross-file references
- [Field Types](docs/schema/field-types/) - Uuid, Number, Duration, Decimal, Bytes, Geometry, Any, and more
- [Typed IDs](docs/schema/typed-ids.md) - `Record(int) @id`, union types, FK type inference, create optionality
- [Embedded Objects](docs/objects/) - Defining objects, sub-field select, filtering, updates
- [Tuples](docs/tuples/) - Fixed-length typed arrays, named elements, where filtering, array operations
- [Literals](docs/schema/literals.md) - Union types with specific values, broad types, and structured variants
- [Enums](docs/schema/enums.md) - String-only named constants with generated types and filtering
- [Enums vs Literals](docs/schema/enums-vs-literals.md) - When to use enums vs literal types
- [Relations](docs/relations/) - 1:1, 1:N, N:N, self-referential, nested operations, delete behavior
- [Queries](docs/queries/) - findOne, findMany, findAll, findUnique, create, upsert, update, delete, count, exists, $transaction
- [Filtering](docs/filtering/) - Comparison, string, array, logical, special, nested, object operators
- [Select & Include](docs/select-and-include/) - Dynamic return types, sub-field selection, nested includes
- [Array Operations](docs/array-operations/) - push, unset, replace, @distinct, @sort decorators
- [Type System](docs/types/) - CerialId, NONE vs null, generated types, dynamic return types
- [CLI](docs/cli/) - generate, init, config, flags, output structure
- [Configuration](docs/cli/configuration.md) - Config file formats, schema discovery, defineConfig
- [Path Filtering](docs/cli/filtering.md) - ignore, exclude, include patterns and .cerialignore
- [Multi-Schema](docs/cli/multi-schema.md) - Multiple independent schemas in one project
- [Init Command](docs/cli/init.md) - Auto-generate config with `cerial init`
- [Connection](docs/connection/) - Client setup, connection config, migrations

## Requirements

- [Bun](https://bun.sh/) runtime
- [SurrealDB](https://surrealdb.com/) database

## License

MIT
