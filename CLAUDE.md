# Cerial - Agent Guide

A Prisma-like ORM for SurrealDB. Runtime: **Bun**. Language: **TypeScript**.

## Commands

```bash
bun install                                              # Install dependencies
bun test                                                 # Run all tests
bun test tests/e2e/ --preload ./tests/e2e/preload.ts     # E2E tests (requires SurrealDB running)
bun run typecheck                                        # Type check generated types (ts-toolbelt)
bunx tsc --noEmit                                        # Full TypeScript check
bun run generate:test-client                            # Generate test client from schema
```

## Project Structure

```
cerial/
├── bin/cerial.ts                    # CLI entry point
├── src/
│   ├── cli/                         # CLI commands, validators, schema resolution
│   ├── client/                      # Runtime client, Model class, Proxy factory
│   ├── connection/                  # Connection manager, config types
│   ├── generators/                  # Code generation from AST
│   │   ├── client/                  #   Client template + writer
│   │   ├── metadata/               #   Model registry generator
│   │   ├── migrations/             #   DEFINE TABLE/FIELD/INDEX generator
│   │   └── types/                  #   Interface, derived, where, method generators
│   ├── parser/                      # Schema lexer, tokenizer, parser → AST
│   │   └── types/                  #   Field types, decorators, constraints parsers
│   ├── query/                       # Query building + execution
│   │   ├── builders/               #   Select, insert, update, delete, nested, relation builders
│   │   ├── compile/                #   Query fragments, variable allocator
│   │   ├── filters/                #   Operator handlers (comparison, string, array, logical, special)
│   │   ├── mappers/                #   Result mapper (RecordId → CerialId)
│   │   ├── transformers/           #   Data transformer (RecordIdInput → RecordId, defaults)
│   │   └── validators/             #   Data + where validation
│   ├── types/                       # Shared TS types (metadata, query, utility, AST)
│   ├── utils/                       # CerialId, string/array/type/validation utils
│   └── main.ts                      # Main exports
├── tests/
│   ├── unit/                        # Unit tests (no DB)
│   ├── integration/                 # Integration tests (DB required)
│   ├── e2e/                         # End-to-end tests
│   │   ├── schemas/                 #   33 .cerial test schemas
│   │   ├── generated/               #   Generated client (gitignored)
│   │   ├── relations/               #   91 relation test files
│   │   ├── objects/                 #   7 object test files
│   │   ├── timestamps/              #   Timestamp decorator E2E tests
│   │   ├── typechecks/              #   18 compile-time type checks
│   │   ├── preload.ts               #   Generates client before tests
│   │   └── test-client.ts           #   Test helpers
│   └── generators/                  # Generator tests
├── docs/                            # GitHub Pages documentation (Jekyll + just-the-docs)
├── package.json
├── tsconfig.json
└── index.ts                         # Re-exports main.ts
```

### Key Files

| File                                          | Purpose                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `src/utils/cerial-id.ts`                      | `CerialId` class and `RecordIdInput` union type                          |
| `src/query/transformers/data-transformer.ts`  | Input transformation, `@default`/timestamp handling, NONE/null logic     |
| `src/query/mappers/result-mapper.ts`          | Output transformation (RecordId → CerialId)                              |
| `src/query/builders/nested-builder.ts`        | Nested create/connect/disconnect in transactions                         |
| `src/generators/types/derived-generator.ts`   | Generates Select, OrderBy, GetPayload, Include types                     |
| `src/generators/types/interface-generator.ts` | Generates model/object interfaces                                        |
| `src/generators/types/where-generator.ts`     | Generates Where types with nested/object filtering                       |
| `src/generators/client/writer.ts`             | Writes client files, contains `ResolveFieldSelect` / `ApplyObjectSelect` |
| `src/cli/validators/relation-validator.ts`    | Validates relation rules (PK/non-PK, @key, @onDelete)                    |
| `src/query/filters/registry.ts`               | Operator handler registry                                                |

## Architecture

```
Schema (.cerial files) → Parser (AST) → Generators → TypeScript Client
```

- **Parser** - Lexes/tokenizes `.cerial` files into `SchemaAST` (models + objects)
- **Generators** - Produces TypeScript types, client class, model registry, migrations
- **Query Builder** - Converts typed query objects into parameterized SurrealQL
- **Client** - Proxy-based model access (`client.db.User.findMany(...)`)

## Testing

**E2E tests require SurrealDB already running:**

- URL: `http://127.0.0.1:8000`, Credentials: `root` / `root`, Namespace/Database: `main`
- Do NOT run `surreal start` commands - the instance must already be running
- E2E tests MUST use `--preload ./tests/e2e/preload.ts` or generated client won't exist

**Test locations:**

| Location                  | Type                      | Count    |
| ------------------------- | ------------------------- | -------- |
| `tests/unit/`             | Unit tests (no DB)        | ~550     |
| `tests/integration/`      | Integration (DB required) | ~49      |
| `tests/e2e/relations/`    | Relation E2E tests        | 91 files |
| `tests/e2e/objects/`      | Object E2E tests          | 7 files  |
| `tests/e2e/transactions/` | Transaction E2E tests     | 10 files |
| `tests/e2e/timestamps/`   | Timestamp E2E tests       | 1 file   |
| `tests/e2e/typechecks/`   | Compile-time type checks  | 18 files |

**When query format changes**, update expectations in:

- `tests/unit/query/nested-builder.test.ts`
- `tests/unit/query/delete-builder.test.ts`
- `tests/unit/query/delete-unique-builder.test.ts`
- `tests/unit/query/update-unique-builder.test.ts`
- `tests/unit/generators/type-mapper.test.ts`
- `tests/generators/migrations.test.ts`
- `tests/integration/migration.test.ts`

## Code Style

- **Newline before return** - Always add a blank line before `return` statements
- **Inline single-statement if** - No braces for single-line `if`:

  ```typescript
  if (condition) return value;
  if (!valid) throw new Error('Invalid');
  ```

- **Array length checks** - Use truthy/falsy, not comparisons:

  ```typescript
  if (!items.length) return;
  if (results.length) process(results);
  ```

- **Module exports** - Each module has `index.ts` that re-exports its public API
- **Generated files** - Formatted with Prettier

### File & Folder Organization

- **Modularize by domain** - Group related logic into dedicated folders (e.g., `types/objects/` for object-specific generators)
- **Separate concerns** - Each file should own one responsibility; avoid mixing model and object logic in the same file
- **Nest folders when needed** - When a domain grows beyond 3-4 files, create a subfolder with its own `index.ts`
- **Prefer small focused files** - Many small files with clear names over few large files with mixed responsibilities
- **Decouple logic** - Keep independent subsystems (parsing, generation, query building, validation) in their own folders and files
- **Barrel exports** - Every folder gets an `index.ts` that re-exports its public API; consumers import from the barrel, not individual files

## TypeScript Conventions

- Strict mode enabled - no `any` unless absolutely necessary
- Use `interface` for object shapes, `type` for unions/intersections/mapped types
- Prefer `const` over `let`; never use `var`
- Use explicit return types on exported functions
- Use `readonly` for properties that shouldn't be mutated
- Prefer early returns to reduce nesting
- Use discriminated unions over type assertions
- Avoid `@ts-ignore` - use `@ts-expect-error` with a comment when truly needed
- Use `Record<K, V>` for dictionaries, not `{ [key: string]: V }`

## Agent Rules

### Core Behavior

- **Never stop early** - Complete tasks fully regardless of token budget or context window
- **Be persistent** - Context window compacts automatically, continue from where you left off
- **Ask before changing core features** - When a fix requires modifying type generators, query builders, or validators, ask the user first
- **Validate test expectations before modifying source** - If a test fails, understand why before changing the test vs. the source

### Documentation Sync (CRITICAL)

Documentation lives in `docs/` (GitHub Pages with Jekyll + just-the-docs theme).

**Always keep docs in sync with code changes:**

- **New feature** → Add or update the relevant `docs/` page(s). If it's a new concept, create a new page with proper Jekyll front matter (title, parent, nav_order)
- **Changed feature** → Update all affected doc pages to reflect the new behavior, examples, and types
- **Removed feature** → Remove or update doc pages. Remove dead links from parent/index pages
- **New decorator** → Add a page in `docs/schema/decorators/` with grand_parent: Schema, parent: Decorators
- **New query method** → Add a page in `docs/queries/` with parent: Queries
- **New filter operator** → Update the relevant page in `docs/filtering/`
- **Changed types** → Update `docs/types/generated-types.md` and `docs/types/dynamic-return-types.md`

Doc pages use Jekyll front matter:

```yaml
---
title: Page Title
parent: Parent Section # e.g., Schema, Queries, Relations
grand_parent: Grand Parent # only for 3rd-level pages (e.g., decorator sub-pages)
nav_order: 1 # controls sidebar ordering
has_children: true # only on section index pages
---
```

**Documentation is for library consumers, not contributors:**

- Focus on **what** the feature does and **how to use it** — not how it works internally
- Do NOT expose implementation details (SurrealQL output, internal variable naming, assembly steps, executor internals) unless directly relevant to the user
- Show practical examples with TypeScript code the user would actually write
- Mention constraints and gotchas that affect the user's API usage, not internal architecture decisions

### CLAUDE.md ↔ README.md Sync

`CLAUDE.md` is the agent-facing guide (structure, conventions, rules). `README.md` is the user-facing landing page (features, quick start, doc links). They share overlapping information that **must stay in sync**:

| What                    | CLAUDE.md location          | README.md location               | When to sync                                      |
| ----------------------- | --------------------------- | -------------------------------- | ------------------------------------------------- |
| **Project description** | Top line                    | Top heading + intro              | If the project's scope or tagline changes         |
| **Feature list**        | Key Concepts section        | Features bullet list             | New feature, removed feature, renamed concept     |
| **Query methods**       | Key Concepts (implicit)     | Docs section links + quick start | New query method added or removed                 |
| **Field types**         | Gotchas, Key Concepts       | Quick start schema example       | New field type added or removed                   |
| **Decorators**          | Key Concepts, Gotchas       | Quick start schema example       | New decorator that belongs in the quick example   |
| **Requirements**        | Commands section (implicit) | Requirements section             | Runtime or DB dependency changes                  |
| **Doc section links**   | N/A                         | Documentation section            | New doc section added, section renamed or removed |
| **CLI commands**        | Commands section            | Quick start generate command     | CLI flags or defaults change                      |

**Rules:**

- When adding a **new feature** visible to end users, add it to the README features list and ensure the quick start example still represents the best overview of Cerial's capabilities
- When adding a **new doc section** in `docs/`, add a corresponding link in README's Documentation section
- When **renaming or removing** a doc section, update README links to avoid dead references
- When changing **CLI defaults** (schema path, output path, command name), update both CLAUDE.md Commands section and README's quick start
- The README quick start schema example should showcase the most important field types and decorators — update it when new types/decorators are significant enough to highlight
- Do **not** duplicate detailed information — README stays concise (~100-130 lines), full details live in `docs/`

### Testing Rules

- **E2E tests should not use `as any` or `@ts-expect-error`** - If types don't match runtime behavior, fix the type generators
  - Exception: Testing runtime error handling for operations the type system correctly prevents (use `@ts-expect-error` with explanation comment)
- **Always run relevant tests** after making changes: `bun test` for full suite, or targeted test paths
- **Run `bunx tsc --noEmit`** after modifying types or generators to catch type errors
- **Bug fixes must include tests** - When fixing a bug that was not caught by existing tests, add a test that covers the specific bug being fixed. The test should fail without the fix and pass with it. This prevents regressions and ensures test coverage grows with each fix.
- **Run `bun run test:full` after all tasks are complete** - This regenerates the test client, runs typechecks, and runs all tests (unit, integration, client, parser, E2E). This is the final validation step before considering work done.
- **Exhaustive edge-case coverage (CRITICAL)** - Every new feature must have tests that cover every small edge case, not just the happy path. Shallow tests that only verify "it works" miss logical flaws. Specifically:
  - **E2E tests must be exhaustive** — For each feature, enumerate every meaningful combination of inputs, options, and code paths, then write a dedicated test for each. Think: "what are all the ways a user could call this, and what should happen in each case?" This includes:
    - Every code path (e.g., create vs update path, ID-based vs WHERE-based)
    - Every option combination (e.g., each `return` value with each strategy)
    - Boundary conditions (empty data, null fields, absent fields, NONE vs null)
    - Field preservation (fields in create only, update only, both, neither)
    - Result shape (single vs array, CerialId mapping, selected fields only)
    - Error cases (missing required fields, invalid input)
    - Integration with other features (select, include, $transaction, nested relations)
  - **Unit tests must verify generated query structure** — Not just "contains this string" but the full shape: correct keywords, correct variable bindings, correct conditional logic per field
  - When in doubt, write more tests. A test that seems "obvious" today catches a regression tomorrow.

### When Adding New Features

1. Implement the feature in `src/`
2. Add/update unit tests in `tests/unit/`
3. Add E2E test schemas in `tests/e2e/schemas/` if needed
4. Add E2E tests in `tests/e2e/`
5. Run `bun run generate:test-client` to regenerate test client
6. Run full test suite: `bun test`
7. Run type check: `bunx tsc --noEmit`
8. Update documentation in `docs/`

### When Adding a New Operator

1. Create handler in `src/query/filters/<category>/<operator>-handler.ts`
2. Register in `src/query/filters/registry.ts`
3. Update where types in `src/generators/types/where-generator.ts`
4. Add unit tests
5. Add E2E tests
6. Update `docs/filtering/` page

### When Adding a New Field Type

1. Create parser in `src/parser/types/field-types/<type>-parser.ts`
2. Update `SchemaFieldType` in `src/types/common.types.ts`
3. Update type mappings in generators and validators
4. Add tests
5. Update `docs/schema/field-types.md`

### When Adding a New Decorator

1. Create parser in `src/parser/types/field-decorators/<decorator>-parser.ts`
2. Update generator to handle the decorator
3. Update migration generator if it affects DB schema
4. Add tests
5. Add page in `docs/schema/decorators/`

## Key Concepts (Quick Reference)

- **Record** = SurrealDB record reference (`table:id` format), stored as `record<tablename>`
- **Relation** = Virtual field, not stored in DB. Forward has `@field()`, reverse doesn't
- **CerialId** = Wrapper for record IDs with `.table`, `.id`, `.equals()`, `.toString()`
- **RecordIdInput** = `string | CerialId | RecordId | StringRecordId` (accepted as input)
- **NONE vs null** = SurrealDB distinguishes absent fields (NONE) from null-valued fields (null)
- **PK side** = Forward relation with `Record` + `Relation @field` (stores FK)
- **Non-PK side** = Reverse relation with `Relation @model` only (queries related table)
- **@now** = COMPUTED `time::now()` — not stored, computed at query time. Output-only (excluded from Create/Update/Where)
- **@createdAt** = `DEFAULT time::now()` — set on creation when field is absent. Optional in Create/Update, present in Where
- **@updatedAt** = `DEFAULT ALWAYS time::now()` — set on every create/update when field is absent. Optional in Create/Update, present in Where
- **@defaultAlways(value)** = `DEFAULT ALWAYS value` — general-purpose reset-on-write default. Any field type. Resets to value on every create/update when absent. NONE injection on update. Mutually exclusive with `@default`, `@now`, `@createdAt`, `@updatedAt`
- **Timestamp decorators** = `@now`, `@createdAt`, `@updatedAt` are mutually exclusive with each other and with `@default`/`@defaultAlways`. Date fields only. `@now` is model-only (COMPUTED must be top-level). `@createdAt`/`@updatedAt` allowed on model + object fields
- **Object types** = Embedded inline, no id, no relations. Allowed decorators: `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`
- **Parameterized queries** = Values bound via `$varName`, never inlined
- **CerialQueryPromise** = Thenable returned by model methods. Auto-executes on `await`, collectible by `$transaction`
- **$transaction** = Atomic batch execution of independent queries with typed tuple results

## Gotchas

- E2E tests MUST use `--preload` flag or generated client won't exist
- Array fields default to `[]` on create if not provided
- `null` without `@default(null)` is treated as NONE (field absent)
- `id Record @id` fields skip the "Record needs paired Relation" validation
- Optional object fields (`Address?`) produce `field?: Address` (NOT `| null` like primitives)
- `select` within `include` is type-level only - runtime returns full related objects
- `none` quantifier for array object where uses `!(arr.any(...))` syntax for SurrealDB 3.x compatibility
- `@onDelete` is only allowed on optional `Relation?` fields - required relations auto-cascade
- N:N relations require BOTH sides to define `Record[]` + `Relation[]` for bidirectional sync
- `CerialQueryPromise` is a thenable (not `instanceof Promise`) — bun's `expect().rejects` requires wrapping: `await expect((async () => { await query; })()).rejects.toThrow()`
- `$transaction` queries are independent — one query cannot reference another's result
