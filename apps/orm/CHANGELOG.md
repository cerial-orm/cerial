# Changelog

All notable changes will be documented in this file.
For previous versions, see [changelogs/](changelogs/).

## [Unreleased]

## [0.1.0]

### Added

#### Schema Language

- `.cerial` schema files with a clean, declarative syntax for defining models, objects, tuples, enums, and literals
- 15 field types: `String`, `Int`, `Float`, `Bool`, `Date`, `Email`, `Record`, `Relation`, `Uuid`, `Duration`, `Decimal`, `Bytes`, `Geometry`, `Number`, `Any`
- Embedded object types (`object {}`) with sub-field select, filtering, and partial updates
- Tuple types (`tuple {}`) for fixed-length typed arrays with named elements and flexible input forms (array or object)
- Literal types (`literal {}`) for union types combining specific values, broad types, object refs, tuple refs, and enum refs
- Enum types (`enum {}`) for string-only named constants, generating `as const` objects and union types
- Array fields with `Type[]` syntax and full query/update operators (push, replace, unset)
- Set arrays via `@set` decorator for auto-deduplicated, sorted arrays (`CerialSet<T>` branded type)
- Optional fields with `?` modifier mapping to `undefined` (SurrealDB NONE/absent semantics)
- Nullable fields with `@nullable` decorator for explicit `null` values, independent of optionality
- Clean NONE vs null separation: `?` controls absence, `@nullable` controls null, combinable as `Type? @nullable`
- Typed IDs with `Record(int) @id`, `Record(uuid) @id`, `Record(string, int) @id` union syntax, and automatic FK type inference
- Schema-level inheritance with `extends ParentName` syntax for all type kinds (model, object, tuple, enum, literal)
- Abstract models (`abstract model`) that suppress table generation, TypeScript types, and client accessors
- Pick/omit selective inheritance: `extends Parent[field1, field2]` to pick, `extends Parent[!field]` to omit
- Private fields with `!!private` modifier to prevent override in child types while still allowing omission
- Multi-schema support with multiple independent schema folders and per-schema client generation
- Cross-file type references between `.cerial` files within the same schema entry

#### Decorators

- Identity decorators: `@id` for primary key, `@key` for relation key fields
- Relation decorators: `@field(name)` for FK binding, `@model(Name)` for target model, `@onDelete(Cascade|SetNull|SetNone|Restrict)` for cascade behavior
- Default value decorators: `@default(value)` for creation defaults, `@defaultAlways(value)` for reset-on-write defaults
- Timestamp decorators: `@createdAt` (set on creation), `@updatedAt` (set on every write), `@now` (computed `time::now()` at query time)
- UUID generation decorators: `@uuid` (v7 default), `@uuid4`, `@uuid7` for server-side auto-generation
- Geometry subtype decorators: `@point`, `@line`, `@polygon`, `@multipoint`, `@multiline`, `@multipolygon`, `@collection`
- Constraint decorators: `@unique` for unique fields, `@index` for indexed fields, `@nullable` for null-capable fields
- Array decorators: `@set` for set semantics, `@distinct` for unique elements, `@sort` for sorted arrays
- Field behavior decorators: `@readonly` for write-once fields (enforced at type and runtime level), `@flexible` for schemaless object extensions
- Composite model-level directives: `@@index(fields)` and `@@unique(fields)` for multi-field constraints

#### Query Methods

- `findOne` for retrieving a single record matching a filter (returns `T | null`)
- `findMany` for retrieving multiple records with filtering, sorting, and pagination
- `findUnique` for retrieving a record by unique field or composite key
- `create` for inserting a single record with full nested relation support
- `createMany` for batch-inserting multiple records
- `updateMany` for updating all records matching a filter
- `updateUnique` for updating a single record by unique identifier
- `deleteMany` for removing all records matching a filter
- `deleteUnique` for removing a single record by unique identifier
- `upsert` for create-or-update with separate create/update data
- `count` for efficient record counting with optional filter
- `exists` for checking record existence without fetching data

#### Query Options

- `select` for dynamic field selection with compile-time narrowed return types
- `include` for loading related records with nested filtering, sorting, limit, and offset
- `where` for filtering with a full operator set (comparison, string, array, logical, existence)
- `orderBy` for ascending/descending sorting on model and object fields
- `limit` and `offset` for pagination
- `unset` for explicitly clearing optional fields in updates (object form syntax with nested support)
- `return` modes on `updateUnique` and `deleteUnique`: `'before'` (previous state), `true` (boolean success), or default (after state)

#### Filtering Operators

- Comparison operators: `eq`, `neq`, `not`, `gt`, `gte`, `lt`, `lte`, `between`
- String operators: `contains`, `startsWith`, `endsWith`
- Array operators: `in`, `notIn`, `has`, `hasAll`, `hasAny`, `isEmpty`
- Existence operators: `isNull`, `isDefined`, `isNone`
- Logical combinators: `AND`, `OR`, `NOT` for composing complex filters
- Nested filtering through object sub-fields and relation traversal

#### Relations

- 1:1, 1:N, and N:N relation types with forward (PK) and reverse (non-PK) sides
- Self-referential relations for models that relate to themselves
- Bidirectional N:N sync keeping both sides of the relation consistent automatically
- Nested `create` for creating related records inline during parent creation
- Nested `connect` and `disconnect` for linking/unlinking existing related records
- `@onDelete` cascade strategies: `Cascade`, `SetNull`, `SetNone`, `Restrict`
- FK type inference from the target model's `@id` type (e.g., `Record(int) @id` produces `CerialId<number>` on FK fields)

#### Transactions

- Array mode: `$transaction([q1, q2, fn])` for batching queries with optional function items receiving previous results
- Callback mode: `$transaction(async (tx) => { ... })` with full model access and throw-to-rollback
- Manual mode: `const txn = await client.$transaction()` with explicit `commit()` / `cancel()` lifecycle
- `CerialTransaction` state machine (`active` / `committed` / `cancelled`) with `Symbol.asyncDispose` for `await using` cleanup
- Configurable retry with optional backoff function for transaction conflict resolution
- Automatic WebSocket connection for transaction support when connected via HTTP

#### Type System

- `CerialId<T>` generic record ID wrapper with `.id`, `.table`, `.equals()`, `.toString()`, `.fromRecordId()`
- `CerialUuid` UUID wrapper with `.toString()`, `.equals()`, `.toNative()`
- `CerialDuration` duration wrapper with time-unit accessors (`.hours`, `.minutes`, `.seconds`), `.compareTo()`, `.toNative()`
- `CerialDecimal` arbitrary-precision decimal with arithmetic methods (`.add()`, `.sub()`, `.mul()`, `.div()`), `.toString()`, `.toNumber()`
- `CerialBytes` binary data wrapper with `.toUint8Array()`, `.toBuffer()`, `.toBase64()`, `.toString()`
- `CerialGeometry` class hierarchy with 7 subtypes (`Point`, `Line`, `Polygon`, `MultiPoint`, `MultiLine`, `MultiPolygon`, `Collection`) and point input shorthand `[lon, lat]`
- `CerialAny` recursive union type for `Any` fields (typed alternative to bare `any`)
- `CerialSet<T>` branded array type for set-typed fields
- `CerialNone` symbol type representing SurrealDB's NONE (absent field) value
- `RecordIdInput<T>` union type accepting `T | CerialId<T> | RecordId | StringRecordId` as record input
- Input union types for all wrapper classes: `CerialUuidInput`, `CerialDurationInput`, `CerialDecimalInput`, `CerialBytesInput`, `CerialGeometryInput`
- Generated TypeScript interfaces for every model and object type
- Generated `Select`, `OrderBy`, `Where`, `Include`, and `GetPayload` types per model
- Dynamic return types that narrow based on `select` and `include` options at compile time

#### CLI

- `cerial generate` command producing a fully typed client from `.cerial` schema files
- `cerial generate --watch` for auto-regeneration on schema changes with per-schema isolation and debounce
- `cerial generate --format` for auto-formatting schemas during generation
- `cerial generate -s` / `-o` / `-C` / `-n` flags for schema path, output path, config file, and schema name filtering
- `cerial init` command for scaffolding a `cerial.config.ts` from detected schemas
- `cerial init --yes` for non-interactive mode
- `cerial format` command for formatting `.cerial` files with `--check` (CI mode) and `--watch` options
- Config system supporting `cerial.config.ts` and `cerial.config.json` with type-safe `defineConfig()` helper

#### Path Filtering

- `.cerialignore` file support at project root and per-schema-folder level
- Three-tier filter system: `ignore` (absolute blacklist), `exclude` (overridable blacklist), `include` (whitelist override for excluded paths)
- Cascade resolution order: project `.cerialignore` -> root config -> folder `.cerialignore` -> folder config

#### Migration Generation

- Automatic `DEFINE TABLE` statement generation from model definitions
- `DEFINE FIELD` generation with SurrealDB type mapping for all 15 field types
- `DEFINE INDEX` generation for `@unique`, `@index`, `@@unique`, and `@@index` constraints
- `READONLY` and `FLEXIBLE` field constraint generation
- `DEFAULT` and `DEFAULT ALWAYS` value generation for `@default`, `@defaultAlways`, `@createdAt`, `@updatedAt`
- `DEFINE FIELD OVERWRITE` for typed `@id` fields to support safe re-migration

#### Formatter

- Auto-formatting for `.cerial` files with consistent style and column alignment
- Decorator ordering enforcement following a canonical order
- Comment preservation across formatting passes
- 9 configurable format options for fine-tuning output style
- Watch mode for continuous formatting on file changes
- Check mode for CI validation (non-destructive, exits with error on unformatted files)
- Idempotent output: formatting an already-formatted file produces identical results

#### Client

- `CerialQueryPromise` lazy thenable that auto-executes on `await` and collects into `$transaction`
- Proxy-based model access (`client.User.findMany(...)`) with full IntelliSense
- Connection management with `connect()`, `disconnect()`, and `migrate()` methods
- `onBeforeQuery` hooks for query interception, logging, and modification
- Model introspection via `getMetadata()`, `getName()`, and `getTableName()` on every model instance
- Parameterized queries with all values bound via `$varName` (safe from injection)
- Automatic result mapping from SurrealDB `RecordId` to `CerialId<T>` on query output
- Input transformation handling `RecordIdInput` conversion, `@default`/timestamp injection, and NONE/null logic
