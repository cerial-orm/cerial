---
title: Generated Output
parent: CLI
nav_order: 2
---

# Generated Output

After running `bunx cerial generate`, the output directory contains a complete TypeScript client. This page documents the structure and contents of every generated file.

## Directory Structure

```
db-client/
├── client.ts             # CerialClient class with connect/disconnect/migrate
├── models/
│   ├── user.ts           # User interface + all derived types
│   ├── profile.ts        # Profile interface + all derived types
│   ├── post.ts           # Post interface + all derived types
│   ├── tag.ts            # Tag interface + all derived types
│   ├── address.ts        # Address object interface + types
│   └── index.ts          # Re-exports all model/object types
├── internal/
│   ├── model-registry.ts # Runtime metadata (fields, relations, decorators)
│   ├── migrations.ts     # DEFINE TABLE/FIELD/INDEX statements
│   └── index.ts          # Internal exports
└── index.ts              # Main entry: CerialClient + all types
```

## client.ts

The main client class that manages connections and provides typed model access.

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();

// Connect to SurrealDB
await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});

// Access models through the typed db proxy
const users = await client.db.User.findMany();
const post = await client.db.Post.create({
  data: { title: 'Hello', authorId: users[0].id },
});

// Run migrations explicitly (optional - they run lazily by default)
await client.migrate();

// Disconnect when done
await client.disconnect();
```

The `db` property is a JavaScript Proxy that intercepts property access and routes it to the appropriate query builder. `client.db.User` returns a model accessor with methods like `findOne`, `findMany`, `create`, `updateUnique`, `deleteUnique`, and more.

## models/\*.ts

One file is generated per model and per object defined in your schema.

### Model Types

For each `model` in your schema, the following types are generated:

| Type                       | Description                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `User`                     | Base interface - the shape of a User record returned from queries                     |
| `UserInput`                | Input interface - used internally for raw data handling                               |
| `UserCreate`               | Fields accepted by `create()` - required fields, optional fields, relation connects   |
| `UserNestedCreate`         | Fields for creating records in nested operations                                      |
| `UserUpdate`               | Fields accepted by `update()` - all optional, with set/increment/disconnect operators |
| `UserWhere`                | Filter conditions - field-level operators (`eq`, `gt`, `contains`, etc.)              |
| `UserFindUniqueWhere`      | Unique lookup - by `id` or any `@unique` field                                        |
| `UserSelect`               | Field selection - boolean per field, object sub-selects for embedded objects          |
| `UserInclude`              | Relation inclusion - which relations to load and optional nested select/where/include |
| `UserOrderBy`              | Sort order - `'asc'` or `'desc'` per field                                            |
| `User$Relations`           | Relation metadata type - lists all relation fields and their types                    |
| `GetUserPayload<S, I>`     | Return type resolver - infers the exact return shape from Select and Include options  |
| `GetUserIncludePayload<I>` | Include-only return type resolver                                                     |

**Example model types:**

Given this schema:

```cerial
model User {
  id Record @id
  name String
  email String @unique
  bio String?
  posts Relation[] @field(postIds)
  postIds Record[]
}
```

The generated base interface:

```typescript
export interface User {
  id: CerialId;
  name: string;
  email: string;
  bio?: string | null;
  posts?: Post[];
  postIds: CerialId[];
}
```

The generated create type:

```typescript
export interface UserCreate {
  id?: RecordIdInput;
  name: string;
  email: string;
  bio?: string | null;
  posts?: {
    connect?: RecordIdInput | RecordIdInput[];
  };
}
```

The generated where type:

```typescript
export interface UserWhere {
  AND?: UserWhere[];
  OR?: UserWhere[];
  NOT?: UserWhere;
  id?: RecordIdInput | { eq?: RecordIdInput; not?: RecordIdInput; in?: RecordIdInput[] };
  name?: string | { eq?: string; not?: string; contains?: string; startsWith?: string /* ... */ };
  email?: string | { eq?: string; not?: string; contains?: string /* ... */ };
  bio?: string | null | { eq?: string | null; not?: string | null; isNone?: boolean /* ... */ };
}
```

### Object Types

For each `object` in your schema, a smaller set of types is generated:

| Type             | Description                                       |
| ---------------- | ------------------------------------------------- |
| `Address`        | Base interface - the shape of the embedded object |
| `AddressInput`   | Input interface for creating/updating the object  |
| `AddressWhere`   | Filter conditions for nested object fields        |
| `AddressSelect`  | Sub-field selection for the object                |
| `AddressOrderBy` | Sort order for object fields                      |

Objects do **not** generate: `GetPayload`, `Include`, `Create`, `Update`, `NestedCreate`, `FindUniqueWhere`, or `$Relations` types. This is because objects are embedded inline within models - they are not standalone tables and cannot be queried directly.

**Example object types:**

Given this schema:

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}
```

The generated interface:

```typescript
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode?: string | null;
}
```

The generated select type:

```typescript
export interface AddressSelect {
  street?: boolean;
  city?: boolean;
  state?: boolean;
  zipCode?: boolean;
}
```

## internal/model-registry.ts

The model registry provides runtime metadata used by the query builder to construct correct SurrealQL queries. It contains information about every model, including:

- **Field metadata** - name, type, optionality, whether it's an array
- **Relation metadata** - target model, target table name, direction (forward/reverse), the Record field it references
- **Decorator metadata** - `@id`, `@unique`, `@now`, `@default()` values, `@onDelete()` behavior

The query builder reads this registry to:

- Know which fields are relations vs. scalar fields
- Determine how to join related records
- Apply default values at the correct time
- Cascade deletes through relation chains

```typescript
// The registry is used internally - you don't interact with it directly
// But understanding it helps when debugging query behavior

import { modelRegistry } from './db-client/internal';

const userMeta = modelRegistry.get('User');
// { fields: [...], relations: [...], decorators: [...] }
```

## internal/migrations.ts

Contains the SurrealQL migration statements generated from your schema. These are executed when you call `client.migrate()` or automatically before the first query.

**Example generated migrations:**

```sql
-- Table definitions
DEFINE TABLE user SCHEMAFULL;
DEFINE TABLE post SCHEMAFULL;

-- User fields
DEFINE FIELD name ON TABLE user TYPE string;
DEFINE FIELD email ON TABLE user TYPE string ASSERT string::is::email($value);
DEFINE FIELD bio ON TABLE user TYPE option<string | null>;
DEFINE FIELD isActive ON TABLE user TYPE bool DEFAULT true;
DEFINE FIELD createdAt ON TABLE user TYPE datetime DEFAULT time::now();
DEFINE FIELD postIds ON TABLE user TYPE option<array<record<post>>>;
DEFINE FIELD postIds[*] ON TABLE user TYPE record<post>;

-- User indexes
DEFINE INDEX user_email_unique ON TABLE user FIELDS email UNIQUE;

-- Post fields
DEFINE FIELD title ON TABLE post TYPE string;
DEFINE FIELD content ON TABLE post TYPE option<string | null>;
DEFINE FIELD authorId ON TABLE post TYPE record<user>;
```

Key details about generated migrations:

- `id` fields are **not** included - SurrealDB auto-manages the `id` field
- Optional fields use `option<T | null>` to accept both NONE and null values
- Array fields define both the array type and the element type (`field` + `field[*]`)
- `Record` fields use `record<tablename>` to enforce referential integrity
- `@unique` fields generate a `DEFINE INDEX ... UNIQUE` statement
- `@default()` values are included in the `DEFINE FIELD` statement
- `@now` fields use `DEFAULT time::now()`

## index.ts

The main entry point that re-exports everything you need:

```typescript
// Everything is available from the top-level import
import {
  CerialClient,
  // Model types
  User,
  UserCreate,
  UserUpdate,
  UserWhere,
  UserSelect,
  UserInclude,
  // Object types
  Address,
  AddressWhere,
  AddressSelect,
  // Utility types
  CerialId,
  RecordIdInput,
} from './db-client';
```

This is typically the only import you need in your application code.

## Regenerating

The generated output is meant to be regenerated whenever your schema changes. You should:

1. **Add the output directory to `.gitignore`** if you generate at build time, or **commit it** if you want the types available without a build step
2. **Run generation in CI** to ensure the client is always in sync with the schema
3. **Use watch mode** during development for instant regeneration

```bash
# Regenerate after schema changes
bunx cerial generate

# Or use watch mode during development
bunx cerial generate --watch
```

All existing files in the output directory are overwritten on each generation. Do not manually edit generated files - your changes will be lost.
