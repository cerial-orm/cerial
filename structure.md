# Surreal-OM Library Structure

This document provides a comprehensive overview of the folder and file structure of the Surreal-OM library, explaining what each component does and how they work together.

---

## Overview

Surreal-OM is a Prisma-like ORM for SurrealDB with schema-driven code generation. The library is organized into several core modules: CLI, Client, Query, Parser, and Generators.

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
    └── schema-validator.ts  # Validates schema syntax
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

- `Model` - Base class providing `findOne()`, `findMany()`, `create()`, `updateMany()`, `deleteMany()`, `count()`, `exists()`
- `ConnectionManager` - Manages database connections with migration support
- Model proxies created by `factory.ts` use JavaScript Proxy API for dynamic model access

**How it works**:

1. User creates `SurrealClient` instance from generated code
2. Call `client.connect(config)` to establish connection
3. Access models via `client.db.User` (typed proxy)
4. Call methods like `client.db.User.findMany({ where: {...} })`
5. The proxy handler intercepts and builds SurrealQL queries
6. Queries are executed via the SurrealDB SDK
7. Results are mapped back to TypeScript types

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
- `conntection.test.ts` - Connection tests (note: typo in filename)

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

**Connection Flow**:

1. Create `ConnectionManager` with model registry
2. Call `connect(config)` to establish RPC connection
3. Authenticate with username/password if provided
4. Select namespace and database
5. Optionally call `migrate()` or let lazy migration run
6. Execute queries through the database proxy

---

### `/src/generators` - Code Generation

**Purpose**: Generates TypeScript code from schema AST, creating type-safe client interfaces.

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
│   ├── registry-generator.ts # Generates model registry
│   └── writer.ts              # Writes metadata files
├── migrations/           # Schema migration generation
│   ├── define-generator.ts    # Generates DEFINE TABLE/FIELD/INDEX statements
│   ├── index.ts
│   ├── type-mapper.ts         # Maps schema types to SurrealQL types
│   └── writer.ts              # Writes migration files
├── types/                # Type generation
│   ├── derived-generator.ts  # Generates derived types (where, select, etc.)
│   ├── export-generator.ts    # Generates export types
│   ├── index.ts
│   ├── interface-generator.ts # Generates model interfaces
│   ├── method-generator.ts    # Generates method signatures
│   ├── model-generator.ts     # Generates model types
│   └── where-generator.ts     # Generates where clause types
└── index.ts               # Generator exports
```

**Generated Files**:

- `client.ts` - SurrealClient class with connect(), disconnect(), migrate(), and db proxy
- `models/[model].ts` - TypeScript interfaces for each model
- `internal/model-registry.ts` - Runtime metadata about models
- `internal/migrations.ts` - Migration statements for schema definitions
- `index.ts` - Main client export with SurrealClient and types

**Generation Process**:

1. Parse schema files to AST
2. Convert AST to model metadata
3. Generate TypeScript interfaces for each model
4. Generate where/select/update types with full type safety
5. Generate model registry for runtime operations
6. Generate main client file

---

### `/src/parser` - Schema Parsing

**Purpose**: Parses custom schema definition language into Abstract Syntax Tree (AST) and validates schema syntax.

**Structure**:

```
parser/
├── file-reader.ts        # File system operations
├── index.ts              # Parser exports
├── lexer.ts              # Tokenizes schema source code
├── model-metadata.ts     # Converts AST to metadata
├── parser.ts             # Main parser (AST builder)
├── tokenizer.ts          # Tokenization utilities
└── types/                # Parser types and definitions
    ├── ast.ts            # AST node definitions
    ├── field-constraints/  # Field constraint parsers
    │   ├── index.ts
    │   ├── optional-parser.ts  # Parses optional (?) marker
    │   └── required-parser.ts  # Parses required fields
    ├── field-decorators/  # Field decorator parsers
    │   ├── default-parser.ts   # Parses @default()
    │   ├── id-parser.ts        # Parses @id
    │   ├── index.ts
    │   ├── now-parser.ts       # Parses @now
    │   └── unique-parser.ts    # Parses @unique
    ├── field-types/       # Field type parsers
    │   ├── bool-parser.ts      # Parses Bool type
    │   ├── date-parser.ts      # Parses Date type
    │   ├── email-parser.ts     # Parses Email type
    │   ├── float-parser.ts     # Parses Float type
    │   ├── index.ts
    │   ├── int-parser.ts       # Parses Int type
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
  id Record @id
  email Email @unique
  name String
  age Int?
  isActive Bool @default(true)
  createdAt Date @now
}
```

**Field Types**:

- `String` - Text values
- `Email` - Email addresses (validated with `string::is_email`)
- `Int` - Integer numbers
- `Float` - Floating point numbers
- `Bool` - Boolean values
- `Date` - DateTime values (maps to SurrealDB `datetime`)
- `Record` - Record ID type (must be used with `@id` decorator)

**Decorators**:

- `@id` - Marks field as the record identifier (requires `Record` type)
- `@unique` - Creates a unique index on the field
- `@now` - Sets default to `time::now()` for datetime fields
- `@default(value)` - Sets a default value

**Parsing Process**:

1. **Tokenizer** - Breaks source code into tokens (keywords, identifiers, symbols)
2. **Lexer** - Groups tokens into lexemes with types
3. **Parser** - Builds AST from lexemes using recursive descent
4. **Validator** - Validates AST structure and constraints
5. **Metadata Converter** - Converts AST to runtime metadata

**Key Functions**:

- `parse()` - Main parser function, returns AST
- `tokenize()` - Converts source to tokens
- `validateSchema()` - Validates schema syntax
- `getModelMetadata()` - Gets metadata for a specific model

---

### `/src/query` - Query Building

**Purpose**: Builds SurrealQL queries from type-safe query objects and executes them against the database.

**Structure**:

```
query/
├── builder.ts            # Main query builder
├── builders/             # Specific query builders
│   ├── delete-builder.ts  # DELETE query builder
│   ├── index.ts
│   ├── insert-builder.ts  # INSERT query builder
│   ├── select-builder.ts  # SELECT query builder
│   └── update-builder.ts  # UPDATE query builder
├── compile/              # Query compilation
│   ├── fragment.ts        # Query fragment utilities
│   ├── index.ts
│   ├── types.ts           # Compile-time types
│   └── var-allocator.ts   # Variable allocation for parameterization
├── executor.ts           # Query execution
├── filters/              # Filter operators
│   ├── array-operators/  # IN, NOT IN
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
│   ├── condition-builder.ts  # Builds WHERE conditions
│   ├── index.ts
│   ├── logical-operators/  # AND, OR, NOT
│   │   ├── and-handler.ts
│   │   ├── index.ts
│   │   ├── not-handler.ts
│   │   └── or-handler.ts
│   ├── registry.ts        # Operator handler registry
│   ├── special-operators/  # IS NULL, IS DEFINED, BETWEEN
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
│   └── result-mapper.ts   # Maps DB results to TS types
├── transformers/          # Data transformation
│   ├── data-transformer.ts  # Transforms data objects (Date, RecordId)
│   ├── index.ts
│   └── value-formatter.ts  # Formats values for SurrealQL
└── validators/           # Query validation
    ├── data-validator.ts   # Validates create/update data
    ├── index.ts
    └── where-validator.ts  # Validates where clauses
```

**Query Building Process**:

1. User calls `db.Model.findMany({ where: {...} })`
2. Query builder validates the input
3. Filter handlers transform where clauses to SurrealQL
4. Query compiler builds the final query with parameterization
5. Executor runs the query against SurrealDB
6. Mapper transforms results to TypeScript objects

**Supported Operators**:

- **Comparison**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`
- **String**: `contains`, `startsWith`, `endsWith`
- **Array**: `in`, `notIn`
- **Logical**: `AND`, `OR`, `NOT`
- **Special**: `isNull`, `isDefined`, `between`

**Key Functions**:

- `buildSelectQuery()` - Builds SELECT queries
- `buildCreateQuery()` - Builds CREATE queries
- `buildUpdateManyQuery()` - Builds UPDATE queries
- `buildDeleteQuery()` - Builds DELETE queries with RETURN BEFORE
- `executeQuery()` - Executes query and returns results
- `transformData()` - Transforms data for queries (handles Date, RecordId)
- `transformRecordId()` - Converts string IDs to SurrealDB RecordId

**Type Transformations** (outgoing data to SurrealDB):

- **Date fields**: User-provided dates (strings or Date objects) are converted to `Date` objects which the SurrealDB SDK handles natively
- **Record fields** (with @id): User-provided IDs are converted to `RecordId(tableName, value)` using SurrealDB's RecordId class
- **@now defaults**: Handled by the database via `DEFINE FIELD ... DEFAULT time::now()` - not applied in code

**Result Mapping** (incoming data from SurrealDB):

- SurrealDB SDK returns datetime values as `DateTime` class (not native `Date`)
- The result mapper converts `DateTime` objects to native JavaScript `Date` via `DateTime.toString()` parsing
- RecordId values are preserved as returned by SurrealDB SDK
- All other primitive types map directly

---

### `/src/types` - Shared Types

**Purpose**: Contains all shared TypeScript type definitions used across the library.

**Files**:

- `common.types.ts` - Common types used throughout
- `metadata.types.ts` - Model and field metadata types
- `parser.types.ts` - Parser-related types (AST, tokens, etc.)
- `query.types.ts` - Query builder types (where, select, order, etc.)
- `index.ts` - Type exports

**Key Types**:

- `SchemaFieldType` - Supported field types: `string`, `email`, `int`, `date`, `bool`, `float`, `record`
- `ModelMetadata` - Metadata about a model (fields, decorators, constraints)
- `FieldMetadata` - Metadata about a field (type, optional, decorators, isId)
- `ModelRegistry` - Map of model names to their metadata
- `WhereClause` - Type-safe where clause structure
- `SelectClause` - Type-safe select clause structure
- `FindManyOptions` - Options for findMany queries
- `CreateOptions` - Options for create queries
- `UpdateOptions` - Options for updateMany queries
- `DeleteManyOptions` - Options for deleteMany queries
- `ConnectionConfig` - Database connection configuration

---

### `/src/utils` - Utility Functions

**Purpose**: Provides reusable utility functions used across the library.

**Files**:

- `array-utils.ts` - Array manipulation utilities
- `index.ts` - Utility exports
- `string-utils.ts` - String manipulation utilities
- `type-utils.ts` - Type checking and validation utilities
- `validation-utils.ts` - Validation helpers

**Key Functions**:

- String case conversion, formatting
- Type guards and type checking
- Validation helpers for schema and query data

---

### `/src/main.ts` - Main Entry Point

**Purpose**: Main entry point that exports all public APIs and defines the `SurrealOM` connection class.

**Key Exports**:

- `SurrealOM` - Main connection class for database connections
- All parser functions (`parse`, `tokenize`, etc.)
- All generator functions
- All query builders and executors
- All CLI functions
- All utility functions

**SurrealOM Class**:
Manages database connections with support for:

- Multiple named connections
- Connection pooling (via singleton pattern)
- Automatic authentication
- Namespace/database selection

---

### `/tests` - Test Suite

**Purpose**: Contains test files for verifying library functionality.

**Structure**:

```
tests/
├── generators/
│   └── types.test.ts     # Generator type tests
├── integration/          # Integration tests (require running SurrealDB)
│   ├── connection.test.ts       # ConnectionManager tests
│   ├── crud.test.ts             # CRUD operation tests
│   ├── migration.test.ts        # Schema migration tests
│   └── schema-validation.test.ts # Schema validation tests
├── parser/
│   ├── model-metadata.test.ts  # Metadata conversion tests
│   ├── parser.test.ts          # Parser tests
│   └── tokenizer.test.ts       # Tokenizer tests
├── query/
│   ├── builders/
│   │   ├── insert-builder.test.ts   # Insert query tests
│   │   └── select-builder.test.ts   # Select query tests
│   └── filters/
│       ├── comparison-operators.test.ts  # Comparison operator tests
│       ├── logical-operators.test.ts     # Logical operator tests
│       └── string-operators.test.ts      # String operator tests
└── utils/
    ├── string-utils.test.ts   # String utility tests
    └── type-utils.test.ts     # Type utility tests
```

**Running Tests**:

```bash
# Start SurrealDB for integration tests
surreal start -u root -p root memory

# Run all tests
bun test
```

**Integration Test Requirements**:

- SurrealDB running at `http://127.0.0.1:8000`
- Auth: username `root`, password `root`
- Namespace: `main`, Database: `main`

---

## Package Configuration

### `package.json`

**Key Sections**:

- **name**: `@org/lib_backend_surreal-om`
- **bin**: Defines `surreal-om` CLI command pointing to `./bin/surreal-om.ts`
- **exports**: Defines module exports for different entry points
- **dependencies**: `surrealdb` (1.3.2), `ts-toolbelt` (^9.6.0)
- **scripts**:
  - `test` - Run test suite
  - `generate` - Run generation on example schemas

### `tsconfig.json`

TypeScript configuration for the library, ensuring type safety and proper compilation.

---

## Development Workflow

1. **Add a new operator**:
   - Create handler in `src/query/filters/[category]/[operator]-handler.ts`
   - Register in `src/query/filters/registry.ts`
   - Add tests in `tests/query/filters/`

2. **Add a new field type**:
   - Create parser in `src/parser/types/field-types/[type]-parser.ts`
   - Update `SchemaFieldType` in `src/types/common.types.ts`
   - Update type mappings in:
     - `src/utils/type-utils.ts` (schemaTypeToTsType, schemaTypeToSurrealType)
     - `src/utils/validation-utils.ts` (validateFieldType)
     - `src/generators/migrations/type-mapper.ts` (TYPE_MAP)
     - `src/query/transformers/data-transformer.ts` (transformValue)
   - Add tests

3. **Add a new decorator**:
   - Create parser in `src/parser/types/field-decorators/[decorator]-parser.ts`
   - Update generator to handle decorator
   - Update migration generator if needed
   - Add tests

4. **Modify code generation**:
   - Update templates in `src/generators/client/` or `src/generators/types/`
   - Test with example schemas
   - Verify generated code compiles

5. **Add migration support for new features**:
   - Update `src/generators/migrations/define-generator.ts` for DEFINE statements
   - Update `src/generators/migrations/type-mapper.ts` for type mappings
   - Add integration tests in `tests/integration/`

---

## Key Design Patterns

1. **Proxy Pattern**: Used in `/src/client/proxy/` to intercept model method calls
2. **Registry Pattern**: Used in filter handlers for operator registration
3. **Template Method**: Used in code generators for consistent file generation
4. **Visitor Pattern**: Used in AST processing and metadata conversion
5. **Singleton Pattern**: Used in connection management for named connections

---

## Dependencies

- **surrealdb** - Official SurrealDB JavaScript SDK (provides RecordId, Surreal client)
- **prettier** - Code formatting for generated TypeScript files
- **ts-toolbelt** - Advanced TypeScript type utilities
- **Bun** - Runtime for execution and CLI

---

## Summary

The Surreal-OM library is organized into logical modules:

- **CLI**: Command-line interface for code generation (`surreal-om generate`)
- **Client**: Runtime database client with proxy-based queries and ConnectionManager
- **Connection**: Database connection management with authentication
- **Generators**: Schema-to-TypeScript code generation including:
  - Client generation (SurrealClient class)
  - Type generation (interfaces, where types, etc.)
  - Metadata generation (model registry)
  - Migration generation (DEFINE TABLE/FIELD/INDEX statements)
- **Parser**: Custom schema language parser with AST
- **Query**: Type-safe query building and execution with data transformation
- **Types**: Shared TypeScript type definitions
- **Utils**: Reusable utility functions

**Key Features**:

- Schema-driven code generation with Prettier formatting
- Class-based client with typed database proxy (`client.db.User.findMany()`)
- Automatic or explicit schema migrations with `DEFINE` statements
- Lazy migration support (runs before first query if not explicitly called)
- Record ID handling via SurrealDB's `RecordId` class
- Native Date handling for datetime fields

Each module has a clear responsibility and well-defined interfaces, making the library maintainable and extensible.
