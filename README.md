# Cerial

A SurrealDB ORM for [SurrealDB](https://surrealdb.com/) with schema-driven code generation and full TypeScript type safety.

## Features

- **Schema-first approach** - Define your models in `.cerial` files
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
bun add cerial
```

## Quick Start

### 1. Define Your Schema

Create a `.cerial` file (e.g., `schemas/user.cerial`):

```cerial
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
bunx cerial generate -s ./schemas -o ./db-client
```

### 3. Use the Client

```typescript
import { CerialClient } from './db-client';

// Create client instance
const client = new CerialClient();

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

| Type       | Description      | TypeScript | SurrealDB  |
| ---------- | ---------------- | ---------- | ---------- |
| `String`   | Text string      | `string`   | `string`   |
| `Email`    | Email address    | `string`   | `string`   |
| `Int`      | Integer number   | `number`   | `int`      |
| `Float`    | Floating point   | `number`   | `float`    |
| `Bool`     | Boolean          | `boolean`  | `bool`     |
| `Date`     | Date/DateTime    | `Date`     | `datetime` |
| `Record`   | Record reference | `string`   | `record`   |
| `Relation` | Virtual relation | N/A        | Virtual    |

### Array Types

All types except `Relation` can be arrays:

```cerial
model Example {
  nicknames String[]    // string array
  scores Int[]          // number array
  loginDates Date[]     // Date array
  tagIds Record[]       // record reference array
}
```

### Decorators

| Decorator         | Description          | Notes                     |
| ----------------- | -------------------- | ------------------------- |
| `@id`             | SurrealDB record id  | **Only ONE per model**    |
| `@unique`         | Unique constraint    | Can be on multiple fields |
| `@now`            | Auto-set timestamp   | For Date fields on create |
| `@default(value)` | Default value        | Literal value             |
| `@field(name)`    | Forward relation ref | For Relation fields       |
| `@model(Model)`   | Relation target      | For Relation fields       |
| `@onDelete(action)` | Delete behavior    | For optional Relation only |
| `@key(name)`      | Relation key         | For disambiguation        |

### @onDelete Decorator

Controls what happens when a related record is deleted. Only allowed on **optional** (`Relation?`) fields.

```cerial
model Profile {
  id String @id
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Cascade)
}
```

| Action     | Behavior |
|------------|----------|
| `Cascade`  | Delete this record when related record is deleted |
| `SetNull`  | Set FK to null (default for optional relations) |
| `Restrict` | Error if trying to delete related record |
| `NoAction` | Do nothing (leaves dangling reference) |

**Rules**:
- **Required relations** (`Relation`): Auto-cascade on delete, `@onDelete` NOT allowed
- **Optional relations** (`Relation?`): Default `SetNull`, can override with `@onDelete`
- **Array relations** (`Relation[]`): Auto cleanup - removes ID from arrays

### @key Decorator

Required for disambiguation when multiple relations exist between the same models, or for self-referential relations with reverse lookup.

```cerial
# Multiple relations to same model
model Document {
  id String @id
  authorId Record
  author Relation @field(authorId) @model(Writer) @key(author)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(Writer) @key(reviewer)
}

model Writer {
  id String @id
  authoredDocs Relation[] @model(Document) @key(author)    # Pairs with author
  reviewedDocs Relation[] @model(Document) @key(reviewer)  # Pairs with reviewer
}
```

### Relations

Relations are defined using `Relation` fields with `@field` and `@model` decorators.

#### Relation Types

| Type | Schema Pattern | Description |
|------|---------------|-------------|
| **1-to-1** | `Record` + `Relation @field` | One record links to one other |
| **1-to-n** | `Record` + `Relation @field` / `Relation[]` | One record links to many |
| **n-to-n** | `Record[]` + `Relation[] @field` on both sides | Many-to-many with bidirectional sync |

#### One-to-One (1-1)

```cerial
model User {
  id String @id
  name String
  profile Relation @model(Profile)                 # Reverse relation (optional to define)
}

model Profile {
  id String @id
  bio String?
  userId Record                                    # FK storage (required)
  user Relation @field(userId) @model(User)        # Forward relation (PK side)
}
```

#### One-to-Many (1-n)

```cerial
model User {
  id String @id
  name String
  posts Relation[] @model(Post)                    # Reverse relation (array)
}

model Post {
  id String @id
  title String
  authorId Record                                  # FK storage
  author Relation @field(authorId) @model(User)    # Forward relation
}
```

#### Many-to-Many (n-n)

```cerial
model User {
  id String @id
  name String
  tagIds Record[]                                  # FK storage (array)
  tags Relation[] @field(tagIds) @model(Tag)       # Forward relation (array)
}

model Tag {
  id String @id
  name String @unique
  userIds Record[]                                 # FK storage (array)
  users Relation[] @field(userIds) @model(User)    # Forward relation (array)
}
```

**Note**: True n-n requires BOTH sides to define `Record[]` + `Relation[]`. This enables bidirectional sync - when you connect a User to a Tag, both `User.tagIds` and `Tag.userIds` are updated atomically.

#### Self-Referential Relations

```cerial
# Tree structure (1-n self-reference)
model Category {
  id String @id
  name String
  parentId Record?
  parent Relation? @field(parentId) @model(Category) @key(hierarchy)
  children Relation[] @model(Category) @key(hierarchy)
}

# Following pattern (single-sided n-n)
model SocialUser {
  id String @id
  name String
  followingIds Record[]
  following Relation[] @field(followingIds) @model(SocialUser)
  # No followers Relation[] - query manually: WHERE followingIds CONTAINS $myId
}
```

#### Relation Sides

| Side | Structure | Features |
|------|-----------|----------|
| **PK Side** | `Record + Relation @field` | Stores FK, full CRUD support |
| **Non-PK Side** | `Relation @model` (no @field) | Reverse lookup only, OPTIONAL to define |

**Forward relations** (PK side) have a storage field (`@field`) that stores the record ID.
**Reverse relations** (non-PK side) don't have a storage field and query the related table.

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
  },
  select: { id: true, email: true },
});
```

#### Nested Create Operations

Create related records inline or connect to existing ones:

```typescript
// Create with nested create - creates related record
const post = await db.Post.create({
  data: {
    title: 'My Post',
    author: { create: { name: 'John', email: 'john@example.com' } },
  },
});

// Create with connect - link to existing record
const post = await db.Post.create({
  data: {
    title: 'My Post',
    author: { connect: 'user:123' },
  },
});

// Create from non-PK side (creates children with FK pointing to new parent)
const user = await db.User.create({
  data: {
    name: 'John',
    posts: { create: [{ title: 'Post 1' }, { title: 'Post 2' }] },
  },
});

// n-n with bidirectional sync - both sides updated atomically
const user = await db.User.create({
  data: {
    name: 'John',
    tags: { connect: ['tag:js', 'tag:ts'] },
  },
});
// Result: User.tagIds = ['tag:js', 'tag:ts']
//         Tag:js.userIds += newUserId
//         Tag:ts.userIds += newUserId
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

#### Nested Update Operations

Modify relations with connect/disconnect:

```typescript
// Change relation target
await db.Post.update({
  where: { id: 'post:1' },
  data: { author: { connect: 'user:456' } },
});

// Disconnect (set null) - only for optional relations
await db.Post.update({
  where: { id: 'post:1' },
  data: { author: { disconnect: true } },
});

// n-n: add and remove with bidirectional sync
await db.User.update({
  where: { id: 'user:1' },
  data: {
    tags: {
      connect: ['tag:new'],     // Adds to both User.tagIds and Tag.userIds
      disconnect: ['tag:old'],  // Removes from both sides
    },
  },
});

// Create nested on update
await db.User.update({
  where: { id: 'user:1' },
  data: {
    profile: { create: { bio: 'New profile' } },
  },
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
{
  field: value;
}

// Equals (explicit)
{
  field: {
    eq: value;
  }
}

// Not equals
{
  field: {
    neq: value;
  }
}

// Greater than / Greater than or equal
{
  age: {
    gt: 18;
  }
}
{
  age: {
    gte: 18;
  }
}

// Less than / Less than or equal
{
  age: {
    lt: 65;
  }
}
{
  age: {
    lte: 65;
  }
}
```

### String Operators

```typescript
// Contains substring
{
  name: {
    contains: 'john';
  }
}

// Starts with
{
  name: {
    startsWith: 'J';
  }
}

// Ends with
{
  email: {
    endsWith: '@example.com';
  }
}
```

### Array Operators (for querying arrays)

```typescript
// Contains element
{
  nicknames: {
    has: 'John';
  }
}

// Contains all elements
{
  nicknames: {
    hasAll: ['John', 'Johnny'];
  }
}

// Contains any element
{
  nicknames: {
    hasAny: ['John', 'Jane'];
  }
}

// Is empty
{
  nicknames: {
    isEmpty: true;
  }
}
{
  nicknames: {
    isEmpty: false;
  }
}
```

### Array Operators (for updating arrays)

```typescript
// Push element(s)
{
  nicknames: {
    push: 'NewNick';
  }
}
{
  nicknames: {
    push: ['Nick1', 'Nick2'];
  }
}

// Remove element(s)
{
  scores: {
    unset: 100;
  }
}
{
  scores: {
    unset: [100, 95];
  }
}

// Replace entire array
{
  nicknames: ['New', 'Array'];
}
```

### Logical Operators

```typescript
// AND (all conditions must match)
{
  AND: [{ age: { gte: 18 } }, { isActive: true }];
}

// OR (any condition must match)
{
  OR: [{ role: 'admin' }, { role: 'moderator' }];
}

// NOT (negate condition)
{
  NOT: {
    status: 'deleted';
  }
}
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
bunx cerial generate -s <schema-path> -o <output-path>

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
├── client.ts             # CerialClient class
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
