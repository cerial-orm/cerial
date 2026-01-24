# Surreal-OM

A Prisma-like ORM for [SurrealDB](https://surrealdb.com/) with schema-driven code generation.

## Features

- **Schema-first approach** - Define your models in `.schema` files
- **Type-safe client** - Generated TypeScript types and interfaces
- **Prisma-like API** - Familiar `db.Model.findMany()` syntax
- **Parameterized queries** - Safe from SQL injection
- **Full CRUD support** - findOne, findMany, create, update, delete
- **Advanced filtering** - Comparison, string, array, and logical operators

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
}

model Post {
  id String @id
  title String
  content String?
  published Bool @default(false)
  authorId String
  createdAt Date @now
}
```

### 2. Generate the Client

```bash
bunx surreal-om generate -s ./schemas -o ./db-client
```

### 3. Use the Client

```typescript
import { $connect, db } from './db-client';

// Connect to SurrealDB
await $connect({
  url: 'http://localhost:8000',
  namespace: 'test',
  database: 'test',
  auth: { username: 'root', password: 'root' },
});

// Create a user
const user = await db.User.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    isActive: true,
  },
});

// Find users
const users = await db.User.findMany({
  where: {
    isActive: { eq: true },
    age: { gte: 18 },
  },
  limit: 10,
});

// Find one user
const user = await db.User.findOne({
  where: { email: { eq: 'john@example.com' } },
});

// Update a user
await db.User.update({
  where: { id: { eq: user.id } },
  data: { name: 'John Smith' },
});

// Delete a user
await db.User.delete({
  where: { id: { eq: user.id } },
});
```

## Schema Definition Language

### Format

```
model ModelName {
  fieldName Type @decorator1 @decorator2
  fieldName Type?  // optional field
}
```

- **Field name first** - lowercase or camelCase identifier
- **Type** - one of the supported types (UpperFirst)
- **Optional** - add `?` after the type for optional fields
- **Decorators** - add after the type

### Types

| Type | Description | TypeScript | SurrealDB |
|------|-------------|------------|-----------|
| `String` | Text string | `string` | `string` |
| `Email` | Email address | `string` | `string` |
| `Int` | Integer number | `number` | `int` |
| `Float` | Floating point | `number` | `float` |
| `Bool` | Boolean | `boolean` | `bool` |
| `Date` | Date/DateTime | `Date` | `datetime` |

### Decorators

| Decorator | Description | Notes |
|-----------|-------------|-------|
| `@id` | SurrealDB record id | **Only ONE per model** |
| `@unique` | Unique constraint | Can be on multiple fields |
| `@now` | Auto-set timestamp | For Date fields on create |
| `@default(value)` | Default value | Literal value |

### Example Schema

```schema
model User {
  id String @id
  email Email @unique
  name String
  bio String?
  age Int?
  score Float?
  isActive Bool @default(true)
  createdAt Date @now
  updatedAt Date @now
}
```

## Query API

### findOne

Find a single record matching the criteria.

```typescript
const user = await db.User.findOne({
  where: { id: { eq: '123' } },
  select: { id: true, name: true, email: true },
});
```

### findMany

Find multiple records with filtering, ordering, and pagination.

```typescript
const users = await db.User.findMany({
  where: {
    isActive: { eq: true },
    age: { gte: 18, lt: 65 },
  },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
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
  },
});
```

### update

Update existing records.

```typescript
await db.User.update({
  where: { id: { eq: '123' } },
  data: { name: 'Updated Name' },
});
```

### delete

Delete records.

```typescript
await db.User.delete({
  where: { id: { eq: '123' } },
});
```

## Filter Operators

### Comparison Operators

```typescript
// Equals
{ field: { eq: value } }

// Not equals
{ field: { neq: value } }

// Greater than
{ field: { gt: value } }

// Greater than or equal
{ field: { gte: value } }

// Less than
{ field: { lt: value } }

// Less than or equal
{ field: { lte: value } }
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

### Array Operators

```typescript
// In array
{ status: { in: ['active', 'pending'] } }

// Not in array
{ status: { notIn: ['deleted', 'banned'] } }
```

### Logical Operators

```typescript
// AND (all conditions must match)
{
  AND: [
    { age: { gte: 18 } },
    { isActive: { eq: true } }
  ]
}

// OR (any condition must match)
{
  OR: [
    { role: { eq: 'admin' } },
    { role: { eq: 'moderator' } }
  ]
}

// NOT (negate condition)
{
  NOT: { status: { eq: 'deleted' } }
}
```

### Special Operators

```typescript
// Is null
{ deletedAt: { isNull: true } }

// Is defined (not null)
{ email: { isDefined: true } }

// Between (inclusive)
{ age: { between: [18, 65] } }
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
├── models/
│   ├── user.ts          # User interface & types
│   ├── post.ts          # Post interface & types
│   └── index.ts         # Model exports
├── internal/
│   ├── model-registry.ts  # Model metadata
│   └── index.ts
└── index.ts              # Main client with $connect()
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bunx tsc --noEmit

# Generate from example schema
bun run generate
```

## Requirements

- [Bun](https://bun.sh/) runtime
- [SurrealDB](https://surrealdb.com/) database

## License

MIT
