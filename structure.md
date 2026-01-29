# Surreal-OM Library Structure

This document provides a comprehensive overview of the folder and file structure of the Surreal-OM library, explaining what each component does and how they work together.

---

## Overview

Surreal-OM is a Prisma-like ORM for SurrealDB with schema-driven code generation and full TypeScript type safety. The library features Prisma-style dynamic return types, relations, array support, and comprehensive query capabilities.

---

## Root Directory

```
libs/backend/surreal-om/
├── bin/                    # CLI executable entry points
├── src/                    # Main source code
│   ├── cli/               # Command-line interface for schema generation
│   ├── client/            # Database client and model proxies
│   ├── connection/        # Connection management and types
│   ├── generators/        # Code generation from schemas
│   ├── parser/            # Schema parsing and AST generation
│   ├── query/             # Query building and execution
│   ├── types/             # Shared TypeScript types
│   ├── utils/             # Utility functions
│   └── main.ts            # Main exports and connection class
├── tests/                  # Test files
│   ├── e2e/               # End-to-end tests (schema → generate → use)
│   ├── generators/        # Generator tests
│   ├── integration/       # Integration tests
│   ├── parser/            # Parser tests
│   ├── query/             # Query builder tests
│   └── utils/             # Utility tests
├── .gitignore             # Git ignore patterns
├── bun.lock               # Bun lockfile for dependencies
├── index.ts               # Main entry point (re-exports main.ts)
├── package.json           # Package configuration and scripts
├── README.md              # User documentation
├── tsconfig.json          # TypeScript configuration
└── structure.md           # This file
```

---

## Directory Details

### `/bin` - CLI Entry Points

**Purpose**: Contains executable scripts for the command-line interface.

**Files**:
- `surreal-om.ts` - Main CLI entry point that handles command execution

**Usage**: Invoked via `bunx surreal-om generate` to generate client code from schema files.

---

### `/src/cli` - Command Line Interface

**Purpose**: Handles CLI command parsing, validation, and orchestration of the generation process.

**Structure**:
```
cli/
├── generate.ts           # Main generate command logic
├── index.ts              # CLI exports
├── parser.ts             # Command-line argument parser
├── resolvers/            # Schema path resolution
│   ├── index.ts
│   └── schema-resolver.ts
├── utils/                # File system utilities
│   ├── file-creator.ts   # Creates generated files
│   ├── file-writer.ts    # Writes files to disk
│   ├── index.ts
│   └── logger.ts         # Logging functionality
└── validators/           # Input validation
    ├── index.ts
    ├── options-validator.ts  # Validates CLI options
    └── schema-validator.ts   # Validates schema syntax
```

**Key Functions**:
- `generate()` - Orchestrates the full generation workflow
- `parseArgs()` - Parses command-line arguments
- `validateOptions()` - Validates CLI input options
- `resolveSchemas()` - Finds and loads schema files

---

### `/src/client` - Database Client

**Purpose**: Provides the runtime client for interacting with SurrealDB, including connection management and model proxies.

**Structure**:
```
client/
├── connection.ts         # Connection management
├── index.ts              # Client exports
├── model/                # Model proxy implementation
│   ├── index.ts
│   └── model.ts          # Base model class with CRUD methods
└── proxy/                # Proxy-based query handling
    ├── factory.ts        # Creates model proxies
    ├── handler.ts        # Proxy handler for query interception
    └── index.ts
```

**Key Classes**:
- `Model` - Base class providing `findOne()`, `findMany()`, `findUnique()`, `create()`, `updateMany()`, `deleteMany()`, `count()`, `exists()`
- `ConnectionManager` - Manages database connections with migration support
- Model proxies created by `factory.ts` use JavaScript Proxy API for dynamic model access

**How it works**:
1. User creates `SurrealClient` instance from generated code
2. Call `client.connect(config)` to establish connection
3. Access models via `client.db.User` (typed proxy)
4. Call methods like `client.db.User.findMany({ where: {...}, include: {...} })`
5. The proxy handler intercepts and builds SurrealQL queries
6. Queries are executed via the SurrealDB SDK
7. Results are mapped back to TypeScript types with full type inference

**Lazy Migration**:
- If `migrate()` is not called explicitly, migrations run automatically before the first query
- The `Model` class supports a `onBeforeQuery` callback for this purpose
- Migration status is tracked per connection

---

### `/src/connection` - Connection Management

**Purpose**: Manages database connections, authentication, and connection pooling.

**Files**:
- `connection.const.ts` - Constants (e.g., default connection name)
- `connection.type.ts` - TypeScript types for connection options

**Key Types**:
- `IRPCConnectionOption` - Connection configuration (url, namespace, database, auth)
- `IConnectionAuthUserPassOption` - Authentication credentials
- `ConnectionConfig` - Standard connection configuration type

**Key Classes**:
- `ConnectionManager` - Manages connections with migration support:
  - `connect(config, name?)` - Establish named connection
  - `disconnect(name?)` / `disconnectAll()` - Close connections
  - `getSurreal(name?)` - Get raw Surreal instance
  - `migrate(statements, name?)` - Execute migration statements
  - `ensureMigrated(statements, name?)` - Lazy migration
  - `isMigrated(name?)` - Check migration status

---

### `/src/generators` - Code Generation

**Purpose**: Generates TypeScript code from schema AST, creating type-safe client interfaces with full Prisma-style type inference.

**Structure**:
```
generators/
├── client/               # Client code generation
│   ├── connection-template.ts  # Template for connection file
│   ├── index.ts
│   ├── template.ts            # Base client template (SurrealClient class)
│   └── writer.ts              # Writes generated client files with Prettier
├── metadata/             # Metadata generation
│   ├── field-converter.ts     # Converts field AST to metadata
│   ├── index.ts
│   ├── model-converter.ts     # Converts model AST to metadata
│   ├── registry-generator.ts  # Generates model registry with relation info
│   └── writer.ts              # Writes metadata files
├── migrations/           # Schema migration generation
│   ├── define-generator.ts    # Generates DEFINE TABLE/FIELD/INDEX statements
│   ├── index.ts
│   ├── type-mapper.ts         # Maps schema types to SurrealQL types
│   └── writer.ts              # Writes migration files
├── types/                # Type generation
│   ├── derived-generator.ts   # Generates derived types (Create, Update, Select, Include, Relations, GetPayload)
│   ├── export-generator.ts    # Generates export types
│   ├── index.ts
│   ├── interface-generator.ts # Generates model interfaces
│   ├── method-generator.ts    # Generates generic method signatures with type inference
│   ├── model-generator.ts     # Generates model types
│   └── where-generator.ts     # Generates where clause types
└── index.ts               # Generator exports
```

**Generated Files**:
- `client.ts` - SurrealClient class with connect(), disconnect(), migrate(), and db proxy
- `models/[model].ts` - TypeScript interfaces, types, and payload types for each model
- `internal/model-registry.ts` - Runtime metadata about models (includes relation info)
- `internal/migrations.ts` - Migration statements for schema definitions
- `index.ts` - Main client export with SurrealClient, types, and payload types

**Generated Types Per Model**:
- `User` - Base interface
- `UserCreate` - Type for create data (relations omitted, arrays/optional fields optional)
- `UserUpdate` - Type for update data with array operations (push/unset)
- `UserWhere` - Type for where clauses (includes nested relation filtering)
- `UserSelect` - Type for field selection
- `UserInclude` - Type for relation includes with options
- `UserOrderBy` - Type for ordering
- `UserFindUniqueWhere` - Type for unique field queries
- `User$Relations` - Relation metadata mapping
- `GetUserPayload<S, I>` - Dynamic return type based on select/include
- `GetUserIncludePayload<I>` - Helper for include type resolution

**Generation Process**:
1. Parse schema files to AST
2. Convert AST to model metadata (includes relation info)
3. Generate TypeScript interfaces for each model
4. Generate where/select/update types with full type safety
5. Generate relation types and payload inference types
6. Generate model registry for runtime operations
7. Generate main client file with generic methods

---

### `/src/parser` - Schema Parsing

**Purpose**: Parses custom schema definition language into Abstract Syntax Tree (AST) and validates schema syntax. Supports relations, arrays, and all decorators.

**Structure**:
```
parser/
├── file-reader.ts        # File system operations
├── index.ts              # Parser exports
├── lexer.ts              # Tokenizes schema source code
├── model-metadata.ts     # Converts AST to metadata
├── parser.ts             # Main parser (AST builder)
├── relation-metadata.ts  # Relation metadata extraction
├── tokenizer.ts          # Tokenization utilities
└── types/                # Parser types and definitions
    ├── ast.ts            # AST node definitions
    ├── field-constraints/  # Field constraint parsers
    │   ├── index.ts
    │   ├── optional-parser.ts  # Parses optional (?) marker
    │   └── required-parser.ts  # Parses required fields
    ├── field-decorators/  # Field decorator parsers
    │   ├── default-parser.ts   # Parses @default()
    │   ├── field-parser.ts     # Parses @field() for relations
    │   ├── id-parser.ts        # Parses @id
    │   ├── index.ts
    │   ├── model-parser.ts     # Parses @model() for relations
    │   ├── now-parser.ts       # Parses @now
    │   └── unique-parser.ts    # Parses @unique
    ├── field-types/       # Field type parsers
    │   ├── bool-parser.ts      # Parses Bool type
    │   ├── date-parser.ts      # Parses Date type
    │   ├── email-parser.ts     # Parses Email type
    │   ├── float-parser.ts     # Parses Float type
    │   ├── index.ts
    │   ├── int-parser.ts       # Parses Int type
    │   ├── record-parser.ts    # Parses Record type (for references)
    │   ├── relation-parser.ts  # Parses Relation type (virtual)
    │   └── string-parser.ts    # Parses String type
    ├── index.ts
    └── model/             # Model declaration parsers
        ├── field-declaration-parser.ts  # Parses field lines
        ├── index.ts
        └── model-declaration-parser.ts  # Parses model blocks
```

**Schema Format**:
```schema
model User {
  id String @id
  email Email @unique
  name String
  age Int?
  isActive Bool @default(true)
  createdAt Date @now
  nicknames String[]              // Array of strings
  scores Int[]                    // Array of numbers
  tagIds Record[]                 // Array of record references
  tags Relation @field(tagIds) @model(Tag)     // Forward relation (array)
  profileId Record?               // Optional record reference
  profile Relation @field(profileId) @model(Profile)  // Forward relation (single)
  posts Relation @model(Post)     // Reverse relation (no @field)
}
```

**Field Types**:
- `String` - Text values (can be array: `String[]`)
- `Email` - Email addresses (validated with `string::is_email`)
- `Int` - Integer numbers (can be array: `Int[]`)
- `Float` - Floating point numbers (can be array: `Float[]`)
- `Bool` - Boolean values (can be array: `Bool[]`)
- `Date` - DateTime values (can be array: `Date[]`)
- `Record` - Record ID type for references (can be array: `Record[]`)
- `Relation` - Virtual relation field (not stored in DB)

**Decorators**:
- `@id` - Marks field as the record identifier (requires `String` type)
- `@unique` - Creates a unique index on the field
- `@now` - Sets default to `time::now()` for datetime fields
- `@default(value)` - Sets a default value
- `@field(name)` - For Relation fields, specifies the storage field
- `@model(Model)` - For Relation fields, specifies the target model

**Relations**:
- **Forward relations**: Have a storage field (`@field`) that stores the record ID(s)
- **Reverse relations**: Don't have a storage field, query the related table

---

### `/src/query` - Query Building

**Purpose**: Builds SurrealQL queries from type-safe query objects and executes them against the database. Supports relations, arrays, and nested filtering.

**Structure**:
```
query/
├── builder.ts            # Main query builder
├── builders/             # Specific query builders
│   ├── array-update-builder.ts  # Array operation builders (push/unset)
│   ├── delete-builder.ts        # DELETE query builder
│   ├── index.ts
│   ├── insert-builder.ts        # INSERT query builder
│   ├── relation-builder.ts      # Relation include builder
│   ├── select-builder.ts        # SELECT query builder
│   └── update-builder.ts        # UPDATE query builder
├── compile/              # Query compilation
│   ├── fragment.ts        # Query fragment utilities
│   ├── index.ts
│   ├── types.ts           # Compile-time types
│   └── var-allocator.ts   # Variable allocation for parameterization
├── executor.ts           # Query execution
├── filters/              # Filter operators
│   ├── array-operators/  # Array query operators
│   │   ├── array-field-handlers.ts  # has, hasAll, hasAny, isEmpty
│   │   ├── in-handler.ts
│   │   ├── index.ts
│   │   └── notIn-handler.ts
│   ├── comparison-operators/  # =, !=, >, <, >=, <=
│   │   ├── eq-handler.ts
│   │   ├── gt-handler.ts
│   │   ├── gte-handler.ts
│   │   ├── index.ts
│   │   ├── lt-handler.ts
│   │   ├── lte-handler.ts
│   │   └── neq-handler.ts
│   ├── condition-builder.ts      # Builds WHERE conditions
│   ├── index.ts
│   ├── logical-operators/        # AND, OR, NOT
│   │   ├── and-handler.ts
│   │   ├── index.ts
│   │   ├── not-handler.ts
│   │   └── or-handler.ts
│   ├── nested-condition-builder.ts  # Nested relation filtering
│   ├── registry.ts                  # Operator handler registry
│   ├── special-operators/  # IS NULL, BETWEEN
│   │   ├── between-handler.ts
│   │   ├── index.ts
│   │   ├── isDefined-handler.ts
│   │   └── isNull-handler.ts
│   ├── string-operators/  # CONTAINS, STARTS WITH, ENDS WITH
│   │   ├── contains-handler.ts
│   │   ├── endsWith-handler.ts
│   │   ├── index.ts
│   │   └── startsWith-handler.ts
│   └── transformer.ts     # Transforms where clauses to SurrealQL
├── index.ts              # Query exports
├── mappers/              # Result mapping
│   ├── index.ts
│   └── result-mapper.ts   # Maps DB results to TS types (handles RecordId)
├── transformers/          # Data transformation
│   ├── data-transformer.ts  # Transforms data objects (Date, RecordId, arrays)
│   ├── index.ts
│   └── value-formatter.ts   # Formats values for SurrealQL
└── validators/           # Query validation
    ├── data-validator.ts   # Validates create/update data (handles arrays)
    ├── index.ts
    └── where-validator.ts  # Validates where clauses (handles relations)
```

**Query Building Process**:
1. User calls `db.Model.findMany({ where: {...}, include: {...} })`
2. Query builder validates the input
3. Filter handlers transform where clauses to SurrealQL (including nested relation filters)
4. Relation builder handles FETCH clauses for includes
5. Query compiler builds the final query with parameterization
6. Executor runs the query against SurrealDB
7. Mapper transforms results to TypeScript objects (handles RecordId conversion)

**Supported Operators**:
- **Comparison**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`
- **String**: `contains`, `startsWith`, `endsWith`
- **Array (for querying)**: `in`, `notIn`, `has`, `hasAll`, `hasAny`, `isEmpty`
- **Array (for updating)**: `push`, `unset`
- **Logical**: `AND`, `OR`, `NOT`
- **Special**: `isNull`, `between`
- **Nested**: Relation filtering (e.g., `profile: { bio: { contains: 'dev' } }`)

**Type Transformations**:
- **Date fields**: Converted to native Date objects
- **Record fields**: Transformed to/from RecordId(tableName, id)
- **Array fields**: Default to empty arrays if not provided
- **Array operations**: push/unset handled specially in updates

---

### `/src/types` - Shared Types

**Purpose**: Contains all shared TypeScript type definitions used across the library, including utility types for Prisma-style inference.

**Files**:
- `common.types.ts` - Common types used throughout
- `metadata.types.ts` - Model and field metadata types (includes relation info)
- `parser.types.ts` - Parser-related types (AST, tokens, etc.)
- `query.types.ts` - Query builder types (where, select, order, etc.)
- `utility.types.ts` - Utility types for Prisma-style type inference
- `index.ts` - Type exports

**Key Utility Types** (for type inference):
- `TrueKeys<T>` - Extract keys where value is true
- `SelectSubset<T, S>` - Pick fields based on Select object
- `GetRelationPayload<R, I, V>` - Compute relation payload type
- `GetIncludePayload<M, R, I>` - Compute include payload type
- `GetResult<M, R, S, I>` - Main result type resolver
- `RelationDef<T, I>` - Relation definition for type generation

**Key Metadata Types**:
- `SchemaFieldType` - Supported field types: `string`, `email`, `int`, `date`, `bool`, `float`, `record`, `relation`
- `ModelMetadata` - Metadata about a model (fields, decorators, constraints)
- `FieldMetadata` - Metadata about a field (type, optional, decorators, isId, isArray, relationInfo)
- `RelationInfo` - Relation metadata (targetModel, targetTable, isReverse, fieldRef)
- `ModelRegistry` - Map of model names to their metadata

---

### `/src/utils` - Utility Functions

**Purpose**: Provides reusable utility functions used across the library.

**Files**:
- `array-utils.ts` - Array manipulation utilities
- `index.ts` - Utility exports
- `string-utils.ts` - String manipulation utilities
- `type-utils.ts` - Type checking and validation utilities (handles Record type)
- `validation-utils.ts` - Validation helpers (handles arrays and RecordId)

**Key Functions**:
- String case conversion, formatting
- Type guards and type checking
- Validation helpers for schema and query data
- RecordId validation and transformation

---

### `/tests` - Test Suite

**Purpose**: Contains comprehensive test suite including unit, integration, and end-to-end tests.

**Structure**:
```
tests/
├── e2e/                  # End-to-end tests (schema → generate → use)
│   ├── .gitignore        # Ignore generated/ folder
│   ├── schemas/          # Test schemas
│   │   └── test.schema
│   ├── generated/        # Generated at runtime (gitignored)
│   ├── preload.ts        # Bun preload - runs generate before tests
│   ├── setup.ts          # Setup logic - calls generate command
│   ├── test-client.ts    # Helper to import generated client
│   ├── crud.test.ts      # CRUD operations (28 tests)
│   ├── arrays.test.ts    # Array operations (17 tests)
│   ├── relations.test.ts # Relations (13 tests)
│   ├── select.test.ts    # Select functionality (13 tests)
│   ├── include.test.ts   # Include functionality (14 tests)
│   └── type-inference.test.ts  # Type inference (7 tests)
├── client/
│   └── model.test.ts     # Model class tests
├── generators/
│   ├── migrations.test.ts  # Migration generator tests
│   └── types.test.ts       # Type generator tests
├── integration/          # Integration tests (require running SurrealDB)
│   ├── connection.test.ts
│   ├── crud.test.ts
│   ├── migration.test.ts
│   └── schema-validation.test.ts
├── parser/
│   ├── model-metadata.test.ts  # Metadata conversion tests
│   ├── parser.test.ts          # Parser tests
│   └── tokenizer.test.ts       # Tokenizer tests
├── query/
│   ├── builders/
│   │   ├── insert-builder.test.ts
│   │   └── select-builder.test.ts
│   └── filters/
│       ├── comparison-operators.test.ts
│       ├── logical-operators.test.ts
│       └── string-operators.test.ts
├── utils/
│   ├── string-utils.test.ts
│   └── type-utils.test.ts
└── test-helpers.ts       # Shared test utilities
```

**E2E Testing**:
E2E tests simulate the complete user workflow:
1. Define schema in `tests/e2e/schemas/test.schema`
2. Preload script runs `generate()` to create client in `generated/`
3. Tests dynamically import the generated client
4. Execute real queries against SurrealDB
5. Verify both runtime behavior and type inference

**Running Tests**:
```bash
# Start SurrealDB for integration/e2e tests
surreal start -u root -p root memory

# Run all tests (unit + integration + e2e)
bun test

# Run only e2e tests
bun test tests/e2e/ --preload ./tests/e2e/preload.ts

# Run specific test suites
bun test tests/generators/
bun test tests/parser/
```

**Test Coverage**:
- **Unit tests**: ~211 tests covering parsers, generators, query builders
- **E2E tests**: 82 tests covering real-world usage scenarios
- **Total**: ~293 tests

---

## Key Features

### 1. Prisma-Style Type Inference

Generated types provide full compile-time type safety:
```typescript
// Without select/include - returns full User type
const user = await db.User.findOne({ where: { id: '123' } });
// user: User | null

// With select - returns only selected fields
const user = await db.User.findOne({
  where: { id: '123' },
  select: { id: true, email: true }
});
// user: { id: string; email: string } | null

// With include - returns model + relations
const user = await db.User.findOne({
  where: { id: '123' },
  include: { profile: true, posts: true }
});
// user: User & { profile: Profile; posts: Post[] } | null
```

### 2. Relations

Support for forward and reverse relations:
- Forward relations store record ID(s) in a field
- Reverse relations query the related table
- Type-safe includes with nested select/include
- Include options: where, limit, offset, orderBy

### 3. Array Support

Full support for array types:
- Primitive arrays: `String[]`, `Int[]`, `Date[]`, `Float[]`
- Record arrays: `Record[]`
- Default to empty arrays in create
- Update operators: `push`, `unset`
- Query operators: `has`, `hasAll`, `hasAny`, `isEmpty`

### 4. Nested Filtering

Query by related model fields:
```typescript
await db.User.findMany({
  where: {
    profile: { bio: { contains: 'developer' } }
  }
});
```

---

## Development Workflow

1. **Add a new operator**:
   - Create handler in `src/query/filters/[category]/[operator]-handler.ts`
   - Register in `src/query/filters/registry.ts`
   - Add tests

2. **Add a new field type**:
   - Create parser in `src/parser/types/field-types/[type]-parser.ts`
   - Update `SchemaFieldType` in `src/types/common.types.ts`
   - Update type mappings in generators and validators
   - Add tests

3. **Add a new decorator**:
   - Create parser in `src/parser/types/field-decorators/[decorator]-parser.ts`
   - Update generator to handle decorator
   - Update migration generator if needed
   - Add tests

4. **Modify type generation**:
   - Update templates in `src/generators/types/`
   - Test with example schemas
   - Verify type inference works correctly
   - Add e2e tests

---

## Key Design Patterns

1. **Proxy Pattern**: Model access via JavaScript Proxy API
2. **Registry Pattern**: Operator handler registration
3. **Template Method**: Consistent file generation
4. **Visitor Pattern**: AST processing and metadata conversion
5. **Singleton Pattern**: Connection management
6. **Type Inference**: Conditional types for Prisma-style inference

---

## Dependencies

- **surrealdb** - Official SurrealDB JavaScript SDK
- **prettier** - Code formatting for generated files
- **ts-toolbelt** - Advanced TypeScript type utilities
- **Bun** - Runtime for execution and CLI

---

## Summary

Surreal-OM provides a complete type-safe ORM for SurrealDB with:
- **Schema-driven code generation** with full TypeScript type safety
- **Prisma-style dynamic return types** that infer based on select/include
- **Relations** with forward/reverse support and type-safe includes
- **Array types** with comprehensive operators
- **Nested filtering** for querying by related model fields
- **Comprehensive testing** with unit, integration, and e2e tests
- **Production-ready** code generation with Prettier formatting

Each module has clear responsibilities and well-defined interfaces, making the library maintainable, extensible, and a joy to use.
