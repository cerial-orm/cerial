# Cerial - Agent Guide

A Prisma-like ORM for SurrealDB. Runtime: **Bun**. Language: **TypeScript**.

## Commands

All ORM commands run from `apps/orm/`:

```bash
# ORM (run from apps/orm/)
bun install                                              # Install dependencies
bun test                                                 # Run all tests
bun test apps/orm/tests/e2e/ --preload apps/orm/tests/e2e/preload.ts  # E2E tests (from repo root, requires SurrealDB running)
bun run typecheck                                        # Type check generated types (ts-toolbelt)
bunx tsc --noEmit                                        # Full TypeScript check
bun run generate:test-client                            # Generate test client from schema
bunx cerial init                                        # Initialize config file
bunx cerial init --yes                                  # Non-interactive init
bunx cerial generate -C ./cerial.config.ts              # Generate with specific config
bunx cerial generate -n auth                            # Generate specific schema only
bunx cerial format -s ./schemas                         # Format schema files
bunx cerial format --check                              # Check mode (CI)
bunx cerial format --watch -s ./schemas                 # Watch mode
bunx cerial generate --watch --format                   # Generate with auto-format

# VS Code extension (from repo root)
cd apps/vscode-extension && bun run test                 # Run extension tests
cd apps/vscode-extension && bun run build                # Build the extension
```

## Project Structure

```
cerial/
├── apps/
│   ├── orm/                         # ORM package (workspace member: cerial)
│   │   ├── bin/cerial.ts            # CLI entry point
│   │   ├── src/
│   │   │   ├── cli/                         # CLI commands, validators, schema resolution, config
│   │   │   │   ├── commands/                #   Command registry (generate, init)
│   │   │   │   ├── config/                  #   Config types, loader, resolver, validator, defineConfig
│   │   │   │   ├── resolvers/               #   Schema resolution, convention markers
│   │   │   │   ├── validators/              #   CLI option + schema validators
│   │   │   │   └── watcher.ts               #   File watcher with per-schema isolation
│   │   │   ├── formatter/                   # .cerial file formatter
│   │   │   │   ├── aligner.ts               #   Column alignment logic
│   │   │   │   ├── comment-attacher.ts      #   Comment token attachment
│   │   │   │   ├── formatter.ts             #   Core formatCerialSource() function
│   │   │   │   ├── inline-printer.ts        #   Enum/literal/tuple printer
│   │   │   │   ├── printer.ts               #   Model/object block printer
│   │   │   │   ├── rules.ts                 #   Decorator ordering, config resolution
│   │   │   │   └── types.ts                 #   FormatConfig, FormatResult types
│   │   │   ├── client/                      # Runtime client, Model class, Proxy factory
│   │   │   ├── connection/                  # Connection manager, config types
│   │   │   ├── generators/                  # Code generation from AST
│   │   │   │   ├── client/                  #   Client template + writer
│   │   │   │   ├── metadata/               #   Model registry generator
│   │   │   │   ├── migrations/             #   DEFINE TABLE/FIELD/INDEX generator
│   │   │   │   └── types/                  #   Interface, derived, where, method, enum generators
│   │   │   │       └── enums/              #     Enum type name helpers + generators
│   │   │   ├── parser/                      # Schema lexer, tokenizer, parser → AST
│   │   │   │   └── types/                  #   Field types, decorators, constraints parsers
│   │   │   ├── resolver/                    # Inheritance resolution phase
│   │   │   │   ├── filter.ts                #   Pick/omit field filtering
│   │   │   │   ├── inheritance-resolver.ts  #   Topological sort + field merging
│   │   │   │   └── index.ts                 #   Barrel exports
│   │   │   ├── query/                       # Query building + execution
│   │   │   │   ├── builders/               #   Select, insert, update, delete, nested, relation builders
│   │   │   │   ├── compile/                #   Query fragments, variable allocator
│   │   │   │   ├── filters/                #   Operator handlers (comparison, string, array, logical, special)
│   │   │   │   ├── mappers/                #   Result mapper (RecordId → CerialId)
│   │   │   │   ├── transformers/           #   Data transformer (RecordIdInput → RecordId, defaults)
│   │   │   │   └── validators/             #   Data + where validation
│   │   │   ├── types/                       # Shared TS types (metadata, query, utility, AST)
│   │   │   ├── utils/                       # CerialId, string/array/type/validation utils
│   │   │   └── main.ts                      # Main exports
│   │   ├── tests/
│   │   │   ├── unit/                        # Unit tests (no DB)
│   │   │   ├── integration/                 # Integration tests (DB required)
│   │   │   ├── e2e/                         # End-to-end tests
│   │   │   │   ├── schemas/                 #   49 .cerial test schemas (organized by feature)
│   │   │   │   │   ├── core/               #     Core model schemas
│   │   │   │   │   ├── relations/          #     Relation schemas
│   │   │   │   │   ├── decorators/         #     Decorator schemas
│   │   │   │   │   ├── complex-types/      #     Object/tuple/literal/enum schemas
│   │   │   │   │   ├── data-types/         #     UUID/number/duration/etc schemas
│   │   │   │   │   └── features/           #     Typed-ids, unset, etc schemas
│   │   │   │   ├── generated/               #   Generated client (gitignored)
│   │   │   │   ├── core/                    #   Core CRUD, select, include, findAll, introspection tests (8 files)
│   │   │   │   ├── relations/               #   Relation E2E tests (89 files)
│   │   │   │   ├── decorators/              #   Decorator E2E tests (43 files)
│   │   │   │   ├── complex-types/           #   Object/tuple/literal/enum tests (46 files)
│   │   │   │   ├── data-types/              #   UUID/number/duration/decimal/bytes/geometry/any tests (37 files)
│   │   │   │   ├── features/                #   Typed-ids, unset, transactions, on-before-query, pagination tests (35 files)
│   │   │   │   ├── negative/                #   Cross-cutting error/validation tests (5 files)
│   │   │   │   ├── typechecks/              #   36 compile-time type checks (6 subdirectories)
│   │   │   │   ├── multi-schema/            #   Multi-schema E2E tests (4 files)
│   │   │   │   ├── preload.ts               #   Generates client before tests
│   │   │   │   └── test-helper.ts           #   Shared test infrastructure
│   │   │   └── generators/                  # Generator tests
│   │   ├── index.ts                         # Re-exports main.ts
│   │   ├── package.json                     # name: "cerial"
│   │   └── tsconfig.json                    # extends ../../tsconfig.json
│   └── vscode-extension/                    # VS Code extension (non-workspace member)
│       ├── client/
│       ├── server/src/
│       ├── tests/
│       ├── syntaxes/
│       └── package.json                     # name: "cerial" (marketplace identity)
├── libs/                                    # Shared packages scaffold (future)
│   └── .gitkeep
├── docs/                                    # GitHub Pages documentation (Jekyll + just-the-docs)
├── .github/workflows/                       # CI/CD workflows
├── package.json                             # Workspace root (@cerial/monorepo, private)
├── tsconfig.json                            # Shared base TypeScript config
├── biome.json                               # Shared formatter/linter
└── LICENSE                                  # Apache 2.0
```

### Key Files

| File                                                          | Purpose                                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/orm/src/utils/cerial-id.ts`                            | `CerialId` class and `RecordIdInput` union type                                               |
| `apps/orm/src/query/transformers/data-transformer.ts`        | Input transformation, `@default`/timestamp handling, NONE/null logic                          |
| `apps/orm/src/query/mappers/result-mapper.ts`                | Output transformation (RecordId → CerialId)                                                   |
| `apps/orm/src/query/builders/nested-builder.ts`              | Nested create/connect/disconnect in transactions                                              |
| `apps/orm/src/generators/types/derived-generator.ts`         | Generates Select, OrderBy, GetPayload, Include types                                          |
| `apps/orm/src/generators/types/interface-generator.ts`       | Generates model/object interfaces                                                             |
| `apps/orm/src/generators/types/where-generator.ts`           | Generates Where types with nested/object filtering                                            |
| `apps/orm/src/generators/client/writer.ts`                   | Writes client files, contains `ResolveFieldSelect` / `ApplyObjectSelect` / `ApplyTupleSelect` |
| `apps/orm/src/cli/validators/relation-validator.ts`          | Validates relation rules (PK/non-PK, @key, @onDelete)                                         |
| `apps/orm/src/query/filters/registry.ts`                     | Operator handler registry                                                                     |
| `apps/orm/src/generators/types/enums/name-helpers.ts`        | Enum/literal type name resolution (isEnum dispatch)                                           |
| `apps/orm/src/generators/client/enum-writer.ts`              | Writes per-enum type files                                                                    |
| `apps/orm/src/utils/cerial-uuid.ts`                          | `CerialUuid` class and `CerialUuidInput` union type                                           |
| `apps/orm/src/utils/cerial-duration.ts`                      | `CerialDuration` class and `CerialDurationInput` union type                                   |
| `apps/orm/src/utils/cerial-decimal.ts`                       | `CerialDecimal` class with arithmetic, `CerialDecimalInput` union type                        |
| `apps/orm/src/utils/cerial-bytes.ts`                         | `CerialBytes` class and `CerialBytesInput` union type                                         |
| `apps/orm/src/utils/cerial-geometry.ts`                      | `CerialGeometry` hierarchy (7 subtypes) and `CerialGeometryInput` union type                  |
| `apps/orm/src/utils/cerial-any.ts`                           | `CerialAny` recursive union type                                                              |
| `apps/orm/src/utils/cerial-set.ts`                           | `CerialSet<T>` branded array type                                                             |
| `apps/orm/src/cli/config/types.ts`                           | `CerialConfig`, `SchemaEntry`, `ResolvedSchemaEntry` types                                    |
| `apps/orm/src/cli/config/loader.ts`                          | Config file loader (`cerial.config.ts`/`.json`)                                               |
| `apps/orm/src/cli/config/define-config.ts`                   | `defineConfig()` identity helper for type-safe config                                         |
| `apps/orm/src/cli/commands/init.ts`                          | `cerial init` interactive command                                                             |
| `apps/orm/src/cli/watcher.ts`                                | File watcher with debounce and per-schema isolation                                           |
| `apps/orm/src/formatter/formatter.ts`                        | Core `formatCerialSource()` function — validates, tokenizes, attaches comments, aligns, prints |
| `apps/orm/src/client/cerial-transaction.ts`                  | `CerialTransaction` class, transaction proxy factory                                          |

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
- E2E tests MUST use `--preload apps/orm/tests/e2e/preload.ts` (from repo root) or `--preload ./tests/e2e/preload.ts` (from `apps/orm/`) or generated client won't exist

**Test locations:**

| Location                                                          | Type                                                          | Count    |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| `apps/orm/tests/unit/`                                            | Unit tests (no DB)                                            | ~2683    |
| `apps/orm/tests/integration/`                                     | Integration (DB required)                                     | ~49      |
| `apps/orm/tests/e2e/core/`                                        | Core CRUD, select, include, findAll, introspection            | 8 files  |
| `apps/orm/tests/e2e/relations/`                                   | Relation E2E tests                                            | 89 files |
| `apps/orm/tests/e2e/decorators/`                                  | Decorator E2E tests                                           | 43 files |
| `apps/orm/tests/e2e/complex-types/`                               | Object/tuple/literal/enum tests                               | 46 files |
| `apps/orm/tests/e2e/data-types/`                                  | Data type tests (uuid, number, duration, decimal, bytes, etc) | 37 files |
| `apps/orm/tests/e2e/features/`                                    | Typed-ids, unset, transactions, on-before-query, pagination   | 35 files |
| `apps/orm/tests/e2e/features/extends/`                            | Extends E2E tests (model, object, tuple, enum, literal, pick/omit, negative) | 11 files |
| `apps/orm/tests/e2e/negative/`                                    | Cross-cutting error/validation tests                          | 5 files  |
| `apps/orm/tests/e2e/typechecks/`                                  | Compile-time type checks                                      | 36 files |
| `apps/orm/tests/e2e/typechecks/features/extends.check.ts`        | Compile-time type checks for extends                          | 1 file   |
| `apps/orm/tests/e2e/multi-schema/`                                | Multi-schema E2E tests (config, convention, backward compat)  | 4 files  |

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

- `apps/orm/tests/unit/query/nested-builder.test.ts`
- `apps/orm/tests/unit/query/delete-builder.test.ts`
- `apps/orm/tests/unit/query/delete-unique-builder.test.ts`
- `apps/orm/tests/unit/query/update-unique-builder.test.ts`
- `apps/orm/tests/unit/generators/type-mapper.test.ts`
- `apps/orm/tests/generators/migrations.test.ts`
- `apps/orm/tests/integration/migration.test.ts`

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

- **Biome unused prefix** - Biome auto-prefixes unused variables/params with `_` (e.g., `x` → `_x`). When you later use that variable, remove the `_` prefix first (`_x` → `x`), unless `_` has a separate meaning in that context (e.g., lodash import)
- **Import ordering when editing** - When adding new imports to a file, always add the **usage code first**, then add the `import` statement. Biome removes imports it considers unused, so if you add an import before the code that uses it (e.g., across separate edit operations), `bun run format` will strip it. Write the call/reference first, then add the import — this guarantees Biome sees it as used
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


### Changelog Rules (CRITICAL)

Each package (ORM and extension) maintains its own changelog. Changelogs live **inside** each package directory, not at the repository root.

**Active file:** `CHANGELOG.md` in each package — contains `[Unreleased]` section and all patch releases for the **current minor version**.

**Archive:** When bumping to the next minor version, move the old minor's entries to `changelogs/{major}/{minor}.md`.

#### Format

Follow [Keep a Changelog](https://keepachangelog.com) format. Categories under each version:

- `### Added` — New features
- `### Changed` — Changes to existing features
- `### Fixed` — Bug fixes
- `### Removed` — Removed features
- `### Deprecated` — Features marked for future removal

#### Active CHANGELOG.md structure

```markdown
# Changelog

All notable changes will be documented in this file.
For previous versions, see [changelogs/](changelogs/).

## [Unreleased]

### Added

- New feature description

## [0.1.2] - 2025-03-15

### Fixed

- Bug fix description

## [0.1.1] - 2025-03-10

### Added

- Feature description

## [0.1.0] - 2025-03-01

### Added

- Initial minor release features
```

#### Archive structure

When releasing `0.2.0`, move all `0.1.x` entries to `changelogs/0/1.md`:

```
package/
├── CHANGELOG.md          # [Unreleased] + current minor (0.2.x)
└── changelogs/
    └── 0/                # Major version 0
        ├── 0.md          # All 0.0.x patches in one file
        └── 1.md          # All 0.1.x patches in one file
```

The archived file keeps the same format — version headers and categorized entries — just without the `[Unreleased]` section.

#### Rules
- **Never edit released version entries** — if a released entry has a typo, fix it in the next patch's `### Fixed`
- **Version bumps move `[Unreleased]` to a versioned header** — `## [Unreleased]` becomes `## [x.y.z] - YYYY-MM-DD`, and a fresh empty `## [Unreleased]` is added above
 **Minor version bump triggers archival** — move the previous minor's entries to `changelogs/{major}/{minor}.md`
- **Both ORM and extension follow this system independently** — they have separate version numbers and separate changelogs
- **Monorepo migration** — when the repo moves to `apps/orm` + `apps/vscode-extension`, changelogs move with their respective packages
### Commit Rules

#### Atomic commits

Each commit should represent **one logical change**. Split work into small, focused commits — one per feature, fix, or concern. This keeps the git history readable and makes each change easy to review, revert, or cherry-pick.

**Split by:**
- Different features or behaviors → separate commits
- Different directories or modules → separate commits
- Implementation vs tests (unless tightly coupled) → separate commits
- Docs vs code → separate commits

**Combine only when:**
- Splitting would break compilation (e.g., type change + all call sites)
- Implementation file + its direct test file for a single feature

#### Multi-commit issue fixes

Large fixes or features that span multiple types of changes should use multiple commits, each with its own changelog entry in the appropriate category. Example:

```
Issue: "Inlay hints show wrong labels"

Commit 1: fix(extension): update inlay hint labels for @createdAt/@updatedAt
  → CHANGELOG: ### Changed — Rename 'server-set' hint label to 'auto-generated'

Commit 2: feat(extension): add 'sets on create' inlay hint for @default
  → CHANGELOG: ### Added — Inlay hint for @default fields showing 'sets on create'

Commit 3: docs(extension): update README and settings for new hint labels
  → No changelog entry (docs-only, user behavior unchanged)
```

Each commit adds its own entry to `[Unreleased]` under the correct category (`### Added`, `### Changed`, `### Fixed`, etc.).

#### Amend policy

**Amend the previous commit** when a small follow-up change is the same kind of task as the commit it follows — e.g., fixing a typo in a just-committed file, adjusting wording in a just-added doc section, or tweaking a value in a just-written config.

**Do NOT amend when:**
- The previous commit has already been pushed to remote
- The follow-up is a different kind of change (new feature vs fix vs docs)
- The follow-up affects different files or modules than the original commit
- Someone else authored the previous commit

### Testing Rules

- **No `as any` or blanket type casting in tests** - If types don't match runtime behavior, fix the type generators or source types. Use specific type assertions (`as User`, `as { id: string }`) ONLY when narrowing `unknown` (e.g., `prevResults[0] as { id: CerialId }`) — never `as any`. This applies to ALL tests (unit, integration, E2E)
  - Exception: `@ts-expect-error` with an explanation comment is allowed ONLY for negative tests — testing runtime error handling for operations the type system correctly prevents
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
- **Test file organization (ALL tests — unit, integration, E2E)** — Split tests into multiple focused files, one per sub-topic or domain. Do NOT put all tests in a single large file. This applies to unit tests (`apps/orm/tests/unit/`), integration tests, and E2E tests equally. Follow the pattern used by `apps/orm/tests/e2e/objects/`, `apps/orm/tests/e2e/tuples/`, and `apps/orm/tests/unit/resolver/`:
  - One file per sub-topic (e.g., `model-inheritance.test.ts`, `object-inheritance.test.ts`, `validation.test.ts`, `filter.test.ts`)
  - Shared helpers (factories, constants, setup) extracted into a common `helpers.ts` file and imported — do NOT duplicate helpers across test files
  - Each file should be independently runnable (e.g., `bun test apps/orm/tests/unit/resolver/model-inheritance.test.ts`)
  - For E2E tests specifically, use `--preload apps/orm/tests/e2e/preload.ts`
- **E2E test global setup pattern (CRITICAL)** — The E2E preload (`apps/orm/tests/e2e/preload.ts`) runs `globalCleanup()` ONCE before any test file executes. This removes all tables and runs `migrate()` to establish the correct schema. Individual test files must NOT redo this work:
  - `beforeAll`: Call `cleanupTables(client, YOUR_TABLES)` — this only does `DELETE FROM` (data cleanup, no schema changes)
  - `beforeEach`: Call `truncateTables(client, YOUR_TABLES)` — same lightweight `DELETE FROM` per-test
  - **Do NOT** call `REMOVE TABLE`, `resetMigrationState()`, or `client.migrate()` inside test files — these run once globally in preload
  - **Do NOT** manually execute `DEFINE TABLE` or schema DDL in test files — `migrate()` handles this
  - **Why**: Multiple test files running `REMOVE TABLE + migrate(134 models)` concurrently causes race conditions (tables removed while other tests query them, 134 competing DEFINE statements)
- **E2E concurrency** — Always run E2E tests with `--concurrency 5` via `bun run test:e2e`. Running without concurrency limit works but `--concurrency 5` provides more predictable timing. Never rely on test file execution order
- **New tables in E2E tests** — When adding a new schema file to `apps/orm/tests/e2e/schemas/`, add its table names to the `tables` registry in `apps/orm/tests/e2e/test-helper.ts`. This ensures `globalCleanup()` covers them. Also update the relevant `*_TABLES` constant if the tables belong to root, index, or typed-id groups

### SurrealDB Reserved Keywords

Do NOT use SurrealDB reserved keywords as field names, model names, or object names in `.cerial` schema files. SurrealDB's parser will misinterpret them, causing migration failures. Known reserved keywords that cause issues: `info`, `select`, `create`, `update`, `delete`, `from`, `where`, `table`, `field`, `type`, `value`, `index`, `for`, `on`, `set`, `define`, `remove`, `begin`, `commit`, `cancel`, `return`, `limit`, `start`, `order`, `group`, `fetch`, `timeout`, `parallel`, `content`, `merge`, `patch`, `let`, `if`, `else`, `then`, `end`, `throw`, `break`, `continue`, `none`, `null`, `true`, `false`, `and`, `or`, `not`, `is`, `in`, `contains`, `inside`, `outside`, `intersects`, `only`, `full`, `as`. When in doubt, avoid common SQL/SurrealQL keywords as identifiers.

### When Adding New Features

1. Implement the feature in `apps/orm/src/`
2. Add/update unit tests in `apps/orm/tests/unit/`
3. Add E2E test schemas in `apps/orm/tests/e2e/schemas/` if needed
4. Add E2E tests in `apps/orm/tests/e2e/`
5. Run `bun run generate:test-client` to regenerate test client (from `apps/orm/`)
6. Run full test suite: `bun test` (from `apps/orm/`)
7. Run type check: `bunx tsc --noEmit` (from `apps/orm/`)
8. Update documentation in `docs/`
9. Update the formatter to handle the new construct in `apps/orm/src/formatter/printer.ts` (or `inline-printer.ts`), add formatting tests, and verify idempotency
10. **Update the VS Code extension** if the feature adds or changes schema syntax:
    - If new keyword/block type: update TextMate grammar (`apps/vscode-extension/syntaxes/cerial.tmLanguage.json`)
    - If new field type: update completion provider (`apps/vscode-extension/server/src/providers/completion.ts`), hover docs (`apps/vscode-extension/server/src/data/hover-docs.ts`), and semantic tokens
    - If new decorator: update completion provider (decorator list + context filtering), hover docs, and code actions if applicable
    - If new validator: update diagnostics provider (`apps/vscode-extension/server/src/providers/diagnostics.ts`) to surface the new errors
    - Run extension tests: `cd apps/vscode-extension && bun run test`
    - Rebuild extension: `cd apps/vscode-extension && bun run build`

### When Adding a New Operator

1. Create handler in `apps/orm/src/query/filters/<category>/<operator>-handler.ts`
2. Register in `apps/orm/src/query/filters/registry.ts`
3. Update where types in `apps/orm/src/generators/types/where-generator.ts`
4. Add unit tests
5. Add E2E tests
6. Update `docs/filtering/` page
7. Update the VS Code extension if the operator introduces new syntax or keywords:
    - Run `cd apps/vscode-extension && bun run test` to verify no regressions

### When Adding a New Field Type

1. Create parser in `apps/orm/src/parser/types/field-types/<type>-parser.ts`
2. Update `SchemaFieldType` in `apps/orm/src/types/common.types.ts`
3. Update type mappings in generators and validators
4. Add tests
5. Update `docs/schema/field-types.md`
6. Update the VS Code extension:
   - Add the type to completion suggestions in `apps/vscode-extension/server/src/providers/completion.ts`
   - Add hover documentation in `apps/vscode-extension/server/src/data/hover-docs.ts`
   - Verify TextMate grammar highlights the new type (`apps/vscode-extension/syntaxes/cerial.tmLanguage.json`)
   - Add extension unit tests for the new type
   - Run `cd apps/vscode-extension && bun run test`

### When Adding a New Decorator

1. Create parser in `apps/orm/src/parser/types/field-decorators/<decorator>-parser.ts`
2. Update generator to handle the decorator
3. Update migration generator if it affects DB schema
4. Add tests
5. Add page in `docs/schema/decorators/`
6. Update the VS Code extension:
   - Add the decorator to completion suggestions in `apps/vscode-extension/server/src/providers/completion.ts`
   - Add hover documentation in `apps/vscode-extension/server/src/data/hover-docs.ts`
   - Verify TextMate grammar highlights the new decorator (`apps/vscode-extension/syntaxes/cerial.tmLanguage.json`)
   - Update code actions if the decorator has common misuse patterns (`apps/vscode-extension/server/src/providers/code-actions.ts`)
   - Add extension unit tests for the new decorator
   - Run `cd apps/vscode-extension && bun run test`

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
- **CerialQueryPromise** = Lazy thenable returned by model methods. Auto-executes on `await`, collectible by `$transaction`. Inside transaction proxies, converted to eager Promises that execute immediately on the transaction connection
- **$transaction** = Three modes: (1) Array: `client.$transaction([q1, q2, fn])` — items can be CerialQueryPromise OR sync/async functions receiving `prevResults`. Any throw = full rollback. (2) Callback: `client.$transaction(async (tx) => { ... })` — `tx` has model access (`tx.User.create()`). Throw-to-rollback. Supports `{ timeout }` option. (3) Manual: `const txn = await client.$transaction()` — dual access: `txn.User.create()` (model proxy) OR `client.db.User.create({ txn })` (pass as option). `txn.commit()` / `txn.cancel()` for lifecycle. `await using` for automatic cleanup via `Symbol.asyncDispose`
- **CerialTransaction** = Transaction handle for manual mode. State machine: `active` → `committed` | `cancelled`. Has `commit()`, `cancel()`, `state`, `Symbol.asyncDispose` (auto-cancel on scope exit). Proxy provides model access (`txn.User.create()`). Nesting blocked (`txn.$transaction` throws)
- **Uuid** = UUID identifier field type. `CerialUuid` wrapper with `.toString()`, `.equals()`, `.toNative()`. Input: `CerialUuidInput = string | CerialUuid | Uuid (SDK)`. Supports comparison operators and OrderBy. Works in objects, tuples, literals
- **UUID decorators** = `@uuid` (v7 default), `@uuid4`, `@uuid7` for server-side auto-generation (`DEFAULT rand::uuid()`). Field becomes optional in CreateInput. Model + object fields only (NOT tuples). Mutually exclusive with `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`, `@now`, and each other
- **Number** = Auto-detect numeric type (`int` or `float`). SurrealDB decides representation based on value. Maps to `number` in TypeScript (same as Int/Float). Distinct SurrealQL type `number` (not aliased to `float`). Supports all numeric comparison operators and OrderBy
- **Duration** = Time duration. `CerialDuration` wrapper with accessors (`.hours`, `.minutes`, `.seconds`, etc.), `.toString()`, `.compareTo()`, `.toNative()`. Input: `CerialDurationInput = string | CerialDuration | Duration (SDK)`. String format: `'2h30m15s'`. Supports comparison operators and OrderBy
- **Decimal** = Arbitrary-precision decimal number. `CerialDecimal` wrapper with arithmetic (`.add()`, `.sub()`, `.mul()`, `.div()`), `.toString()`, `.toNumber()` (lossy!), `.toNative()`. Input: `CerialDecimalInput = number | string | CerialDecimal | Decimal (SDK)`. Supports comparison operators and OrderBy
- **Bytes** = Binary data. `CerialBytes` wrapper with `.toUint8Array()`, `.toBuffer()`, `.toBase64()`, `.toString()`. Input: `CerialBytesInput = Uint8Array | string (base64) | CerialBytes`. Equality-only WHERE operators (no gt/lt). OrderBy supported (lexicographic). No `@default` support
- **Geometry** = Geospatial data with 7 subtypes via decorators (`@point`, `@line`, `@polygon`, `@multipoint`, `@multiline`, `@multipolygon`, `@collection`). Bare `Geometry` = all subtypes. Multi-type: `Geometry @point @polygon`. CerialGeometry class hierarchy. Point input shorthand: `[lon, lat]`. Equality-only WHERE. No OrderBy. No spatial operators (future feature)
- **Any type** = `Any` field stores any SurrealDB value. `CerialAny` recursive union (NOT bare TS `any`). No `?`, no `@nullable` (TYPE any already accepts NONE/null). Full WHERE operator set. Excluded from OrderBy. Not allowed in tuple elements
- **@set decorator** = `String[] @set` generates `set<T>` instead of `array<T>`. Auto-dedup and sort at DB level. Output type `CerialSet<T>` (branded array). Input accepts regular arrays. Not allowed on Decimal[], Object[], Tuple[], Record[]. Mutually exclusive with @distinct/@sort
- **findAll()** = Alias for `findMany()` with no options. Returns all records in the table as `T[]`. No `where`, `select`, `include`, `orderBy`, `limit`, or `offset` parameters
- **Model introspection** = `getMetadata()`, `getName()`, `getTableName()` — available on every model instance for runtime metadata access. `getMetadata()` returns full `ModelMetadata` (name, table, fields, relations). `getName()` returns the model name. `getTableName()` returns the SurrealDB table name
- **Path filtering** = Three-tier filter system for controlling which `.cerial` files are processed. `ignore` (absolute blacklist), `exclude` (overridable blacklist), `include` (whitelist override). Supports `.cerialignore` files at project root and per-schema-folder. Cascade: `.cerialignore` → root config → folder `.cerialignore` → folder config. Config fields on `CerialConfig`, `SchemaEntry`, `FolderConfig`
- **Extends** = Schema-level inheritance for all type kinds (model, object, tuple, enum, literal). `extends ParentName` inherits all fields/values. `extends ParentName[field1, field2]` picks specific fields. `extends ParentName[!field]` omits fields. Resolved at compile time — generators see flattened output. Single parent only, no cross-kind
- **Abstract** = Model-only keyword. `abstract model Name { ... }` suppresses table generation, TS type generation, client accessor, and registry entry. All models (concrete or abstract) can ONLY extend abstract models. Concrete extends concrete FORBIDDEN, abstract extends concrete FORBIDDEN
- **!!private** = Field modifier preventing override in child types. Placed at end of field line: `fieldName Type !!private`. Allowed on model fields, object fields, tuple elements. NOT on enum values or literal variants. Does NOT prevent omitting from pick lists — only prevents redefining in child body

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
- `$transaction` array mode items are independent, but function items receive `prevResults` from preceding items. Callback and manual modes share a single transaction connection
- WebSocket is required for `$transaction` — SDK native transactions only work over WebSocket. If user connects via HTTP, Cerial auto-creates a secondary WS connection. `closeHttp()` drops HTTP, `reopenHttp()` restores it. WS is always kept alive
- `$transaction` nesting is blocked — accessing `$transaction` on a transaction client throws immediately. SurrealDB has no savepoints
- Manual mode `txn` must be committed or cancelled — forgetting to call `commit()` or `cancel()` causes "transaction dropped" warnings. Use `await using` for automatic cleanup
- Transaction conflict retry — Cerial does NOT retry by default (0 retries). Users opt in via `TransactionOptions.retries` and optional `backoff` function. Each retry begins a fresh transaction. Applies to array and callback modes only (manual mode is user-controlled)
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
- `.cerialignore` applies even with `-s` flag — it's project-level filtering
- `include` without `exclude` is a no-op — `include` only overrides exclusions, not a whitelist-only filter
- Parent-directory negation in `.cerialignore`: `dir/` then `!dir/keep.cerial` doesn't work (git behavior) — use config `include` instead
- No `../` pattern escaping in filter config — patterns cannot escape their scope directory
- Abstract models produce no table, no TS types, no client accessor, no registry entry — they are consumed during inheritance resolution and then discarded
- `!!private` prevents override only — private fields CAN be freely omitted from pick lists or excluded via omit
- Pick/omit is mutually exclusive per extends clause — cannot mix `[field1, !field2]`
- Extends is resolved at compile time only — no runtime inheritance awareness
- Extends only works within same schema entry (same generation run). Cross-schema extends is impossible
- Pick/omit validates against parent's own fields only (not inherited from grandparent)
- **Monorepo: ORM is a workspace member** — The ORM lives in `apps/orm/`. Root `package.json` has `workspaces: ["apps/orm", "libs/*"]` (NOT `"apps/*"`). Run ORM commands from `apps/orm/` or use `bun run --filter cerial <script>` from repo root
- **Monorepo: extension is NOT a workspace member** — Both packages are named `"cerial"` (name collision prevents workspace membership). The VS Code extension in `apps/vscode-extension/` has its own `bun.lock` and manages its own dependencies independently. Run extension commands from `apps/vscode-extension/`
- **Monorepo: changelog locations** — ORM changelog: `apps/orm/CHANGELOG.md`. VS Code extension changelog: `apps/vscode-extension/CHANGELOG.md`. Each package has its own `changelogs/` archive directory inside its package folder
