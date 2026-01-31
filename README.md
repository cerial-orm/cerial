# Surreal-OM

A Prisma-like ORM for [SurrealDB](https://surrealdb.com/) with schema-driven code generation and full TypeScript type safety.

## Features

- **Schema-first approach** - Define your models in `.schema` files
- **Type-safe client** - Generated TypeScript types and interfaces
- **Prisma-like API** - Familiar `db.Model.findMany()` syntax
- **Dynamic return types** - Full Prisma-style type inference with `select` and `include`
- **Relations** - Forward and reverse relations with type-safe includes
- **Array support** - String[], Int[], Date[], Record[] with operators
- **Parameterized queries** - Safe from SQL injection
- **Full CRUD support** - findOne, findMany, findUnique, create, updateMany, deleteMany
- **Advanced filtering** - Comparison, string, array, logical, and nested operators

## Installation

```bash
bun add @org/lib_backend_surreal-om
```

## Quick Start

### 1. Define Your Schema

Create a `.schema` file (e.g., `schemas/user.schema`):

```schema
model User {
  id String @id
  email Email @unique
  name String
  age Int?
  isActive Bool
  createdAt Date @now
  profileId Record?
  profile Relation @field(profileId) @model(Profile)
  tagIds Record[]
  tags Relation @field(tagIds) @model(Tag)
  posts Relation @model(Post)
  nicknames String[]
}

model Profile {
  id String @id
  bio String?
  userId Record
  user Relation @field(userId) @model(User)
}

model Post {
  id String @id
  title String
  content String?
  authorId Record
  author Relation @field(authorId) @model(User)
  createdAt Date @now
}

model Tag {
  id String @id
  name String @unique
}
```

### 2. Generate the Client

```bash
bunx surreal-om generate -s ./schemas -o ./db-client
```

### 3. Use the Client

```typescript
import { SurrealClient } from './db-client';

// Create client instance
const client = new SurrealClient();

// Connect to SurrealDB
await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});

// Create a user
const user = await client.db.User.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    isActive: true,
    nicknames: ['Johnny', 'JD'],
  },
});

// Find users with select (type-safe - only selected fields accessible)
const users = await client.db.User.findMany({
  where: { isActive: true },
  select: { id: true, name: true, email: true },
  limit: 10,
});
// users: { id: string; name: string; email: string }[]

// Find with include (type-safe - includes related models)
const userWithProfile = await client.db.User.findOne({
  where: { id: user.id },
  include: {
    profile: true,
    posts: { limit: 5, orderBy: { createdAt: 'desc' } },
  },
});
// userWithProfile: User & { profile: Profile; posts: Post[] }

// Update with array operations
await client.db.User.updateMany({
  where: { id: user.id },
  data: {
    nicknames: { push: 'John' }, // Add to array
  },
});

// Disconnect when done
await client.disconnect();
```

## Schema Definition Language

### Format

```
model ModelName {
  fieldName Type @decorator1 @decorator2
  fieldName Type?  // optional field
  fieldName Type[] // array field
}
```

- **Field name first** - lowercase or camelCase identifier
- **Type** - one of the supported types (UpperFirst)
- **Optional** - add `?` after the type for optional fields
- **Array** - add `[]` after the type for array fields
- **Decorators** - add after the type

### Types

| Type       | Description         | TypeScript | SurrealDB  |
| ---------- | ------------------- | ---------- | ---------- |
| `String`   | Text string         | `string`   | `string`   |
| `Email`    | Email address       | `string`   | `string`   |
| `Int`      | Integer number      | `number`   | `int`      |
| `Float`    | Floating point      | `number`   | `float`    |
| `Bool`     | Boolean             | `boolean`  | `bool`     |
| `Date`     | Date/DateTime       | `Date`     | `datetime` |
| `Record`   | Record reference    | `string`   | `record`   |
| `Relation` | Virtual relation    | N/A        | Virtual    |

### Array Types

All types except `Relation` can be arrays:

```schema
model Example {
  nicknames String[]    // string array
  scores Int[]          // number array
  loginDates Date[]     // Date array
  tagIds Record[]       // record reference array
}
```

### Decorators

| Decorator         | Description          | Notes                              |
| ----------------- | -------------------- | ---------------------------------- |
| `@id`             | SurrealDB record id  | **Only ONE per model**             |
| `@unique`         | Unique constraint    | Can be on multiple fields          |
| `@now`            | Auto-set timestamp   | For Date fields on create          |
| `@default(value)` | Default value        | Literal value                      |
| `@field(name)`    | Forward relation ref | For Relation fields                |
| `@model(Model)`   | Relation target      | For Relation fields                |

### Relations

Relations are defined using `Relation` fields with `@field` and `@model` decorators:

```schema
model User {
  profileId Record?                                  // Storage field (optional)
  profile Relation @field(profileId) @model(Profile) // Forward relation
  posts Relation @model(Post)                        // Reverse relation (no @field)
}

model Profile {
  userId Record                                   // Storage field (required)
  user Relation @field(userId) @model(User)       // Forward relation
}

model Post {
  authorId Record                                 // Storage field
  author Relation @field(authorId) @model(User)   // Forward relation
}
```

**Forward relations** have a storage field (`@field`) that stores the record ID.
**Reverse relations** don't have a storage field and query the related table.

## Query API

### Dynamic Return Types

The client provides **full Prisma-style type inference** based on `select` and `include`:

```typescript
// No select/include - returns full model
const user = await db.User.findOne({ where: { id: '123' } });
// user: User | null

// With select - returns only selected fields
const user = await db.User.findOne({
  where: { id: '123' },
  select: { id: true, name: true },
});
// user: { id: string; name: string } | null

// With include - returns model + relations
const user = await db.User.findOne({
  where: { id: '123' },
  include: { profile: true, posts: true },
});
// user: User & { profile: Profile; posts: Post[] } | null

// Combined select + include - returns selected fields + relations
const user = await db.User.findOne({
  where: { id: '123' },
  select: { id: true, email: true },
  include: { profile: true },
});
// user: { id: string; email: string } & { profile: Profile } | null
```

### findOne

Find a single record matching the criteria.

```typescript
const user = await db.User.findOne({
  where: { email: 'john@example.com' },
  select: { id: true, name: true, email: true },
  include: {
    profile: true,
    posts: { limit: 5 },
  },
});
```

### findMany

Find multiple records with filtering, ordering, and pagination.

```typescript
const users = await db.User.findMany({
  where: {
    isActive: true,
    age: { gte: 18, lt: 65 },
  },
  select: { id: true, name: true },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
  include: {
    profile: { select: { bio: true } },
  },
});
```

### findUnique

Find a single record by unique field (id or @unique fields).

```typescript
const user = await db.User.findUnique({
  where: { email: 'john@example.com' },
  include: { profile: true },
});
```

### create

Create a new record.

```typescript
const user = await db.User.create({
  data: {
    email: 'jane@example.com',
    name: 'Jane Doe',
    isActive: true,
    nicknames: ['Jane'],
    tagIds: ['tag:js', 'tag:ts'],
  },
  select: { id: true, email: true },
});
```

### updateMany

Update multiple records matching where clause.

```typescript
await db.User.updateMany({
  where: { isActive: false },
  data: {
    isActive: true,
    nicknames: { push: 'Updated' }, // Array operations
  },
  select: { id: true, isActive: true },
});
```

### deleteMany

Delete multiple records matching where clause.

```typescript
const count = await db.User.deleteMany({
  where: { isActive: false },
});
// count: number (number of deleted records)
```

### count

Count records matching where clause.

```typescript
const activeUsers = await db.User.count({ isActive: true });
```

### exists

Check if any records match the where clause.

```typescript
const hasAdmin = await db.User.exists({ role: 'admin' });
```

## Filter Operators

### Comparison Operators

```typescript
// Equals (shorthand)
{ field: value }

// Equals (explicit)
{ field: { eq: value } }

// Not equals
{ field: { neq: value } }

// Greater than / Greater than or equal
{ age: { gt: 18 } }
{ age: { gte: 18 } }

// Less than / Less than or equal
{ age: { lt: 65 } }
{ age: { lte: 65 } }
```

### String Operators

```typescript
// Contains substring
{ name: { contains: 'john' } }

// Starts with
{ name: { startsWith: 'J' } }

// Ends with
{ email: { endsWith: '@example.com' } }
```

### Array Operators (for querying arrays)

```typescript
// Contains element
{ nicknames: { has: 'John' } }

// Contains all elements
{ nicknames: { hasAll: ['John', 'Johnny'] } }

// Contains any element
{ nicknames: { hasAny: ['John', 'Jane'] } }

// Is empty
{ nicknames: { isEmpty: true } }
{ nicknames: { isEmpty: false } }
```

### Array Operators (for updating arrays)

```typescript
// Push element(s)
{ nicknames: { push: 'NewNick' } }
{ nicknames: { push: ['Nick1', 'Nick2'] } }

// Remove element(s)
{ scores: { unset: 100 } }
{ scores: { unset: [100, 95] } }

// Replace entire array
{ nicknames: ['New', 'Array'] }
```

### Logical Operators

```typescript
// AND (all conditions must match)
{ AND: [{ age: { gte: 18 } }, { isActive: true }] }

// OR (any condition must match)
{ OR: [{ role: 'admin' }, { role: 'moderator' }] }

// NOT (negate condition)
{ NOT: { status: 'deleted' } }
```

### Nested Relation Filtering

Filter by related model fields:

```typescript
// Find users with specific profile bio
await db.User.findMany({
  where: {
    profile: { bio: { contains: 'developer' } },
  },
});

// Complex nested filtering
await db.User.findMany({
  where: {
    posts: {
      title: { contains: 'TypeScript' },
      createdAt: { gte: new Date('2024-01-01') },
    },
  },
});
```

### Special Operators

```typescript
// Is null
{ deletedAt: { isNull: true } }

// Between (inclusive)
{ age: { between: [18, 65] } }

// In array
{ status: { in: ['active', 'pending'] } }

// Not in array
{ status: { notIn: ['deleted', 'banned'] } }
```

## Include Options

Include related records with additional options:

```typescript
await db.User.findOne({
  where: { id: '123' },
  include: {
    // Include as boolean (all fields)
    profile: true,

    // Include with select (only specific fields)
    profile: {
      select: { bio: true },
    },

    // Include with filters (array/reverse relations)
    posts: {
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      limit: 10,
      offset: 0,
    },

    // Nested includes
    posts: {
      include: {
        author: { select: { name: true } },
      },
    },
  },
});
```

## CLI Usage

```bash
# Generate client from schema files
bunx surreal-om generate -s <schema-path> -o <output-path>

# Options:
#   -s, --schema <path>   Path to schema file or directory (default: ./schemas)
#   -o, --output <path>   Output directory for generated client (default: ./db-client)
#   -w, --watch           Watch for schema changes
#   -v, --verbose         Verbose output
#   -h, --help            Show help
```

## Generated Structure

```
db-client/
├── client.ts             # SurrealClient class
├── models/
│   ├── user.ts           # User interface, types, and payload types
│   ├── post.ts           # Post interface, types, and payload types
│   └── index.ts          # Model exports
├── internal/
│   ├── model-registry.ts # Model metadata
│   ├── migrations.ts     # DEFINE TABLE/FIELD statements
│   └── index.ts
└── index.ts              # Main exports
```

### Generated Types Per Model

For each model, the generator creates:

- `User` - Base interface
- `UserCreate` - Type for create data
- `UserUpdate` - Type for update data (with array operations)
- `UserWhere` - Type for where clauses
- `UserSelect` - Type for field selection
- `UserInclude` - Type for relation includes
- `UserOrderBy` - Type for ordering
- `User$Relations` - Relation metadata
- `GetUserPayload<S, I>` - Dynamic return type based on select/include
- `GetUserIncludePayload<I>` - Helper for include type resolution

## Testing

### Unit Tests

```bash
# Run all tests
bun test

# Run specific test suite
bun test tests/generators/
bun test tests/parser/
bun test tests/query/
```

### Type Checks

The library uses [ts-toolbelt](https://millsp.github.io/ts-toolbelt/) for compile-time type verification of generated types. Type checks are in `tests/e2e/typechecks/*.check.ts` files and verified with `tsc --noEmit` (not executed at runtime).

```bash
# Run type checks
bun run typecheck
```

This verifies that generated types (User, UserCreate, GetUserPayload, etc.) have correct structure and type inference works as expected.

### E2E Tests

E2E tests simulate the real user experience: schema → generate → use.

```bash
# Run e2e tests (requires SurrealDB running)
bun test tests/e2e/ --preload ./tests/e2e/preload.ts
```

Start SurrealDB for testing:

```bash
surreal start -u root -p root memory
```

E2E test structure:
```
tests/e2e/
├── schemas/              # Test schemas
├── generated/            # Generated at runtime (gitignored)
├── typechecks/           # Compile-time type verification (ts-toolbelt)
│   ├── generated-types.check.ts   # Model type checks
│   ├── payload-inference.check.ts # GetPayload inference checks
│   └── tsconfig.json
├── preload.ts            # Runs generate before tests
├── setup.ts              # Setup logic
├── test-client.ts        # Test helpers
├── crud.test.ts          # CRUD operations
├── arrays.test.ts        # Array operations
├── relations.test.ts     # Relations
├── select.test.ts        # Select functionality
├── include.test.ts       # Include functionality
└── type-inference.test.ts # Runtime client tests
```

## Development

```bash
# Install dependencies
bun install

# Run all tests
bun test

# Run e2e tests
bun test tests/e2e/ --preload ./tests/e2e/preload.ts

# Type check (verifies generated types)
bun run typecheck

# Full TypeScript check
bunx tsc --noEmit

# Generate test types
bun run generate:test
```

## Requirements

- [Bun](https://bun.sh/) runtime
- [SurrealDB](https://surrealdb.com/) database

## License

MIT
