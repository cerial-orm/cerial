---
title: CLI
nav_order: 11
has_children: true
---

# CLI

The Cerial command-line interface is the primary way to generate your type-safe client from schema files.

```bash
bunx cerial <command> [options]
```

## Available Commands

| Command                  | Description                                  |
| ------------------------ | -------------------------------------------- |
| [`generate`](./generate) | Generate TypeScript client from schema files |

## How It Works

The CLI reads `.cerial` schema files, parses them into an AST (Abstract Syntax Tree), and generates a full TypeScript client with:

- **Types and interfaces** for every model and object in your schema
- **Query builder types** (Create, Update, Where, Select, Include, OrderBy)
- **Model registry** with runtime metadata for the query engine
- **Migration statements** (DEFINE TABLE, DEFINE FIELD, DEFINE INDEX)
- **Client class** with a typed proxy for model access

```bash
# Generate from default paths
bunx cerial generate

# Specify custom paths
bunx cerial generate -s ./schemas -o ./db-client
```

The generated client gives you full type safety across all database operations - from creating records to querying with nested relations and filtered selects.

## Next Steps

- [**generate**](./generate) - Learn about the generate command and its options
- [**Generated Output**](./generated-output) - Understand the structure of the generated client
