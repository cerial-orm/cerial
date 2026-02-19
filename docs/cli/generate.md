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

| Flag              | Alias | Description                                       | Default     |
| ----------------- | ----- | ------------------------------------------------- | ----------- |
| `--schema <path>` | `-s`  | Path to schema file or directory                  | `./schemas` |
| `--output <path>` | `-o`  | Output directory for generated client             | -           |
| `--config <path>` | `-C`  | Path to config file                               | -           |
| `--name <name>`   | `-n`  | Target a specific schema by name (multi-schema)   | -           |
| `--clean`         | `-c`  | Delete entire output directory before generating  | `false`     |
| `--watch`         | `-w`  | Watch for schema changes and regenerate           | `false`     |
| `--verbose`       | `-v`  | Verbose output showing generation details         | `false`     |
| `--log <level>`   | `-l`  | Log output level: `minimal`, `medium`, or `full`  | `minimal`   |
| `--help`          | `-h`  | Show help message                                 | -           |

When using a [config file](./configuration), the `-o` flag is optional since output paths come from the config. Without a config, `-o` is required.

## Examples

### Generate with a config file

If you have a `cerial.config.ts` or `cerial.config.json` in your project root, just run:

```bash
bunx cerial generate
```

Cerial auto-discovers the config and uses its schema paths and output directories. See [Configuration](./configuration) for config file setup.

### Specify a config file path

Point to a config file in a non-default location:

```bash
bunx cerial generate -C ./config/cerial.config.ts
```

### Specify paths directly

Skip the config and pass schema and output paths on the command line:

```bash
bunx cerial generate -s ./schemas -o ./db-client
```

### Single schema file

Generate from a single `.cerial` file instead of a directory:

```bash
bunx cerial generate -s ./schema.cerial -o ./generated
```

### Target a specific schema

In a [multi-schema](./multi-schema) setup, regenerate just one schema by name:

```bash
bunx cerial generate -n auth
```

The name matches a key in your config's `schemas` map. Only that schema is regenerated; the rest are untouched. This flag only works with a config file.

### Watch mode

Automatically regenerate the client whenever schema files change:

```bash
bunx cerial generate --watch
```

Watch mode monitors your schema files for changes and triggers regeneration each time a `.cerial` file is created, modified, or deleted. Changes are debounced (300ms) to coalesce rapid edits into a single rebuild.

With a multi-schema config, each schema is watched independently. A change to one schema only regenerates that schema's client.

You can combine `-n` with `--watch` to focus on a single schema:

```bash
bunx cerial generate -n auth --watch
```

### Clean output

Delete the entire output directory before generating, ensuring a completely fresh output with no leftover files:

```bash
bunx cerial generate -s ./schemas -o ./db-client --clean
```

Without `--clean`, stale files from previous generations (e.g., types for renamed or removed models) are automatically detected and removed after generating. The `--clean` flag is useful when you want a guaranteed clean slate, such as after major schema restructuring.

### Verbose output

See detailed information about what the generator is doing at each step:

```bash
bunx cerial generate --verbose
```

## What Happens During Generation

The generation process follows a pipeline architecture:

### 1. Schema Discovery

The generator resolves schema files through a priority chain (see [Configuration](./configuration#schema-discovery) for full details):

1. **CLI flags** (`-s`) - The given path is used directly
2. **Config file** - Schema paths from `cerial.config.ts` or `cerial.config.json`
3. **Convention markers** - Directories containing `schema.cerial`, `main.cerial`, or `index.cerial`
4. **Legacy fallback** - A `schemas/` or `schema/` directory in the current working directory

Once resolved, each path can be:

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
# schemas/schema.cerial

# 2. Set up a config (optional, but recommended)
bunx cerial init

# 3. Generate the client
bunx cerial generate

# 4. Import and use in your app
# import { CerialClient } from './client';

# 5. During development, use watch mode
bunx cerial generate --watch
```

## Troubleshooting

**"No schema files found"** - Check that the schema path is correct and contains `.cerial` files.

**Validation errors** - The generator will report which field or model has an issue. Common problems:

- A `Relation` field references a model that doesn't exist
- A `Record` field doesn't have a corresponding `Relation`
- A forward relation is missing `@field()`

**Output directory not created** - The generator creates the output directory if it doesn't exist.
