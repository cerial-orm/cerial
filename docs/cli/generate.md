---
title: generate
parent: CLI
nav_order: 1
---

# generate

The `generate` command reads your `.cerial` schema files and produces a fully typed TypeScript client.

```bash
bunx cerial generate [options]
```

## Options

| Flag              | Alias | Description                                      | Default       |
| ----------------- | ----- | ------------------------------------------------ | ------------- |
| `--schema <path>` | `-s`  | Path to schema file or directory                 | `./schemas`   |
| `--output <path>` | `-o`  | Output directory for generated client            | `./db-client` |
| `--clean`         | `-c`  | Delete entire output directory before generating | `false`       |
| `--watch`         | `-w`  | Watch for schema changes and regenerate          | `false`       |
| `--verbose`       | `-v`  | Verbose output showing generation details        | `false`       |
| `--help`          | `-h`  | Show help message                                | -             |

## Examples

### Generate from default paths

If your schema files are in `./schemas` and you want the client generated to `./db-client`:

```bash
bunx cerial generate
```

### Specify custom paths

Point the generator at a specific schema directory and output location:

```bash
bunx cerial generate -s ./schemas -o ./db-client
```

### Single schema file

Generate from a single `.cerial` file instead of a directory:

```bash
bunx cerial generate -s ./schema.cerial -o ./generated
```

### Watch mode

Automatically regenerate the client whenever schema files change. This is useful during development when you're iterating on your schema:

```bash
bunx cerial generate -s ./schemas -o ./db-client --watch
```

Watch mode monitors the schema directory (or file) for changes and triggers a full regeneration cycle each time a `.cerial` file is created, modified, or deleted.

### Clean output

Delete the entire output directory before generating, ensuring a completely fresh output with no leftover files:

```bash
bunx cerial generate -s ./schemas -o ./db-client --clean
```

Without `--clean`, stale files from previous generations (e.g., types for renamed or removed models) are automatically detected and removed after generating. The `--clean` flag is useful when you want a guaranteed clean slate, such as after major schema restructuring.

### Verbose output

See detailed information about what the generator is doing at each step:

```bash
bunx cerial generate -s ./schemas -o ./db-client --verbose
```

## What Happens During Generation

The generation process follows a pipeline architecture:

### 1. Schema Discovery

The generator resolves the schema path:

- **Directory** - All `.cerial` files in the directory are discovered and loaded
- **Single file** - Just that one file is loaded

### 2. Parsing

Each schema file is parsed into an AST (Abstract Syntax Tree). The parser recognizes:

- `model {}` blocks with fields, decorators, and relations
- `object {}` blocks with fields (no decorators or relations)
- Field types: `String`, `Email`, `Int`, `Float`, `Bool`, `Date`, `Record`, `Relation`, and object references
- Modifiers: `?` (optional), `[]` (array)
- Decorators: `@id`, `@unique`, `@default()`, `@now`, `@createdAt`, `@updatedAt`, `@field()`, `@onDelete()`

### 3. Validation

The parsed schema is validated for correctness:

- Every `Relation` field must reference an existing model
- Forward relations must have a `@field()` decorator pointing to a valid `Record` field
- Reverse relations must not have `@field()`
- `Record` fields (except `@id`) must have a corresponding `Relation` field
- Object references must point to existing `object` definitions
- `@unique` and `@default()` decorators must be used on valid field types

### 4. Type Generation

TypeScript types and interfaces are generated for each model and object:

```typescript
// For models: full set of types
export interface User { ... }
export interface UserCreate { ... }
export interface UserUpdate { ... }
export interface UserWhere { ... }
export interface UserSelect { ... }
export interface UserInclude { ... }
export interface UserOrderBy { ... }
// ... and more

// For objects: subset of types
export interface Address { ... }
export interface AddressInput { ... }
export interface AddressWhere { ... }
export interface AddressSelect { ... }
export interface AddressOrderBy { ... }
```

### 5. Model Registry Generation

A runtime registry is generated containing metadata about every model:

- Field names, types, optionality, and array status
- Relation targets, directions, and field references
- Decorator information (id, unique, default values, onDelete behavior)

The query builder uses this registry at runtime to construct correct SurrealQL queries.

### 6. Migration Generation

SurrealQL migration statements are generated:

```sql
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD name ON TABLE user TYPE string;
DEFINE FIELD email ON TABLE user TYPE string ASSERT string::is::email($value);
DEFINE INDEX user_email_unique ON TABLE user FIELDS email UNIQUE;
```

### 7. Client Generation

The `CerialClient` class is generated with:

- `connect()` and `disconnect()` methods
- `migrate()` for explicit migration
- `db` proxy with typed model access

### 8. Formatting and Output

All generated files are formatted with Prettier and written to the output directory. Existing files in the output directory are overwritten.

### 9. Stale File Cleanup

After writing all files, the generator scans the output directory for `.ts` files that were not part of the current generation and removes them. This handles renamed or deleted models, objects, and tuples without requiring a full directory wipe. Empty directories left behind are also cleaned up.

If the `--clean` flag was used, this step is skipped since the output directory was already wiped before generating.

## Typical Workflow

```bash
# 1. Define your schema
# schemas/main.cerial

# 2. Generate the client
bunx cerial generate

# 3. Import and use in your app
# import { CerialClient } from './db-client';

# 4. During development, use watch mode
bunx cerial generate --watch
```

## Troubleshooting

**"No schema files found"** - Check that the schema path is correct and contains `.cerial` files.

**Validation errors** - The generator will report which field or model has an issue. Common problems:

- A `Relation` field references a model that doesn't exist
- A `Record` field doesn't have a corresponding `Relation`
- A forward relation is missing `@field()`

**Output directory not created** - The generator creates the output directory if it doesn't exist.
