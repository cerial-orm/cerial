---
title: Migrations
parent: Connection
nav_order: 2
---

# Migrations

Cerial automatically generates migration statements from your schema and runs them against SurrealDB. Migrations ensure your database schema matches your `.cerial` definitions.

## What Migrations Do

Migrations execute SurrealQL statements that define the structure of your database:

- **`DEFINE TABLE`** - Creates tables with `SCHEMAFULL` enforcement (only defined fields are allowed)
- **`DEFINE FIELD`** - Defines fields with types, defaults, and assertions
- **`DEFINE INDEX`** - Creates indexes for `@unique` fields

These statements are idempotent - running them multiple times has the same effect as running them once. SurrealDB's `DEFINE` statements create or replace definitions, so migrations are safe to re-run.

## Lazy Migration (Default)

By default, migrations run automatically before the first query. You don't need to call anything - just connect and start querying:

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();

await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});

// First query triggers automatic migration
const users = await client.db.User.findMany();
// ^ Migrations ran before this query executed
```

This is convenient for development and simple applications. The first query will take slightly longer due to the migration overhead, but subsequent queries run at full speed.

## Explicit Migration

If you want to control exactly when migrations run, call `migrate()` directly:

```typescript
const client = new CerialClient();

await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});

// Run migrations explicitly
await client.migrate();

// Now query - no migration overhead on first query
const users = await client.db.User.findMany();
```

Explicit migration is useful when:

- You want predictable startup timing (e.g., health checks that pass only after migration)
- You're running migrations as a separate step in a deployment pipeline
- You want to catch migration errors early, before any queries run

## Migration Status

Migration status is tracked per connection. Once migrations have run (either lazily or explicitly), they won't run again for that connection:

```typescript
await client.connect({ ... });

// First call: runs migrations
await client.migrate();

// Second call: no-op, migrations already ran
await client.migrate();

// Queries: no migration overhead
await client.db.User.findMany();
await client.db.Post.findMany();
```

If you disconnect and reconnect, migrations will run again on the next query or `migrate()` call.

## Generated Migration Statements

The migration generator produces SurrealQL statements based on your schema. Here's what gets generated for different schema constructs:

### Table Definitions

Every `model` in your schema generates a `DEFINE TABLE` statement:

```sql
DEFINE TABLE user SCHEMAFULL;
DEFINE TABLE post SCHEMAFULL;
DEFINE TABLE tag SCHEMAFULL;
```

The `SCHEMAFULL` option means SurrealDB will reject any fields not explicitly defined. This provides strict schema enforcement.

### Field Definitions

Each field generates a `DEFINE FIELD` statement with the appropriate SurrealQL type:

```sql
-- String field (required)
DEFINE FIELD name ON TABLE user TYPE string;

-- Optional field (accepts NONE and null)
DEFINE FIELD bio ON TABLE user TYPE option<string | null>;

-- Boolean with default
DEFINE FIELD isActive ON TABLE user TYPE bool DEFAULT true;

-- DateTime with @createdAt (set on creation when absent)
DEFINE FIELD createdAt ON TABLE user TYPE datetime DEFAULT time::now();

-- DateTime with @updatedAt (set on creation and re-set on every update)
DEFINE FIELD updatedAt ON TABLE user TYPE datetime DEFAULT ALWAYS time::now();

-- DateTime with @now (computed, not stored)
DEFINE FIELD currentTime ON TABLE user TYPE datetime COMPUTED time::now();

-- Integer field
DEFINE FIELD age ON TABLE user TYPE option<int | null>;

-- Float field
DEFINE FIELD score ON TABLE user TYPE option<float | null>;
```

### Record Fields

`Record` fields generate `record<tablename>` types that enforce referential integrity at the database level:

```sql
-- Required record reference
DEFINE FIELD authorId ON TABLE post TYPE record<user>;

-- Optional record reference
DEFINE FIELD reviewerId ON TABLE post TYPE option<record<user>>;

-- Array of record references
DEFINE FIELD tagIds ON TABLE post TYPE option<array<record<tag>>>;
DEFINE FIELD tagIds[*] ON TABLE post TYPE record<tag>;
```

Array fields generate two statements: one for the array itself and one for the array elements (`field[*]`).

### Embedded Object Fields

Object fields generate nested `DEFINE FIELD` statements:

```sql
-- Object field
DEFINE FIELD address ON TABLE user TYPE object;
DEFINE FIELD address.street ON TABLE user TYPE string;
DEFINE FIELD address.city ON TABLE user TYPE string;
DEFINE FIELD address.state ON TABLE user TYPE string;
DEFINE FIELD address.zipCode ON TABLE user TYPE option<string | null>;

-- Optional object field
DEFINE FIELD shipping ON TABLE user TYPE option<object>;
DEFINE FIELD shipping.street ON TABLE user TYPE string;
DEFINE FIELD shipping.city ON TABLE user TYPE string;

-- Array of objects
DEFINE FIELD locations ON TABLE user TYPE option<array<object>>;
DEFINE FIELD locations[*] ON TABLE user TYPE object;
DEFINE FIELD locations[*].lat ON TABLE user TYPE float;
DEFINE FIELD locations[*].lng ON TABLE user TYPE float;
```

### Index Definitions

Fields with the `@unique` decorator generate unique index statements:

```sql
DEFINE INDEX user_email_unique ON TABLE user FIELDS email UNIQUE;
DEFINE INDEX tag_name_unique ON TABLE tag FIELDS name UNIQUE;
```

### ID Fields

The `id` field with `@id` decorator is **not** included in migrations. SurrealDB automatically manages the `id` field for every table.

## Complete Example

Given this schema:

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}

model User {
  id Record @id
  name String
  email String @unique
  bio String?
  age Int?
  isActive Bool @default(true)
  createdAt Date @createdAt
  address Address
  posts Relation[] @field(postIds)
  postIds Record[]
}

model Post {
  id Record @id
  title String
  content String?
  publishedAt Date?
  author Relation @field(authorId)
  authorId Record
}
```

The generated migrations:

```sql
-- User table
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD name ON TABLE user TYPE string;
DEFINE FIELD email ON TABLE user TYPE string;
DEFINE FIELD bio ON TABLE user TYPE option<string | null>;
DEFINE FIELD age ON TABLE user TYPE option<int | null>;
DEFINE FIELD isActive ON TABLE user TYPE bool DEFAULT true;
DEFINE FIELD createdAt ON TABLE user TYPE datetime DEFAULT time::now();
DEFINE FIELD address ON TABLE user TYPE object;
DEFINE FIELD address.street ON TABLE user TYPE string;
DEFINE FIELD address.city ON TABLE user TYPE string;
DEFINE FIELD address.state ON TABLE user TYPE string;
DEFINE FIELD address.zipCode ON TABLE user TYPE option<string | null>;
DEFINE FIELD postIds ON TABLE user TYPE option<array<record<post>>>;
DEFINE FIELD postIds[*] ON TABLE user TYPE record<post>;
DEFINE INDEX user_email_unique ON TABLE user FIELDS email UNIQUE;

-- Post table
DEFINE TABLE post SCHEMAFULL;
DEFINE FIELD title ON TABLE post TYPE string;
DEFINE FIELD content ON TABLE post TYPE option<string | null>;
DEFINE FIELD publishedAt ON TABLE post TYPE option<datetime | null>;
DEFINE FIELD authorId ON TABLE post TYPE record<user>;
```

## Schema Changes

When you modify your schema and regenerate the client, the migration statements are regenerated. Since SurrealDB's `DEFINE` statements are idempotent (create-or-replace), re-running migrations applies the new schema.

**Adding a field:**

```cerial
model User {
  // ...existing fields...
  phone String?   // ← New field
}
```

Regenerate and the new `DEFINE FIELD phone ON TABLE user TYPE option<string | null>` statement is included. Existing records will have `NONE` for the new field until updated.

**Removing a field:**

Removing a field from the schema removes its `DEFINE FIELD` statement from the generated migrations. However, this does **not** drop the field from existing records in SurrealDB. The field will remain in existing records but won't be defined in the schema. With `SCHEMAFULL` tables, the undefined field won't be returned in queries.

**Changing a field type:**

Changing a field type regenerates the `DEFINE FIELD` with the new type. SurrealDB will enforce the new type on future writes, but existing data with the old type may cause runtime errors until updated.
