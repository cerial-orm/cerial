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
Schema (.schema files) → Parser (AST) → Generators → TypeScript Client
```

**Core modules:**

- `src/parser/` - Parses `.schema` files into AST
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

**E2E tests require SurrealDB running:**

```bash
surreal start -u root -p root memory
```

E2E tests use `--preload ./tests/e2e/preload.ts` which generates the client before tests run. The generated client lives in `tests/e2e/generated/` (gitignored).

**Type checks** use ts-toolbelt for compile-time verification in `tests/e2e/typechecks/*.check.ts`.

## Code Patterns

- **Proxy pattern** for model access (`client.db.User`)
- **Registry pattern** for operator handlers in `src/query/filters/`
- Each module has `index.ts` that re-exports public API
- Generated files use Prettier formatting

## Key Types

- `ModelMetadata` / `FieldMetadata` - Runtime model info
- `GetUserPayload<S, I>` - Prisma-style return type inference
- `SchemaAST` / `ASTModel` / `ASTField` - Parser output

## Gotchas

- E2E tests MUST use `--preload` flag or generated client won't exist
- `Record` type = SurrealDB record reference (stored as `record<tablename>`)
- `Relation` type = virtual field, not stored in DB
- Forward relations have `@field()`, reverse relations don't
- Array fields default to `[]` on create if not provided
