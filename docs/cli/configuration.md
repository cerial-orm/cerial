---
title: Configuration
parent: CLI
nav_order: 3
---

# Configuration

Cerial supports an optional config file for controlling schema paths, output directories, and connection settings. This is especially useful for [multi-schema setups](./multi-schema), but it also simplifies single-schema projects by removing the need for CLI flags.

---

## Config File Formats

Cerial accepts two config formats:

- `cerial.config.ts` (TypeScript, recommended)
- `cerial.config.json` (JSON)

If both exist, the TypeScript config takes priority.

### TypeScript Config

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schema: './schemas',
  output: './db-client',
});
```

The `defineConfig()` helper is an identity function that provides autocomplete and type checking in your editor. It doesn't transform your config.

### JSON Config

```json
{
  "schema": "./schemas",
  "output": "./db-client"
}
```

---

## Config Options

### Single Schema (Shorthand)

For projects with one schema, use the `schema` and `output` fields directly:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schema: './schemas',
  output: './db-client',
});
```

| Field        | Type     | Description                              |
| ------------ | -------- | ---------------------------------------- |
| `schema`     | `string` | Path to schema file or directory         |
| `output`     | `string` | Output directory for the generated client |
| `connection`  | `object` | Optional connection config                |

### Multi-Schema (Map)

For projects with multiple schemas, use the `schemas` map. Each key is a schema name, and the value describes where to find and output its client:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth' },
    cms: { path: './schemas/cms', output: './cms-client' },
    analytics: { path: './schemas/analytics' },
  },
  output: './clients',
});
```

| Field      | Type     | Description                                                            |
| ---------- | -------- | ---------------------------------------------------------------------- |
| `schemas`  | `object` | Map of schema name to schema entry                                     |
| `output`   | `string` | Root output directory (used when a schema entry doesn't specify its own) |
| `connection` | `object` | Root connection config (used when a schema entry doesn't specify its own) |

Each schema entry accepts:

| Field        | Type     | Description                                             | Default               |
| ------------ | -------- | ------------------------------------------------------- | --------------------- |
| `path`       | `string` | Path to schema file or directory                        | (required)            |
| `output`     | `string` | Output directory for this schema's generated client      | `{path}/client`       |
| `connection`  | `object` | Connection config for this schema                        | Inherits from root     |

### Output Directory Defaults

When no `output` is specified on a schema entry, Cerial defaults to `{schemaPath}/client`. For example, a schema at `./schemas/auth` generates its client into `./schemas/auth/client`.

If you set a root `output`, schemas without their own `output` will use the root as a base. Explicit per-schema `output` values always take priority.

---

## Schema Discovery

When you run `cerial generate` without the `-s` flag, Cerial looks for schemas through a priority chain:

### 1. CLI Flags

If you pass `-s ./my-schemas`, that path is used directly. No config file lookup happens.

### 2. Config File

If no `-s` flag is given, Cerial searches for `cerial.config.ts` or `cerial.config.json` in the current directory. The config file dictates all schema paths and outputs.

You can also point to a specific config with `-C`:

```bash
bunx cerial generate -C ./config/cerial.config.ts
```

### 3. Folder-Level Config

If no root config exists, Cerial scans subdirectories for `cerial.config.ts` or `cerial.config.json` files placed inside schema folders. See [Folder-Level Config](#folder-level-config) below.

### 4. Convention Markers

Without CLI flags, a root config, or folder configs, Cerial scans the current directory for **convention marker** files:

- `schema.cerial`
- `main.cerial`
- `index.cerial`

A directory containing any of these files is treated as a schema root. All `.cerial` files in that directory are included.

If multiple schema roots are found, Cerial requires a config file to know how to handle them. It'll point you to `cerial init` to set one up.

### 5. Legacy Fallback

If none of the above match, Cerial falls back to looking for a `schemas/` or `schema/` directory in the current working directory.

---

## Folder-Level Config

Instead of a root config file, you can place a `cerial.config.ts` or `cerial.config.json` directly inside each schema folder. The folder itself acts as the schema root — no `schema` or `schemas` keys are allowed.

```
project/
├── schemas/
│   ├── auth/
│   │   ├── cerial.config.ts   ← folder-level config
│   │   ├── user.cerial
│   │   └── session.cerial
│   └── cms/
│       ├── cerial.config.ts   ← folder-level config
│       ├── page.cerial
│       └── block.cerial
```

### Allowed Keys

| Field        | Type     | Description                                             | Default          |
| ------------ | -------- | ------------------------------------------------------- | ---------------- |
| `output`     | `string` | Output directory for generated client (relative to folder) | `./client`       |
| `connection` | `object` | Connection config for this schema                        | None             |

### Example

```typescript
// schemas/auth/cerial.config.ts
export default {
  output: './auth-client',
  connection: {
    url: 'http://localhost:8000',
    namespace: 'auth',
    database: 'auth',
  },
};
```

### Restrictions

- **No `schema` or `schemas` keys** — the folder IS the schema root. Including either key causes a validation error.
- **No nested configs** — if a parent folder and a child folder both contain a config, Cerial throws an error. Only one config per schema hierarchy is allowed.

### Interaction with Root Config

When both a root `cerial.config.ts` and folder-level configs exist, Cerial handles them based on where each folder config sits relative to the root-defined schema paths.

#### Merge

If a root config defines a schema path and a folder config exists at that same path, the folder config's `output` and `connection` values override the root values. Missing keys in the folder config keep the root values (partial override).

Output paths in folder configs resolve relative to the folder directory, not the project root.

```
project/
├── cerial.config.ts          ← root config
├── src/
│   └── auth/
│       ├── cerial.config.ts  ← folder config overrides output
│       ├── user.cerial
│       └── session.cerial
```

Root config:

```typescript
export default defineConfig({
  schemas: {
    auth: { path: './src/auth', output: './generated/auth' },
  },
});
```

Folder config (`src/auth/cerial.config.ts`):

```typescript
export default {
  output: './custom-client',
};
```

Result: the auth schema generates into `src/auth/custom-client/` instead of `./generated/auth`. The schema name, path, and any connection settings from the root config are preserved.

#### Nested Error

If a config file appears inside a *subdirectory* of a root-defined schema path, Cerial throws an error. This prevents ambiguous schema boundaries where it's unclear which config controls which `.cerial` files.

```
project/
├── cerial.config.ts          ← root config defines path './src/auth'
├── src/
│   └── auth/
│       ├── user.cerial
│       └── v2/
│           └── cerial.config.ts  ← ERROR: nested inside root path
```

To fix this, either remove the nested config file or adjust the root config so the paths don't overlap.

#### Coexistence

When folder configs exist in directories *not* defined in the root config, Cerial auto-discovers them as additional schemas. They generate alongside the root-defined schemas.

```
project/
├── cerial.config.ts          ← root config defines auth only
├── src/
│   ├── auth/
│   │   ├── user.cerial
│   │   └── session.cerial
│   └── billing/
│       ├── cerial.config.ts  ← auto-discovered (not in root config)
│       ├── invoice.cerial
│       └── payment.cerial
```

Cerial logs a warning for each auto-discovered schema so you're aware of the extra generation. If you'd prefer explicit control, add the folder to your root config's `schemas` map instead.

Schema names and output paths from auto-discovered folder configs must not collide with root-defined schemas. Collisions cause a validation error.

---

## Connection Config

Both single and multi-schema configs can include connection settings:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schema: './schemas',
  output: './db-client',
  connection: {
    url: 'http://localhost:8000',
    namespace: 'main',
    database: 'main',
    auth: { username: 'root', password: 'root' },
  },
});
```

In a multi-schema setup, each schema can override the root connection:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    main: { path: './schemas/main' },
    analytics: {
      path: './schemas/analytics',
      connection: {
        url: 'http://localhost:8000',
        namespace: 'analytics',
        database: 'analytics',
        auth: { username: 'root', password: 'root' },
      },
    },
  },
  connection: {
    url: 'http://localhost:8000',
    namespace: 'main',
    database: 'main',
    auth: { username: 'root', password: 'root' },
  },
});
```

---

## Validation Rules

Cerial validates your config and reports clear errors:

- `schema` and `schemas` are mutually exclusive. Pick one.
- Schema names must be valid JavaScript identifiers (letters, numbers, `_`, `$`).
- Reserved names (`default`, `index`) are not allowed as schema names.
- Schema paths cannot overlap (one schema's directory can't contain another's).
- Output paths must be unique across all schemas.
- Every schema entry must have a `path`.

---

## Next Steps

- [**Multi-Schema**](./multi-schema) - Set up multiple independent schemas in one project
- [**init**](./init) - Auto-generate a config file with `cerial init`
- [**generate**](./generate) - Run generation with config-based options
