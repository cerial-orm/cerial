# Cerial

A Prisma-like ORM for SurrealDB with schema-driven code generation and full TypeScript type safety.

## Commands

```bash
# Install dependencies
bun install

# Run all tests (unit + integration + e2e)
bun test

# Run e2e tests (requires SurrealDB running)
bun test tests/e2e/ --preload ./tests/e2e/preload.ts

# Type check generated types
bun run typecheck

# Full TypeScript check
bunx tsc --noEmit

# Generate test client from schema
bun run generate:test
```

## Architecture

```
Schema (.cerial files) → Parser (AST) → Generators → TypeScript Client
```

**Core modules:**

- `src/parser/` - Parses `.cerial` files into AST
- `src/generators/` - Generates TypeScript types, client, migrations
- `src/query/` - Query builder with parameterized SurrealQL
- `src/client/` - Runtime client with Model proxy

**Generated output structure:**

```
db-client/
├── client.ts           # CerialClient class
├── models/*.ts         # Interfaces + Create/Update/Where/Select/Include types
├── internal/
│   ├── model-registry.ts
│   └── migrations.ts
└── index.ts
```

## Testing

**E2E tests require SurrealDB already running.** User must start SurrealDB manually before running tests:

- **URL**: `http://127.0.0.1:8000`
- **Credentials**: `root` / `root`
- **Namespace**: `main`
- **Database**: `main`

**IMPORTANT**: Do NOT run `surreal start` commands - the instance should already be running. All tests use the same SurrealDB config above.

E2E tests use `--preload ./tests/e2e/preload.ts` which generates the client before tests run. The generated client lives in `tests/e2e/generated/` (gitignored).

**Type checks** use ts-toolbelt for compile-time verification in `tests/e2e/typechecks/*.check.ts`.

**Test locations:**

- `tests/unit/` - Unit tests (no DB required)
- `tests/e2e/relations/` - E2E relation tests (94 files)
- `tests/e2e/typechecks/` - Compile-time type verification (9 files)

**When query format changes**, update test expectations in:

- `tests/unit/query/nested-builder.test.ts` - Nested create/connect/disconnect queries
- `tests/unit/query/delete-builder.test.ts` - Cascade delete queries
- `tests/unit/query/delete-unique-builder.test.ts` - DeleteUnique query builder
- `tests/unit/query/update-unique-builder.test.ts` - UpdateUnique query builder
- `tests/unit/generators/type-mapper.test.ts` - SurrealQL type generation
- `tests/generators/migrations.test.ts` - DEFINE FIELD statements
- `tests/integration/migration.test.ts` - Migration integration

## Code Patterns

- **Proxy pattern** for model access (`client.db.User`)
- **Registry pattern** for operator handlers in `src/query/filters/`
- Each module has `index.ts` that re-exports public API
- Generated files use Prettier formatting

## Key Types

- `ModelMetadata` / `FieldMetadata` - Runtime model info
- `GetUserPayload<S, I>` - Prisma-style return type inference
- `SchemaAST` / `ASTModel` / `ASTField` - Parser output

## Query Patterns

**Parameterized queries** - Values are bound via `$varName`, not inlined:

- Connect: `profileId = $profile_connect[0]` (not `profileId = "profile:123"`)
- Array connect: `tagIds = $tags_connect` (not `tagIds = ["tag:1"]`)
- Bidirectional sync: `UPDATE $sync_0_0 SET userIds += $resultId`

**NULL vs NONE in updates:**

- Disconnect optional field: `SET fieldName = NULL` (queryable with `{ field: null }`)
- Delete field entirely: `SET fieldName = NONE` (field becomes absent)

**Validation in transactions:**

```surql
LET $exists_0_0 = (SELECT id FROM ONLY $validate_0_0);
IF $exists_0_0 IS NONE { THROW "Cannot connect to non-existent Model record" };
```

**DeleteUnique queries:**

- Uses `DELETE recordId RETURN BEFORE/NONE` (no `ONLY` keyword - allows empty array result)
- Returns array result, checks `result.length > 0` for existence
- For non-ID lookups with cascade, uses `IF $record IS NONE { RETURN [] }` to handle non-existent records
- Return options: `undefined`/`null` (always true), `true` (existed?), `'before'` (deleted data)

## Code Style

- **Newline before return** - Always add a blank line before `return` statements
- **Inline single-statement if** - When an `if` has only one statement, write it inline without braces:

  ```typescript
  // Good
  if (condition) return value;
  if (!valid) throw new Error('Invalid');

  // Avoid
  if (condition) {
    return value;
  }
  ```

- **Array length checks** - Use truthy/falsy checks, not comparisons:

  ```typescript
  // Good
  if (!items.length) return;
  if (results.length) process(results);

  // Avoid
  if (items.length === 0) return;
  if (results.length >= 0) process(results);
  ```

## Task Completion

- **Never stop early** - Do not stop tasks due to token budget or context window concerns
- **Be persistent** - Complete tasks fully, even if approaching budget limits
- **Save progress** - If context compaction occurs, continue from where you left off
- Context window compacts automatically - this allows indefinite work continuation

## RecordId Transformation

SurrealDB uses `table:id` format for record IDs. Cerial abstracts this so you work with plain IDs:

- **Sending to SurrealDB**: `transformOrValidateRecordId(tableName, id)` converts plain ID → `RecordId(table, id)`
- **Receiving from SurrealDB**: `transformRecordIdToValue(recordId)` converts `RecordId` → plain ID string

This lets you work with IDs like other databases. The transformer handles SurrealDB's table prefix requirement internally.

```typescript
// User sees plain IDs
const user = await client.db.User.findOne({ where: { id: 'abc123' } });
console.log(user.id); // 'abc123' (not 'user:abc123')

// Internally transforms to: SELECT * FROM user WHERE id = user:abc123
```

When building queries that reference record IDs (like bidirectional sync), prepend the table name: `${tableName}:${id}`.

## NONE vs null Semantics

SurrealDB distinguishes between `NONE` (field doesn't exist) and `null` (field exists with null value). See: https://surrealdb.com/docs/surrealql/datamodel/none-and-null

**Schema definitions:**

| Schema                         | TypeScript Type           | undefined behavior    | null behavior     |
| ------------------------------ | ------------------------- | --------------------- | ----------------- |
| `field String?`                | `field?: string \| null`  | NONE (field absent)   | null stored in DB |
| `field String? @default(null)` | `field?: string \| null`  | null stored (default) | null stored in DB |
| `field Relation?`              | `field?: Related \| null` | NONE                  | null stored       |
| `field Record?`                | `field?: string`          | NONE                  | NONE (no null)    |

**Query operators:**

| Operator           | SurrealQL       | Description                       |
| ------------------ | --------------- | --------------------------------- |
| `{ eq: null }`     | `field = NULL`  | Field is null (not NONE)          |
| `{ not: null }`    | `field != NULL` | Field is not null (could be NONE) |
| `{ isNone: true }` | `field = NONE`  | Field is absent                   |
| `{ isNone: false}` | `field != NONE` | Field is present (could be null)  |

**Runtime behavior:**

```typescript
// field String? (no @default) - user chooses NONE or null
{
  name: 'John';
} // name = 'John'
{
  name: undefined;
} // name field NOT stored (NONE)
{
  name: null;
} // name = null (explicit null stored)

// field String? @default(null) - undefined defaults to null
{
  bio: 'Hello';
} // bio = 'Hello'
{
  bio: undefined;
} // bio = null (default applied)
{
  bio: null;
} // bio = null (explicit null)

// field Record? - null is treated as NONE (record refs can't be null)
{
  userId: 'abc';
} // userId = record reference
{
  userId: undefined;
} // userId field NOT stored (NONE)
{
  userId: null;
} // userId field NOT stored (NONE)
```

**Implementation details:**

- `applyNowDefaults()` in `data-transformer.ts` handles @default(null) → converts undefined to null
- `applyNowDefaults()` also filters out null for Record fields (they can't be null)
- Nested builder skips undefined values (NONE) and null for Record fields
- Type generator adds `| null` for all optional non-Record fields
- Migration generator uses `option<T | null>` for optional fields to accept both NONE and null

## Gotchas

- E2E tests MUST use `--preload` flag or generated client won't exist
- `Record` type = SurrealDB record reference (stored as `record<tablename>`)
- `Relation` type = virtual field, not stored in DB
- Forward relations have `@field()`, reverse relations don't
- Array fields default to `[]` on create if not provided
- `null` without `@default(null)` is treated as NONE (field absent)
