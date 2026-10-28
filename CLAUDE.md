# Cerial - Agent Guide

A Prisma-like ORM for SurrealDB. Runtime: **Bun**. Language: **TypeScript**.

Release, branching and commit process: `CONTRIBUTING.md`.
Commit hooks (run `bun run setup` once per clone) and what they refuse: `tooling/hooks/README.md`.
User-facing feature documentation: `apps/docs/content/docs/` — 160+ pages covering
every field type, decorator, query method and filter operator. Do not restate it here.

## Commands

Run from `apps/orm/` unless noted.

```bash
bun test tests/unit tests/generators   # database only for the escaping suite's live checks
bun run test:integration               # database needed
bun run test:e2e                       # database needed; preloads the generated client
bun run test:full                      # regenerate client, typecheck, then every suite
bun run generate:test-client           # regenerate the e2e client from tests/e2e/schemas
bun run typecheck                      # tsc over tests/e2e/typechecks/*.check.ts
bunx tsc --noEmit                      # apps/orm only
# Other scopes, each with its own gate; a repo-root `tsc` mixes every workspace's
# globals and reaches apps/docs virtual modules, so its error count is mostly artefact:
#   apps/vscode-extension: bunx tsc --noEmit -p .
#   tooling/ (repo root):  bunx tsc --noEmit -p tooling
#   apps/docs:             next build
bun run build                          # required before test:e2e after changing src/
bun run format                         # oxfmt --write, then oxlint --fix
bun run format:check                   # oxfmt --check, then oxlint; what CI runs

bunx cerial init | generate | format    # the CLI; --help for flags
```

Bare `bun test` sweeps the e2e suites too and fails without a database. Prefer an
explicit path.

From the repo root, `bun run orm:*` and `ext:*` proxy into each workspace. The
workspace members are `apps/orm` (`cerial`), `apps/vscode-extension`
(`cerial-vscode`), `apps/docs` and `libs/*`; they share the root `bun.lock`.

## Layout

`apps/orm/src/` is organised by pipeline stage, and each folder has an `index.ts`
barrel that consumers import from:

| Folder | Owns |
|---|---|
| `parser/` | `.cerial` text to `SchemaAST` |
| `resolver/` | `extends` inheritance resolution |
| `generators/` | AST to TypeScript types, client, model registry, migrations |
| `query/` | builders, filters, validators, transformers, result mappers |
| `client/` | runtime client, `Model`, proxies, transactions |
| `cli/` | commands, config, schema resolution, watcher |
| `formatter/` | the `.cerial` formatter |
| `utils/` | `CerialId`, `CerialUuid`, `CerialDecimal` and the other wrappers |

Use Glob or `ls` for anything more specific; a file tree here goes stale.

## Architecture

```
Schema (.cerial files) → Parser (AST) → Generators → TypeScript Client
```

- **Parser** - Lexes/tokenizes `.cerial` files into `SchemaAST` (models + objects + tuples + enums)
- **Generators** - Produces TypeScript types, client class, model registry, migrations
- **Query Builder** - Converts typed query objects into parameterized SurrealQL
- **Client** - Proxy-based model access (`client.db.User.findMany(...)`)

## Testing

**The integration and e2e suites need SurrealDB on `http://127.0.0.1:8000`**, with
`root`/`root` and namespace and database both `main`. That URL is hardcoded in
`tests/e2e/test-helper.ts`.

```bash
docker compose up -d surrealdb     # from the repo root
docker compose down                # when finished
```

The committed `docker-compose.yml` pins `surrealdb/surrealdb:v3.3.0` with the
`memory` backend, matching what CI tests against. Any SurrealDB answering on 8000
works just as well, so an instance you already run is fine.

Use the `memory` backend. Against a disk backend the e2e run roughly doubles and a
concurrent many-to-many transaction test fails on lock contention that memory does
not hit.

Only one e2e run may exist on the machine at a time, and that includes a verification run
you start yourself. Every run's preload calls `globalCleanup()`, which removes all tables and
re-runs `migrate()`, so two runs produce the race where tables vanish while another file queries
them: failures land on whichever tests were mid-flight, differ between runs, and vanish when a
test is run on its own, which reads convincingly like a flaky suite. Check with
`pgrep -f "bun test tests/e2e"` first, and when an agent reports its work done, confirm its
process has exited rather than inferring it from the report.

Never start a second instance to work around a refused connection: that means the
wrong port or an unhealthy container, and a duplicate hides it while giving you a
second copy of the data.

E2E tests must run via `bun run test:e2e` or `bun run test:e2e:parallel`, which supply
`--preload ./tests/e2e/preload.ts`. Without it the generated client does not exist.

**E2E global setup (CRITICAL).** The preload runs `globalCleanup()` once per database
(the one database, or each parallel worker's own), before any test file, removing all
tables and running `migrate()`. Test files must not redo it:

- `beforeAll`: `cleanupTables(client, YOUR_TABLES)` — `DELETE FROM` only
- `beforeEach`: `truncateTables(client, YOUR_TABLES)` — same
- Never `REMOVE TABLE`, `resetMigrationState()` or `client.migrate()` in a test file
- The exception is a spec that owns everything it touches: the multi-schema specs build their own
  clients from their own fixtures and migrate each themselves, because migration sequencing across
  two clients is what they test. The commit gate lists them by name; add to that list only when a
  spec's tables are invisible to the registry and to every other file
- Never hand-write `DEFINE TABLE` or other DDL; `migrate()` owns the schema

Concurrent `REMOVE TABLE` plus a full `migrate()` across files causes races: tables
vanish while another file queries them.

**Parallelism.** The committed default, `bun run test:e2e`, is sequential. For speed,
`bun run test:e2e:parallel` is safe: the client is generated once per run, and each worker
gets its own database `main_w<id>` in the shared instance, migrated once. `CERIAL_E2E_WORKERS`
sets the worker count (default 4). Files inside one registry group still share that group's
tables within a worker, so never rely on file order. Never pass `--parallel` by hand without
the preload, and only one e2e run (sequential or parallel) may exist on the machine at a time.
When adding a schema under `tests/e2e/schemas/`, register its tables in that
registry, and in the matching `*_TABLES` constant if it belongs to a group.

**VS Code extension tests (CRITICAL).** Only one `vscode-test` process may run on
the machine at a time. `bun run test:integration` and `test:e2e` in
`apps/vscode-extension` launch VS Code; a second instance makes the first fail with
cryptic errors. Never give two parallel agents a task that runs them. Safe to
parallelise: `bun test`, `test:unit`, `test:grammar`.

**Golden snapshot.** The golden snapshot, `tests/generators/golden-snapshot.test.ts`, pins the resolved AST, emitted DDL,
runtime registry and generated types for every e2e schema. When it fails, find out why before touching
it. Re-approve only for an intended, reviewed generator change, with `bun run snapshot:update` from
`apps/orm/` and the reason in the commit body. Rules and layout: `apps/orm/tests/generators/README.md`.

**Sandbox testing** means running raw SurrealQL against the live instance to confirm
DB behaviour before writing code. It is investigative, allowed in plan mode, and the
fastest way to settle a question about SurrealDB. Clean up with `REMOVE TABLE`.

```bash
curl -s -X POST http://127.0.0.1:8000/sql \
  -H "Accept: application/json" \
  -H "surreal-ns: main" -H "surreal-db: main" \
  -u "root:root" \
  -d "DEFINE TABLE t SCHEMALESS; CREATE t SET foo = [1,2,3]; SELECT foo[0] FROM t;"
```

Use the `surreal-ns` and `surreal-db` headers. The short `NS`/`DB` forms are rejected.

**When the generated query format changes**, update the expectations in
`tests/unit/query/*-builder.test.ts`, `tests/unit/generators/type-mapper.test.ts`,
`tests/generators/migrations.test.ts` and `tests/integration/migration.test.ts`.

## Code Style

- **Single quotes** - oxfmt enforces single quotes for all string literals. Always use `'single quotes'` in TypeScript/JavaScript code, never `"double quotes"`
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

- **Unused bindings** - oxlint's `no-unused-vars` reports unused imports, variables and parameters, and ignores names that start with `_`. `bun run format` does not rename or delete them for you: prefix an intentionally unused parameter with `_` yourself, and remove the `_` again when you start using it, unless `_` has a separate meaning in that context (e.g., lodash import)
- **Imports when editing** - An unused import is a lint error that fails `bun run format`, and nothing removes it for you. Add the import together with the code that uses it
- **Module exports** - Each module has `index.ts` that re-exports its public API
- **Generated files** - Formatted with oxfmt, using the same options as `.oxfmtrc.json`
- **Suppressing a lint rule** - Use `/* oxlint-disable <rule> */` with the reason on the line after it, and `/* oxlint-enable <rule> */` after the code it covers, so the suppression keeps the narrow scope. `// oxlint-disable-next-line <rule> -- <reason>` is the one-line form. The commit hook refuses a directive with no rule or no reason. Common cases: `{}` type in type-level tests (`typescript/no-empty-object-type`), test values like `2.718` that aren't Math.E (`oxc/approx-constant`), intentionally unused type aliases in typechecks. Example:

  ```typescript
  /* oxlint-disable typescript/no-empty-object-type */
  // {} intentionally tests empty object assignability
  type DataEmpty = {};
  /* oxlint-enable typescript/no-empty-object-type */
  ```
- **oxfmt and oxlint must pass in CI** - `bun run format` must exit with zero errors before committing. Warnings fail it too (`--deny-warnings`), so don't let them accumulate. The ORM CI workflow runs `bun run format:check` and fails on any diagnostic
- **Intentionally invalid test fixtures** - Files like `tests/fixtures/config/invalid-json/cerial.config.json` are excluded from oxfmt and oxlint through `ignorePatterns` in `.oxfmtrc.json` and `.oxlintrc.json`. When adding new intentionally malformed fixtures, add them to both

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

- **Never stop early** - Complete tasks fully regardless of token budget or context window
- **Be persistent** - Context window compacts automatically, continue from where you left off
- **Ask before changing core features** - When a fix requires modifying type generators, query builders, or validators, ask the user first
- **Never prepare or propose a release without the security review** - A version going
  to npm requires a security review of the whole range since the last tag, described in
  `CONTRIBUTING.md`. It is a release gate, not a per-commit one, so do not ask for it on
  ordinary changes. Releases are cut by the maintainer, so your part is to refuse to
  treat a release as ready until that review has happened, and to say so plainly if
  asked to tag or publish without it.
- **A theoretical exposure is not a finding; a working exploit is** - When a path looks
  injectable or lossy, write the payload and run it against the local instance with a
  throwaway table before reporting it either way. Two audits recorded the flexible
  sub-key sites as a theoretical identifier exposure; nobody ran it, so a live
  injection sat unfixed in two published versions.
- **Validate test expectations before modifying source** - If a test fails, understand why before changing the test vs. the source
- **Always run `bun run format` before committing** - Run the formatter and linter on new/changed files before every git commit. This ensures consistent formatting and catches lint issues early. Never commit unformatted code. After running, check the output for any warnings or errors — if any are reported, fix them before proceeding. Do not ignore oxlint diagnostics
- **Never create files or folders matching `.gitignore` patterns** - Before creating any new file or directory, check if its name matches a pattern in the repository's `.gitignore` (e.g., `logs`, `dist`, `node_modules`, `*.log`). Files matching `.gitignore` patterns are invisible to git and will silently fail to be committed. If a needed name collides with a `.gitignore` pattern, choose a different name

### Documentation Sync

Docs live in `apps/docs/content/docs/` (Next.js + Fumadocs, MDX, `meta.json` per
folder). Keep them in step with behaviour, in the same change:

- New or changed feature → add or update its page. New concept → new page with
  frontmatter (`title`, `description`).
- New decorator → `schema/decorators/`. New field type → `schema/field-types/`.
  New query method → `queries/`. New filter operator → the relevant `filtering/` page.
- Changed generated types → `types/generated-types.mdx` and
  `types/dynamic-return-types.mdx`.
- Removed feature → delete the page and any links into it.

Docs are for library consumers. Describe what a feature does and how to call it,
with TypeScript the reader would actually write. Do not expose SurrealQL output,
internal variable naming or executor internals unless the user's own API depends on
it. Mention constraints that affect their calls, not internal design decisions.

Docs deploy from `dev`, so unreleased pages go live. Mark them:

```mdx
:::caution
This feature is not yet available in the current release. It will ship in an upcoming version.
:::
```

Remove the callout once the feature ships in a tagged release.

`README.md` is the user-facing landing page and stays concise. Update it when a
feature list entry, a doc section link, a CLI default or the quick-start schema
example would otherwise be wrong. Details belong in the docs, not duplicated there.

### When Adding a Feature, Operator, Field Type or Decorator

The pipeline shape is the same each time:

1. Implement in `apps/orm/src/` — new field type needs a parser under
   `parser/types/field-types/` plus `SchemaFieldType` in `types/common.types.ts`;
   new decorator needs one under `parser/types/field-decorators/`; new operator
   needs a handler under `query/filters/<category>/` registered in
   `query/filters/registry.ts` and a Where-type update in
   `generators/types/where-generator.ts`.
   Declare every new construct (decorator, field type, directive, extends form,
   literal variant, tuple element shape) in `apps/orm/src/parity/parity-manifest.ts`
   first. It is the one place a construct is declared, and
   `bun test tests/generators/parity-manifest.test.ts` reports it as a gap until a
   schema under `tests/e2e/schemas/` exercises it. Widening an AST union is a compile
   error until `src/parity/ast-cross-check.ts` and the manifest follow.
2. Unit tests, then an e2e schema under `tests/e2e/schemas/` if the syntax changed,
   then e2e tests. Register new tables in `test-helper.ts`.
3. `bun run generate:test-client`, `bun run typecheck`, `bunx tsc --noEmit` (from
   `apps/orm`), then the suites.
4. Teach the formatter the new construct (`formatter/printer.ts` or
   `inline-printer.ts`) and prove it is idempotent.
5. Document it (see above).
6. Update the VS Code extension when schema syntax changed: TextMate grammar
   (`syntaxes/cerial.tmLanguage.json`), completions
   (`server/src/providers/completion.ts`), hover docs
   (`server/src/data/hover-docs.ts`), diagnostics for a new validator, code actions
   for a decorator with common misuse. Then `bun run test` and `bun run build` in
   `apps/vscode-extension/`.

### Testing Rules

- **No `as any` or blanket type casting in tests** - If types don't match runtime behavior, fix the type generators or source types. Use specific type assertions (`as User`, `as { id: string }`) ONLY when narrowing `unknown` (e.g., `prevResults[0] as { id: CerialId }`) — never `as any`. This applies to ALL tests (unit, integration, E2E)
  - Exception: `@ts-expect-error` with an explanation comment is allowed ONLY for negative tests — testing runtime error handling for operations the type system correctly prevents
- **Always run relevant tests** after making changes: `bun test` for full suite, or targeted test paths
- **Run `bunx tsc --noEmit` from `apps/orm`** after modifying types or generators to catch type errors. It covers `apps/orm` only; the other scopes have their own commands, listed under Commands. Run from the repo root it reports a large count that is mostly artefact
- **Bug fixes must include tests** - When fixing a bug that was not caught by existing tests, add a test that covers the specific bug being fixed. The test should fail without the fix and pass with it. This prevents regressions and ensures test coverage grows with each fix.
- **Run `bun run format` before running full tests** - This formats, checks linting errors & applies the safe lint fixes with oxfmt and oxlint. Always run before `test:full` to ensure formatting is consistent.
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
- **E2E test global setup pattern (CRITICAL)** — The E2E preload (`apps/orm/tests/e2e/preload.ts`) runs `globalCleanup()` ONCE per database (the single database, or each parallel worker's own) before any test file executes. This removes all tables and runs `migrate()` to establish the correct schema. Individual test files must NOT redo this work:
  - `beforeAll`: Call `cleanupTables(client, YOUR_TABLES)` — this only does `DELETE FROM` (data cleanup, no schema changes)
  - `beforeEach`: Call `truncateTables(client, YOUR_TABLES)` — same lightweight `DELETE FROM` per-test
  - **Do NOT** call `REMOVE TABLE`, `resetMigrationState()`, or `client.migrate()` inside test files — these run once globally in preload
  - **Do NOT** manually execute `DEFINE TABLE` or schema DDL in test files — `migrate()` handles this
  - **Why**: Multiple test files running `REMOVE TABLE + migrate(134 models)` concurrently causes race conditions (tables removed while other tests query them, 134 competing DEFINE statements)
- **E2E execution order**: Run E2E tests via `bun run test:e2e` (sequential, the default) or `bun run test:e2e:parallel` (`CERIAL_E2E_WORKERS` workers, each with its own database `main_w<id>`; see Testing). Never pass `--parallel` to a bare `bun test tests/e2e/`, and never rely on test file execution order
 - **VS Code extension test parallelism (CRITICAL)** — VS Code does not reliably support concurrent instances. Only **ONE agent/process may run `vscode-test` (integration or E2E tests) at a time** across the entire machine. When multiple AI agents are delegated tasks in parallel, **do NOT give more than one agent a task that runs `bunx vscode-test`, `bun run test:integration`, or `bun run test:e2e`** — a second VS Code instance will cause the first to fail with cryptic errors, and agents will enter infinite retry loops trying to "fix" phantom failures. **Safe to parallelize**: `bun test` (unit tests), `bun run test:unit`, `bun run test:grammar` — these do NOT launch VS Code. **Must be sequential**: `bunx vscode-test --label integrationTests`, `bunx vscode-test --label e2eTests`, `bun run test:integration`, `bun run test:e2e`. When an orchestrator dispatches parallel task waves, tasks requiring VS Code tests must go in their own sequential wave or be the ONLY task in a wave that runs VS Code tests
- **New tables in E2E tests** — When adding a new schema file to `apps/orm/tests/e2e/schemas/`, add its table names to the `tables` registry in `apps/orm/tests/e2e/test-helper.ts`. This ensures `globalCleanup()` covers them. Also update the relevant `*_TABLES` constant if the tables belong to root, index, or typed-id groups

### SurrealDB Reserved Keywords

Do NOT use SurrealDB reserved keywords as field names, model names, object names, tuple names or enum names in `.cerial` schema files. SurrealDB's parser will misinterpret them, causing migration failures. `cerial generate` refuses them, case-insensitively.

The list is not kept here. `RESERVED_KEYWORDS` in `apps/orm/src/cli/validators/reserved-keyword-validator.ts` is the one source: it is pinned to SurrealDB 3.3.0 and must be re-diffed against the parser on every SurrealDB bump. Read it there rather than copying it back into this file.

## Gotchas

These are implementation facts the user-facing docs do not frame this way, and each
one has caused a wrong fix before:

- `@flexible` is **per field, not per object type**. The same object can be flexible
  on one field and strict on another, so flexibility is read from
  `FieldMetadata.isFlexible`, never from `ObjectFieldMetadata`. Flexible fields accept
  undeclared sub-keys in data, select and where; strict ones must reject them.
- Enum fields carry `type: 'literal'` internally, so query builders, filters and
  validators handle them through the existing literal paths with no enum-specific code.
- Tuple **input** accepts array or object form, so `validateFieldType(x, 'tuple')` is
  true for both `[1, 2]` and `{ 0: 1, 1: 2 }`. Output is always the array form.
  `validateFieldType(x, 'object')` rejects arrays. Treating a tuple as array-only, or an
  object as "any non-null object", breaks one of those two.
- `CerialSet<T>` is a branded array, not a real Set. `CerialAny` is a recursive union,
  never bare `any`.
- Every model instance exposes `getMetadata()`, `getName()` and `getTableName()` for
  runtime metadata.
- Relations are virtual and never stored. The forward side carries `@field()` and the
  FK; the reverse side has only `Relation @model` and is queried through the target
  table. `relationInfo.isReverse` distinguishes them.

- E2E tests MUST use `--preload` flag or generated client won't exist
- Array fields default to `[]` on create if not provided
- `null` requires `@nullable` on the field — without it, passing `null` is a validation error
- `@default(null)` requires `@nullable` — null default on a non-nullable field is invalid
- `id Record @id` fields skip the "Record needs paired Relation" validation
- FK fields must NOT use `Record(Type)` — types are inferred from the target model's `@id` type. Explicit `Record(int)` on a FK field is an error
- Union ID optionality: a union `@id` (`Record(string, int)`, `Record(uuid, int)`) is always required in create — SurrealDB 3.3.0 refuses to auto-generate an id when the id type is a union. Only plain `Record @id`, `Record(string)` and `Record(uuid)` are optional
- `DEFINE FIELD OVERWRITE` is used for typed `@id` fields to allow re-running migrations safely
- Optional object fields (`Address?`) produce `field?: Address` (NOT `| null` like primitives)
- `select` within `include` is type-level only - runtime returns full related objects
- `none` quantifier for array object where uses `!(arr.any(...))` syntax for SurrealDB 3.x compatibility
- `@onDelete` is only allowed on optional `Relation?` fields - required relations auto-cascade
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
- **SurrealDB tuple+object bug** — SurrealDB has a bug where optional tuple fields with sub-field constraints (`DEFINE FIELD field[N]`) get initialized as `{}` (empty object) instead of NONE when the parent is absent and certain optional object fields exist on the same table. Mitigation: skip `DEFINE FIELD` for ALL primitive tuple elements that have no decorators (the parent tuple type literal already enforces element types, length, optionality, and `| null` for `@nullable`). Only emit sub-field constraints for elements with decorators (`@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`). Those sub-field `DEFAULT`s never fire for a tuple element (measured: an element `DEFAULT` fires only for `option<T>`, and `DEFAULT ALWAYS` does not overwrite a supplied value), so the ORM fills an omitted position itself in `transformTupleData` (`tupleElementDefault`, `tupleElementUpdateRefresh`), writing `time::now()` into the array literal for timestamps; an explicit value always wins A schema validator (`validateTupleObjectCombination()`) errors when a model combines an optional tuple with required-decorated elements and an optional object field
- **`unset` parameter** — Available on `updateMany`, `updateUnique`, and `upsert` (update portion). Uses object form syntax: `{ field: true }` for flat fields, `{ object: { subField: true } }` for nested. Tuple elements use `$this` reconstruction (`SET field = [$this.field[0], NULL, $this.field[2]]` for `@nullable` elements, `NONE` for optional elements). Runtime merges unset fields into data as NONE values before processing. `SafeUnset<Unset, Data>` prevents data/unset conflicts at compile time
- **Relation orderBy goes through an alias** — SurrealDB 3.x does not sort on record-link dot notation in ORDER BY (`ORDER BY authorId.name ASC` silently returns insertion order), but it does sort on a projected alias. Cerial emits `SELECT * OMIT __cerial_ord_0 FROM (SELECT *, authorId.name AS __cerial_ord_0 FROM t WHERE … ORDER BY __cerial_ord_0 ASC LIMIT … START …)`: WHERE, ORDER BY, LIMIT and START stay on the inner query so paging follows sorting, and the outer query drops the alias. Chained links project (`authorId.countryId.name`). Only forward to-one relations are orderable; reverse and array-FK relations are rejected by `validateOrderBy` and absent from `{Model}OrderBy`. Unset/null relations sort first ascending, last descending. Object field ordering needs no alias. OrderBy inside `include` (ordering included children) is a separate subquery mechanism that now validates `orderBy`, `limit` and `offset` against the included model and accepts the same shapes, including object sub-keys and relation keys through the same alias form. Before 0.3.0 all three were interpolated raw and unvalidated, which was an injection
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
