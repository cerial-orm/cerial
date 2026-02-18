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
│   │   └── types/                  #   Interface, derived, where, method, enum generators
│   │       └── enums/              #     Enum type name helpers + generators
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
│   │   ├── schemas/                 #   37 .cerial test schemas
│   │   ├── generated/               #   Generated client (gitignored)
│   │   ├── relations/               #   91 relation test files
│   │   ├── objects/                 #   9 object test files
│   │   ├── timestamps/              #   Timestamp decorator E2E tests
│   │   ├── typechecks/              #   36 compile-time type checks
│   │   ├── uuid/                    #   5 UUID E2E test files
│   │   ├── number/                  #   4 Number E2E test files
│   │   ├── duration/                #   5 Duration E2E test files
│   │   ├── decimal/                 #   5 Decimal E2E test files
│   │   ├── bytes/                   #   4 Bytes E2E test files
│   │   ├── geometry/                #   3 Geometry E2E test files
│   │   ├── any/                     #   4 Any E2E test files
│   │   ├── set/                     #   3 Set E2E test files
│   │   ├── preload.ts               #   Generates client before tests
│   │   └── test-client.ts           #   Test helpers
│   └── generators/                  # Generator tests
├── docs/                            # GitHub Pages documentation (Jekyll + just-the-docs)
├── package.json
├── tsconfig.json
└── index.ts                         # Re-exports main.ts
```

### Key Files

| File                                          | Purpose                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/utils/cerial-id.ts`                      | `CerialId` class and `RecordIdInput` union type                                               |
| `src/query/transformers/data-transformer.ts`  | Input transformation, `@default`/timestamp handling, NONE/null logic                          |
| `src/query/mappers/result-mapper.ts`          | Output transformation (RecordId → CerialId)                                                   |
| `src/query/builders/nested-builder.ts`        | Nested create/connect/disconnect in transactions                                              |
| `src/generators/types/derived-generator.ts`   | Generates Select, OrderBy, GetPayload, Include types                                          |
| `src/generators/types/interface-generator.ts` | Generates model/object interfaces                                                             |
| `src/generators/types/where-generator.ts`     | Generates Where types with nested/object filtering                                            |
| `src/generators/client/writer.ts`             | Writes client files, contains `ResolveFieldSelect` / `ApplyObjectSelect` / `ApplyTupleSelect` |
| `src/cli/validators/relation-validator.ts`    | Validates relation rules (PK/non-PK, @key, @onDelete)                                         |
| `src/query/filters/registry.ts`               | Operator handler registry                                                                     |
| `src/generators/types/enums/name-helpers.ts`  | Enum/literal type name resolution (isEnum dispatch)                                           |
| `src/generators/client/enum-writer.ts`        | Writes per-enum type files                                                                    |
| `src/utils/cerial-uuid.ts`                    | `CerialUuid` class and `CerialUuidInput` union type                                           |
| `src/utils/cerial-duration.ts`                | `CerialDuration` class and `CerialDurationInput` union type                                   |
| `src/utils/cerial-decimal.ts`                 | `CerialDecimal` class with arithmetic, `CerialDecimalInput` union type                        |
| `src/utils/cerial-bytes.ts`                   | `CerialBytes` class and `CerialBytesInput` union type                                         |
| `src/utils/cerial-geometry.ts`                | `CerialGeometry` hierarchy (7 subtypes) and `CerialGeometryInput` union type                  |
| `src/utils/cerial-any.ts`                     | `CerialAny` recursive union type                                                              |
| `src/utils/cerial-set.ts`                     | `CerialSet<T>` branded array type                                                             |

## Architecture

```
Schema (.cerial files) → Parser (AST) → Generators → TypeScript Client
```

- **Parser** - Lexes/tokenizes `.cerial` files into `SchemaAST` (models + objects + tuples + enums)
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
| `tests/unit/`             | Unit tests (no DB)        | ~1693    |
| `tests/integration/`      | Integration (DB required) | ~49      |
| `tests/e2e/relations/`    | Relation E2E tests        | 95 files |
| `tests/e2e/objects/`      | Object E2E tests          | 9 files  |
| `tests/e2e/tuples/`       | Tuple E2E tests           | 10 files |
| `tests/e2e/transactions/` | Transaction E2E tests     | 10 files |
| `tests/e2e/timestamps/`   | Timestamp E2E tests       | 1 file   |
| `tests/e2e/enums/`        | Enum E2E tests            | 8 files  |
| `tests/e2e/literals/`     | Literal E2E tests         | 15 files |
| `tests/e2e/unset/`        | Unset parameter E2E tests | 8 files  |
| `tests/e2e/uuid/`         | UUID E2E tests            | 5 files  |
| `tests/e2e/number/`       | Number E2E tests          | 4 files  |
| `tests/e2e/duration/`     | Duration E2E tests        | 5 files  |
| `tests/e2e/decimal/`      | Decimal E2E tests         | 5 files  |
| `tests/e2e/bytes/`        | Bytes E2E tests           | 4 files  |
| `tests/e2e/geometry/`     | Geometry E2E tests        | 3 files  |
| `tests/e2e/any/`          | Any E2E tests             | 4 files  |
| `tests/e2e/set/`          | Set E2E tests             | 3 files  |
| `tests/e2e/typechecks/`   | Compile-time type checks  | 36 files |

**Sandbox testing** = Running raw SurrealQL against the live SurrealDB instance to verify DB-level behavior before implementing in code. Use this when you need to confirm how SurrealDB handles a specific query pattern (e.g., `$this` reconstruction, dot-notation merge, SELECT expression shapes). When the user says "sandbox test", execute queries via curl:

```bash
# Query
curl -s -X POST http://127.0.0.1:8000/sql \
  -H "Accept: application/json" \
  -H "surreal-ns: main" -H "surreal-db: main" \
  -u "root:root" \
  -d "YOUR SURREALQL HERE"

# Multiple statements in one request (semicolon-separated)
curl -s -X POST http://127.0.0.1:8000/sql \
  -H "Accept: application/json" \
  -H "surreal-ns: main" -H "surreal-db: main" \
  -u "root:root" \
  -d "DEFINE TABLE test SCHEMALESS; CREATE test SET foo = [1,2,3]; SELECT foo[0] FROM test;"
```

**Important:** Use `surreal-ns` and `surreal-db` headers (NOT `NS`/`DB`). The short-form headers are rejected by SurrealDB.

Sandbox testing is **allowed in plan mode** — it is investigative research to verify DB-level behavior, not a codebase modification. Always clean up test tables afterward with `REMOVE TABLE tablename`.

**When query format changes**, update expectations in:

- `tests/unit/query/nested-builder.test.ts`
- `tests/unit/query/delete-builder.test.ts`
- `tests/unit/query/delete-unique-builder.test.ts`
- `tests/unit/query/update-unique-builder.test.ts`
- `tests/unit/generators/type-mapper.test.ts`
- `tests/generators/migrations.test.ts`
- `tests/integration/migration.test.ts`

## Code Style

- **Single quotes** - Biome formatter enforces single quotes for all string literals. Always use `'single quotes'` in TypeScript/JavaScript code, never `"double quotes"`
- **Newline before return** - Always add a blank line before `return` statements
- **Inline single-statement if** - No braces for single-line `if`:

  ```typescript
  if (condition) return value;
  if (!valid) throw new Error("Invalid");
  ```

- **Array length checks** - Use truthy/falsy, not comparisons:

  ```typescript
  if (!items.length) return;
  if (results.length) process(results);
  ```

- **Module exports** - Each module has `index.ts` that re-exports its public API
- **Generated files** - Formatted with Biome

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
- **Always run `bun run format` before committing** - Run Biome formatter on new/changed files before every git commit. This ensures consistent formatting and catches lint issues early. Never commit unformatted code. After running, check the output for any warnings or errors — if any are reported, fix them before proceeding. Do not ignore Biome diagnostics

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
- **Run `bun run format` before running full tests** - This formats, checks linting errors & tries to fix safely the codebase with Biome. Always run before `test:full` to ensure formatting is consistent.
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
- **E2E test file organization** — Each E2E feature folder (`tests/e2e/<feature>/`) should contain multiple focused test files, one per sub-topic. Do NOT put all tests in a single large file. Follow the pattern used by `tests/e2e/objects/` and `tests/e2e/tuples/`:
  - One file per sub-topic (e.g., `primitive.test.ts`, `object.test.ts`, `deep-nested.test.ts`, `upsert.test.ts`, `validation.test.ts`)
  - Shared helpers (client setup, cleanup) imported from a common helper file
  - Each file should be independently runnable with `bun test tests/e2e/<feature>/<file> --preload ./tests/e2e/preload.ts`
- **E2E test global setup pattern (CRITICAL)** — The E2E preload (`tests/e2e/preload.ts`) runs `globalCleanup()` ONCE before any test file executes. This removes all tables and runs `migrate()` to establish the correct schema. Individual test files must NOT redo this work:
  - `beforeAll`: Call `cleanupTables(client, YOUR_TABLES)` — this only does `DELETE FROM` (data cleanup, no schema changes)
  - `beforeEach`: Call `truncateTables(client, YOUR_TABLES)` — same lightweight `DELETE FROM` per-test
  - **Do NOT** call `REMOVE TABLE`, `resetMigrationState()`, or `client.migrate()` inside test files — these run once globally in preload
  - **Do NOT** manually execute `DEFINE TABLE` or schema DDL in test files — `migrate()` handles this
  - **Why**: Multiple test files running `REMOVE TABLE + migrate(134 models)` concurrently causes race conditions (tables removed while other tests query them, 134 competing DEFINE statements)
- **E2E concurrency** — Always run E2E tests with `--concurrency 5` via `bun run test:e2e`. Running without concurrency limit works but `--concurrency 5` provides more predictable timing. Never rely on test file execution order
- **New tables in E2E tests** — When adding a new schema file to `tests/e2e/schemas/`, add its table names to the `tables` registry in `tests/e2e/test-helper.ts`. This ensures `globalCleanup()` covers them. Also update the relevant `*_TABLES` constant if the tables belong to root, index, or typed-id groups

### SurrealDB Reserved Keywords

Do NOT use SurrealDB reserved keywords as field names, model names, or object names in `.cerial` schema files. SurrealDB's parser will misinterpret them, causing migration failures. Known reserved keywords that cause issues: `info`, `select`, `create`, `update`, `delete`, `from`, `where`, `table`, `field`, `type`, `value`, `index`, `for`, `on`, `set`, `define`, `remove`, `begin`, `commit`, `cancel`, `return`, `limit`, `start`, `order`, `group`, `fetch`, `timeout`, `parallel`, `content`, `merge`, `patch`, `let`, `if`, `else`, `then`, `end`, `throw`, `break`, `continue`, `none`, `null`, `true`, `false`, `and`, `or`, `not`, `is`, `in`, `contains`, `inside`, `outside`, `intersects`, `only`, `full`, `as`. When in doubt, avoid common SQL/SurrealQL keywords as identifiers.

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
- **CerialId\<T\>** = Generic wrapper for record IDs. `.id` returns `T` (e.g., `number` for `Record(int) @id`). `.table` returns `string`. `.equals()` takes `unknown` and does deep comparison. `.toString()` returns properly escaped `table:id`. `CerialId.fromRecordId()` preserves typed ID values
- **RecordIdInput\<T\>** = `T | CerialId<T> | RecordId | StringRecordId` (accepted as input). Generic narrows accepted values based on target model's ID type
- **Record(Type) @id** = Typed ID syntax. Supported: `int`, `float`, `number`, `string`, `uuid`, tuple refs, object refs, unions (`Record(string, int)`). Plain `Record @id` = backward-compatible string IDs
- **FK type inference** = When a model has `Record(int) @id`, any FK Record field pointing to it via `@model()` automatically gets typed as `CerialId<number>` output / `RecordIdInput<number>` input. Users must NOT add `Record(Type)` on FK fields
- **Standalone Record typing** = `Record(int)` without Relation for explicit typing of non-FK record fields. Produces `CerialId<number>` output, `number | RecordIdInput<number>` input
- **NONE vs null** = SurrealDB distinguishes absent fields (NONE) from null-valued fields (null). `?` enables NONE (maps to `undefined`), `@nullable` enables null (maps to `| null`). They are independent modifiers
- **@nullable** = Field-level decorator enabling explicit null values. `@nullable` on its own = required nullable (`T | null`). With `?` = optional nullable (`T | null | undefined`). Not allowed on object/tuple fields (SurrealDB can't define sub-fields on nullable parents). Allowed on tuple elements. `@default(null)` requires `@nullable`. Affects disconnect (NULL vs NONE) and default `@onDelete` (SetNull vs SetNone)
- **PK side** = Forward relation with `Record` + `Relation @field` (stores FK)
- **Non-PK side** = Reverse relation with `Relation @model` only (queries related table)
- **@now** = COMPUTED `time::now()` — not stored, computed at query time. Output-only (excluded from Create/Update/Where)
- **@createdAt** = `DEFAULT time::now()` — set on creation when field is absent. Optional in Create/Update, present in Where
- **@updatedAt** = `DEFAULT ALWAYS time::now()` — set on every create/update when field is absent. Optional in Create/Update, present in Where
- **@defaultAlways(value)** = `DEFAULT ALWAYS value` — general-purpose reset-on-write default. Any field type. Resets to value on every create/update when absent. NONE injection on update. Mutually exclusive with `@default`, `@now`, `@createdAt`, `@updatedAt`
- **Timestamp decorators** = `@now`, `@createdAt`, `@updatedAt` are mutually exclusive with each other and with `@default`/`@defaultAlways`. Date fields only. `@now` is model-only (COMPUTED must be top-level). `@createdAt`/`@updatedAt` allowed on model + object fields
- **@flexible** = Field-level decorator for object-type fields. Adds `FLEXIBLE` to migration, generates `& Record<string, any>` intersection in types. Same object can be flexible on one field, strict on another. Where types get `& { [key: string]: any }` for filtering extra keys
- **@readonly** = Write-once field decorator. Adds `READONLY` to migration. Field settable on CREATE, excluded from Update types. Runtime error if passed to update. Incompatible with `@now` (COMPUTED), `@defaultAlways`, and `@id`. Allowed on model fields and object sub-fields. When on a PK Record field, the relation's nested update ops (connect/disconnect) are excluded from UpdateInput
- **Object types** = Embedded inline, no id, no relations. Allowed decorators: `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`, `@flexible`, `@readonly`
- **Tuple types** = Fixed-length typed arrays defined with `tuple {}`. Elements are comma-separated, optionally named. Input accepts array or object form; output is always array. `?` is NOT allowed on tuple elements (SurrealDB returns null for absent positions, not undefined) — use `@nullable` instead. Allowed element decorators: `@nullable`, `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`. Per-element update via array/object disambiguation at all levels: array = full replace, object = per-element update. Sub-field select on tuples with object elements (at any nesting depth) via `TupleSelect`. No orderBy. Supports nested tuples, objects in tuples, tuples in objects. Self-referencing requires `@nullable` element.
- **Literal types** = Union type for fields, defined with `literal {}`. Variants: string/int/float/bool values, broad types (`String`/`Int`/`Float`/`Bool`/`Date`), object refs, tuple refs, literal refs (composed unions), enum refs. Nesting restriction: objects/tuples inside literals can only contain primitives and simple literals (no deep objectRef/tupleRef/literalRef). Only `?` and `@nullable` honored on object/tuple sub-fields inside literals; other decorators emit a warning. Migration uses inline object syntax `{ field: type }` (not bare `object`). Non-enum literal fields excluded from OrderBy (mixed types make ordering ambiguous). Boolean-only select. Values are atomic — full replacement on update, no partial merge. Filtering uses the union's constituent operators (comparison for numbers, string ops only when all variants are string-compatible)
- **Enum types** = String-only named constants defined with `enum {}`. Values are bare identifiers. Generates `as const` object (`XEnum`), union type (`XEnumType`), and where type (`XEnumWhere`). Resolves to SurrealDB literal type. Literals can reference enums via literalRef. Enum fields support OrderBy (string ordering) — unlike non-enum literals which are excluded
- **Parameterized queries** = Values bound via `$varName`, never inlined
- **CerialQueryPromise** = Thenable returned by model methods. Auto-executes on `await`, collectible by `$transaction`
- **$transaction** = Atomic batch execution of independent queries with typed tuple results
- **Uuid** = UUID identifier field type. `CerialUuid` wrapper with `.toString()`, `.equals()`, `.toNative()`. Input: `CerialUuidInput = string | CerialUuid | Uuid (SDK)`. Supports comparison operators and OrderBy. Works in objects, tuples, literals
- **UUID decorators** = `@uuid` (v7 default), `@uuid4`, `@uuid7` for server-side auto-generation (`DEFAULT rand::uuid()`). Field becomes optional in CreateInput. Model + object fields only (NOT tuples). Mutually exclusive with `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`, `@now`, and each other
- **Number** = Auto-detect numeric type (`int` or `float`). SurrealDB decides representation based on value. Maps to `number` in TypeScript (same as Int/Float). Distinct SurrealQL type `number` (not aliased to `float`). Supports all numeric comparison operators and OrderBy
- **Duration** = Time duration. `CerialDuration` wrapper with accessors (`.hours`, `.minutes`, `.seconds`, etc.), `.toString()`, `.compareTo()`, `.toNative()`. Input: `CerialDurationInput = string | CerialDuration | Duration (SDK)`. String format: `'2h30m15s'`. Supports comparison operators and OrderBy
- **Decimal** = Arbitrary-precision decimal number. `CerialDecimal` wrapper with arithmetic (`.add()`, `.sub()`, `.mul()`, `.div()`), `.toString()`, `.toNumber()` (lossy!), `.toNative()`. Input: `CerialDecimalInput = number | string | CerialDecimal | Decimal (SDK)`. Supports comparison operators and OrderBy
- **Bytes** = Binary data. `CerialBytes` wrapper with `.toUint8Array()`, `.toBuffer()`, `.toBase64()`, `.toString()`. Input: `CerialBytesInput = Uint8Array | string (base64) | CerialBytes`. Equality-only WHERE operators (no gt/lt). OrderBy supported (lexicographic). No `@default` support
- **Geometry** = Geospatial data with 7 subtypes via decorators (`@point`, `@line`, `@polygon`, `@multipoint`, `@multiline`, `@multipolygon`, `@collection`). Bare `Geometry` = all subtypes. Multi-type: `Geometry @point @polygon`. CerialGeometry class hierarchy. Point input shorthand: `[lon, lat]`. Equality-only WHERE. No OrderBy. No spatial operators (future feature)
- **Any type** = `Any` field stores any SurrealDB value. `CerialAny` recursive union (NOT bare TS `any`). No `?`, no `@nullable` (TYPE any already accepts NONE/null). Full WHERE operator set. Excluded from OrderBy. Not allowed in tuple elements
- **@set decorator** = `String[] @set` generates `set<T>` instead of `array<T>`. Auto-dedup and sort at DB level. Output type `CerialSet<T>` (branded array). Input accepts regular arrays. Not allowed on Decimal[], Object[], Tuple[], Record[]. Mutually exclusive with @distinct/@sort

## Gotchas

- E2E tests MUST use `--preload` flag or generated client won't exist
- Array fields default to `[]` on create if not provided
- `null` requires `@nullable` on the field — without it, passing `null` is a validation error
- `@default(null)` requires `@nullable` — null default on a non-nullable field is invalid
- `id Record @id` fields skip the "Record needs paired Relation" validation
- FK fields must NOT use `Record(Type)` — types are inferred from the target model's `@id` type. Explicit `Record(int)` on a FK field is an error
- Union ID optionality: if `string` or `uuid` is in the union, the ID is optional in create (SurrealDB auto-generates). Otherwise required
- `DEFINE FIELD OVERWRITE` is used for typed `@id` fields to allow re-running migrations safely
- Optional object fields (`Address?`) produce `field?: Address` (NOT `| null` like primitives)
- `select` within `include` is type-level only - runtime returns full related objects
- `none` quantifier for array object where uses `!(arr.any(...))` syntax for SurrealDB 3.x compatibility
- `@onDelete` is only allowed on optional `Relation?` fields - required relations auto-cascade
- N:N relations require BOTH sides to define `Record[]` + `Relation[]` for bidirectional sync
- N:N relations require BOTH sides to define `Record[]` + `Relation[]` for bidirectional sync
- `CerialQueryPromise` is a thenable (not `instanceof Promise`) — bun's `expect().rejects` requires wrapping: `await expect((async () => { await query; })()).rejects.toThrow()`
- `$transaction` queries are independent — one query cannot reference another's result
- Tuple output is always array form `[1.5, 2.5]` — never object form, even when elements are named
- Optional tuple fields (`Coordinate?`) produce `field?: Coordinate` (NOT `| null` like primitives) in output, update type includes `| CerialNone` for clearing (same as other optional fields)
- `@nullable` is not allowed on object/tuple fields — SurrealDB can't define sub-fields on nullable parents. Allowed on tuple elements (and is the ONLY way to make a tuple element nullable — `?` is disallowed on tuple elements because SurrealDB returns null, not NONE/undefined, for absent tuple positions)
- Tuple array push with single tuple `[3, 4]` is wrapped to `[[3, 4]]` for SurrealDB `+=` to add one element (not two)
- Per-element update (object form) is NOT available on array tuple fields — only push/set
- `TupleSelect` is only generated for tuples with object elements at any nesting depth — primitive-only tuples use boolean select
- No Record/Relation types allowed in tuple elements
- **SurrealDB tuple+object bug** — SurrealDB has a bug where optional tuple fields with sub-field constraints (`DEFINE FIELD field[N]`) get initialized as `{}` (empty object) instead of NONE when the parent is absent and certain optional object fields exist on the same table. Mitigation: skip `DEFINE FIELD` for ALL primitive tuple elements that have no decorators (the parent tuple type literal already enforces element types, length, optionality, and `| null` for `@nullable`). Only emit sub-field constraints for elements with decorators (`@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`). A schema validator (`validateTupleObjectCombination()`) errors when a model combines an optional tuple with required-decorated elements and an optional object field
- **`unset` parameter** — Available on `updateMany`, `updateUnique`, and `upsert` (update portion). Uses object form syntax: `{ field: true }` for flat fields, `{ object: { subField: true } }` for nested. Tuple elements use `$this` reconstruction (`SET field = [$this.field[0], NULL, $this.field[2]]` for `@nullable` elements, `NONE` for optional elements). Runtime merges unset fields into data as NONE values before processing. `SafeUnset<Unset, Data>` prevents data/unset conflicts at compile time
- **No relation orderBy** — SurrealDB 3.x does not resolve record-link dot notation in ORDER BY (e.g., `ORDER BY authorId.name ASC` silently returns insertion order). Relation fields are excluded from `{Model}OrderBy` types. Object field ordering works fine. OrderBy inside `include` (ordering included children) is unaffected — that uses subqueries
- **Literal object inline migration** — Object variants in `literal {}` use inline syntax `{ label: string, count: option<int> }` in `TYPE` definitions, not bare `object`. SurrealDB enforces the full shape (required fields, optional via `option<T>`, nullable via `T | null`). No separate `DEFINE FIELD` needed for literal object sub-fields
- **Literal decorator restrictions** — Only `?` and `@nullable` are honored on object/tuple fields inside literals. Other decorators (`@default`, `@createdAt`, `@readonly`, etc.) emit a warning during generation since they can't be expressed in inline type syntax
- **Literal nesting depth** — Objects/tuples inside a literal can reference other literals, but those inner literals must only contain simple variants (string/int/float/bool/broadType). No objectRef/tupleRef/literalRef inside nested literals — parse-time error
- **Enum name collisions** — Enum names cannot collide with literal, model, object, or tuple names across all schema files
- **Enum values are string-only** — No numeric or boolean values allowed. Use `literal {}` for mixed types
- **Enum fields use literal internally** — Enum fields use `type: 'literal'` internally — query builders/filters/validators work automatically via existing literal infrastructure
- **Any type restrictions** — `Any?` and `Any @nullable` are blocked. SurrealDB `TYPE any` natively accepts NONE and null, so `CerialAny` already covers both. Not allowed in tuple elements
- **@set requires cast** — SurrealDB 3.x doesn't auto-coerce arrays to sets. Cerial automatically wraps set field values with `<set>` cast in queries
- **@set excluded types** — `Decimal[] @set` errors in SurrealDB (`set<decimal>` bug). Object[], Tuple[], Record[] arrays cannot use @set
- **UUID decorators on tuples** — `@uuid`/`@uuid4`/`@uuid7` NOT allowed on tuple elements. SurrealDB doesn't support DEFAULT on tuple elements (sandbox verified). Model + object fields only
- **UUID decorator exclusivity** — `@uuid`/`@uuid4`/`@uuid7` mutually exclusive with `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`, `@now`, and each other. Only one auto-generation decorator per field
- **Duration @default format** — Duration `@default` values are output unquoted in migrations: `@default(1h30m)` → `DEFAULT 1h30m` (not `DEFAULT '1h30m'`). Pattern-recognized via `/^\d+[smhdwy]/` regex
- **Decimal toNumber() is lossy** — `CerialDecimal.toNumber()` truncates to IEEE 754 double precision. Use `.toString()` for lossless serialization
- **Bytes no @default** — `@default` not supported on Bytes fields. SurrealDB needs `<bytes>''` syntax which `@default` parser can't express
- **Geometry no spatial operators** — No `nearTo`, `within`, `intersects` filters. Standard equality comparison only. Spatial operators are a separate future feature
- **Geometry no OrderBy** — Geometry fields excluded from OrderBy types (not orderable)
- **Number is distinct from Float** — `Number` maps to SurrealDB `number` (auto-detect), not `float`. `Float` maps to `float` (always IEEE 754 double). `Int` maps to `int` (always integer). All three produce `number` in TypeScript
