# Cerial

A Prisma-like ORM for [SurrealDB](https://surrealdb.com/) with schema-driven code generation and full TypeScript type safety.

> **Warning**: Cerial is under active development and not yet ready for production use. APIs may change between releases. Use it for experimentation and side projects — production stability is coming soon.

## Features

### Schema

- **Schema-first** — Define models in `.cerial` files with a clean, readable syntax
- **Field types** — String, Int, Float, Bool, Date, Email, Uuid, Duration, Decimal, Bytes, Geometry, Number, Any
- **Embedded objects** — Inline `object {}` types with sub-field select, filtering, and updates
- **Tuples** — Fixed-length typed arrays with `tuple {}` blocks, named elements, and flexible input forms
- **Literal types** — Union types with specific values, broad types, or structured variants
- **Enums** — String-only named constants with `enum {}`, generating `as const` objects and union types
- **Typed IDs** — `Record(int) @id`, `Record(uuid) @id`, union types, and automatic FK type inference
- **Schema inheritance** — `extends` keyword with `abstract` models, `!!private` fields, and `[pick/omit]` selective inheritance
- **Arrays** — `String[]`, `Int[]`, `Date[]`, `Record[]`, `ObjectType[]` with query and update operators
- **Set arrays** — `@set` decorator for auto-deduplicated, sorted arrays with `@distinct` and `@sort`
- **NONE vs null** — Clean separation of absent fields (`?`) from null values (`@nullable`)
- **Decorators** — `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`, `@now`, `@readonly`, `@flexible`, `@unique`, `@index`, `@nullable`, `@uuid`/`@uuid4`/`@uuid7`, geometry subtypes, and more
- **Composite directives** — `@@index` and `@@unique` for multi-field constraints
- **Multi-schema** — Multiple independent schema folders with per-schema client generation

### Relations

- **1:1, 1:N, N:N** — Full relation support with nested create, connect, and disconnect operations
- **Self-referential** — Models can relate to themselves (e.g., `User` has `friends: User[]`)
- **Bidirectional sync** — N:N relations keep both sides in sync automatically
- **Cascade behavior** — `@onDelete` controls what happens when related records are removed

### Queries

- **Full CRUD** — `findOne`, `findMany`, `findUnique`, `create`, `updateMany`, `updateUnique`, `deleteMany`, `deleteUnique`
- **Upsert** — Create-or-update with `upsert` and conditional field logic
- **Aggregates** — `count()` and `exists()` for efficient record checks
- **Select & Include** — Dynamic return types that narrow based on selected fields and included relations
- **Pagination** — `orderBy`, `limit`, and `offset` for result control
- **Return options** — `updateUnique` and `deleteUnique` support `return: 'before'`, `return: true` (boolean), or default (after)
- **Unset** — Explicit field clearing in updates with the `unset` parameter
- **Parameterized queries** — All values bound via variables, safe from injection
- **Lazy execution** — Queries return a `CerialQueryPromise` thenable, executing only on `await`
- **Hooks** — `onBeforeQuery` callback for query interception and logging
- **Introspection** — `getMetadata()`, `getName()`, `getTableName()` on every model

### Filtering

- **Comparison** — `eq`, `neq`, `not`, `gt`, `gte`, `lt`, `lte`, `between`
- **String** — `contains`, `startsWith`, `endsWith`
- **Array** — `in`, `notIn`, `has`, `hasAll`, `hasAny`, `isEmpty`
- **Existence** — `isNull`, `isDefined`, `isNone`
- **Logical** — `AND`, `OR`, `NOT` combinators
- **Nested** — Filter through relations and into object sub-fields

### Transactions

- **Array mode** — Batch multiple queries with `$transaction([q1, q2])`
- **Callback mode** — Managed transaction with model access via `$transaction(async (tx) => { ... })`
- **Manual mode** — Explicit lifecycle with `commit()` / `cancel()` and `await using` cleanup
- **Retry** — Configurable retry count with optional backoff for conflict resolution

### Type Safety

- **Generated types** — Full TypeScript types with IntelliSense from your schema
- **Dynamic return types** — Return types narrow based on `select` and `include`
- **Wrapper classes** — `CerialId`, `CerialUuid`, `CerialDuration`, `CerialDecimal`, `CerialBytes`, `CerialGeometry` with rich APIs
- **Write-once fields** — `@readonly` enforced at type level and runtime

### CLI & Tooling

- **Code generation** — `npx cerial generate` produces typed client from schema (`bunx` also works)
- **Auto migrations** — Schema changes generate SurrealQL `DEFINE TABLE/FIELD/INDEX` statements
- **Formatter** — Auto-format `.cerial` files with configurable style, column alignment, and comment preservation
- **Watch mode** — Auto-regenerate on schema changes with per-schema isolation
- **Configuration** — `cerial.config.ts` / `cerial.config.json` with `defineConfig()` helper
- **CLI init** — `cerial init` scaffolds config from detected schemas
- **Path filtering** — `ignore`/`exclude`/`include` config fields with `.cerialignore` support

## Installation

### ORM

```bash
# npm
npm install cerial

# pnpm
pnpm add cerial

# yarn
yarn add cerial

# bun
bun add cerial
```

### VS Code Extension

> **Note**: Marketplace publishing is not yet available. Install manually from a `.vsix` file.

Download the latest `.vsix` from the [GitHub Releases page](https://github.com/cerial-orm/cerial/releases?q=ext-v), then install via terminal:

```bash
code --install-extension path/to/cerial-0.1.0.vsix
```

Or install through VS Code: Extensions panel (Ctrl+Shift+X) → `...` menu → **Install from VSIX...**

See the [installation guide](https://cerial-orm.github.io/extension/installation) for more options.

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
npx cerial generate -s ./schemas -o ./db-client
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
npx cerial generate
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
const user = await client.User.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    isActive: true,
    nicknames: ['Johnny'],
  },
});

// Query with type-safe select
const users = await client.User.findMany({
  where: { isActive: true, age: { gte: 18 } },
  select: { id: true, name: true, email: true },
  orderBy: { createdAt: 'desc' },
  limit: 10,
});
// users: { id: CerialId; name: string; email: string }[]

// Include relations
const userWithPosts = await client.User.findOne({
  where: { id: user.id },
  include: {
    posts: { limit: 5, orderBy: { createdAt: 'desc' } },
  },
});
// userWithPosts: (User & { posts: Post[] }) | null

await client.disconnect();
```

## VS Code Extension

Full language support for `.cerial` schema files in VS Code and compatible editors.

- **Syntax highlighting** — Rich TextMate grammar with semantic tokens for all constructs
- **IntelliSense** — Context-aware completions for keywords, types, decorators, and cross-file references
- **Diagnostics** — Real-time parse errors and schema validation as you type
- **Formatting** — Format on save with 9 configurable style options
- **Navigation** — Go to Definition, Find All References, Rename Symbol across files
- **Hover documentation** — Type info, SurrealDB mappings, and decorator docs on hover
- **Code actions** — Quick fixes for common schema issues
- **Inlay hints** — Inferred FK types, behavior indicators, and inheritance sources
- **Snippets** — 16 code snippets for models, relations, decorators, and more

See the full extension documentation at [cerial-orm.github.io/extension](https://cerial-orm.github.io/extension).

## Upcoming

Planned features leveraging SurrealDB capabilities:

- **Computed fields** — Define derived values using SurrealDB expressions, calculated on-the-fly without storage
- **Custom functions** — Register reusable SurrealDB functions callable from queries
- **Events** — Define triggers that fire on record create, update, or delete
- **Graph relations** — Traverse relationships using SurrealDB's `->edge->` graph syntax
- **Vector search** — Store and query vector embeddings for AI/ML similarity search
- **Full-text search** — Search text fields with analyzers, tokenizers, and relevance scoring
- **Geospatial queries** — Distance calculations, containment checks, and intersection operators on Geometry fields
- **Live queries** — Real-time subscriptions that push record changes as they happen
- **Field value expressions** — Reference a field's incoming value in schema-level create/update expressions
- **Previous value access** — Access old field values during updates without a separate read query

## Documentation

Full documentation is available at [**cerial-orm.github.io**](https://cerial-orm.github.io):

- [Getting Started](https://cerial-orm.github.io/getting-started) — Installation, setup, first queries
- [Schema](https://cerial-orm.github.io/schema) — Field types, decorators, arrays, optionals, cross-file references
- [Relations](https://cerial-orm.github.io/relations) — 1:1, 1:N, N:N, self-referential, nested operations, delete behavior
- [Queries](https://cerial-orm.github.io/queries) — findOne, findMany, findUnique, create, upsert, update, delete, count, exists, $transaction
- [Filtering](https://cerial-orm.github.io/filtering) — Comparison, string, array, logical, special, nested, object operators
- [Select & Include](https://cerial-orm.github.io/select-and-include) — Dynamic return types, sub-field selection, nested includes
- [Type System](https://cerial-orm.github.io/types) — CerialId, NONE vs null, generated types, dynamic return types
- [CLI & Tooling](https://cerial-orm.github.io/cli) — generate, init, config, formatter, watch mode, path filtering
- [VS Code Extension](https://cerial-orm.github.io/extension) — Features, settings, installation, snippets
- [Release Notes](https://cerial-orm.github.io/releases) — ORM and extension changelogs

## Project Structure

This repository is a monorepo. The ORM package lives in [`apps/orm/`](apps/orm/) and the VS Code extension in [`apps/vscode-extension/`](apps/vscode-extension/).

## Requirements

- **[Node.js](https://nodejs.org/)** 20+ or **[Bun](https://bun.sh/)** 1+ (runtime)
- **[SurrealDB](https://surrealdb.com/)** database

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.
