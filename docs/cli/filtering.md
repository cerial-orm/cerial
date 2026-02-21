---
title: Path Filtering
parent: CLI
nav_order: 6
---

# Path Filtering

Cerial lets you control which `.cerial` files are processed during generation. You can exclude drafts, vendor schemas, test fixtures, or anything else you don't want in your generated client.

Three mechanisms work together: config fields, `.cerialignore` files, and a cascading resolution order.

---

## Filter Fields

All three filter fields accept arrays of glob patterns (`.gitignore`-style syntax).

| Field     | Type       | Description                                                                                      |
| --------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `ignore`  | `string[]` | Absolute exclusion. Nothing can override these patterns. Files matching `ignore` are never processed. |
| `exclude` | `string[]` | Standard exclusion. Files matching are excluded unless rescued by `include`.                       |
| `include` | `string[]` | Whitelist override. Overrides `exclude` and `.cerialignore` patterns, but NOT `ignore`.           |

These fields are available on `CerialConfig` (root level), `SchemaEntry` (per-schema), and `FolderConfig` (folder-level configs).

{: .note }
`include` only overrides exclusions. Without `exclude` or a `.cerialignore` file, `include` has no effect. It's not a whitelist-only filter.

---

## `.cerialignore` File

Place a `.cerialignore` file at your project root or inside a schema folder to exclude files using `.gitignore`-style syntax.

### Syntax

- Lines starting with `#` are comments
- `!` negates a pattern (re-includes a previously excluded path)
- Trailing `/` matches directories
- `**` matches recursively across directories
- Standard glob wildcards (`*`, `?`, `[...]`) work as expected

### Example

```
# Exclude draft schemas
drafts/

# Exclude generated files
**/generated/

# But keep this specific file
!drafts/important.cerial
```

### Scope

- A `.cerialignore` at the **project root** applies to all schemas, even when using the `-s` flag.
- A `.cerialignore` inside a **schema folder** only affects that folder's schemas.

Both can coexist. Root-level patterns apply first, then folder-level patterns layer on top.

---

## Cascade Priority

When multiple filter sources exist, Cerial resolves them in this order:

| Priority      | Source                        | Overridable?                              |
| ------------- | ----------------------------- | ----------------------------------------- |
| 1 (highest)   | `ignore` (any level)          | No. Absolute blacklist.                   |
| 2             | Root `.cerialignore`          | Yes, by root `include`                    |
| 3             | Root `exclude`                | Yes, by root `include`                    |
| 4             | Schema entry `exclude`        | Yes, by schema entry `include`            |
| 5             | Folder `.cerialignore`        | Yes, by folder `include`                  |
| 6             | Folder `exclude`              | Yes, by folder `include`                  |
| 7 (default)   | Included                      |                                           |

A file starts as included. Each level can exclude it. The matching `include` at that level can rescue it. But if any `ignore` pattern matches, the file is gone for good.

---

## Config Examples

### Root-Level Filtering

Exclude test fixtures across all schemas:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth' },
    cms: { path: './schemas/cms' },
  },
  exclude: ['**/test-fixtures/**'],
});
```

### Per-Schema Filtering

Each schema entry can have its own filter patterns:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    auth: {
      path: './schemas/auth',
      exclude: ['**/*.draft.cerial'],
    },
    cms: {
      path: './schemas/cms',
      ignore: ['internal/**'],
      include: ['internal/public-api.cerial'],
    },
  },
  exclude: ['**/test-fixtures/**'],
});
```

In this config, the `cms` schema ignores everything under `internal/` except `internal/public-api.cerial`. Wait... that won't work. `ignore` is absolute, so `include` can't rescue files matched by `ignore`. To exclude a directory but keep one file, use `exclude` + `include`:

```typescript
cms: {
  path: './schemas/cms',
  exclude: ['internal/**'],
  include: ['internal/public-api.cerial'],
},
```

### Folder-Level Config Filtering

Folder configs support the same filter fields:

```typescript
// schemas/auth/cerial.config.ts
export default {
  output: './client',
  exclude: ['deprecated/**'],
};
```

Patterns in folder configs are relative to the folder directory.

---

## Common Use Cases

**Exclude draft or experimental schemas:**

```typescript
exclude: ['**/*.draft.cerial', '**/experimental/**']
```

**Exclude vendor or third-party schemas:**

```typescript
ignore: ['vendor/**', 'third-party/**']
```

**Exclude test fixtures from generation:**

```typescript
exclude: ['**/test-fixtures/**', '**/fixtures/**']
```

**Include specific files from an otherwise excluded directory:**

```typescript
exclude: ['legacy/**'],
include: ['legacy/still-needed.cerial']
```

---

## Gotchas

### Parent-directory negation doesn't work in `.cerialignore`

Writing `dir/` then `!dir/keep.cerial` in the same `.cerialignore` won't rescue the file. This is standard `.gitignore` behavior: once a parent directory is excluded, negating a child inside it has no effect.

Use config `include` instead:

```typescript
exclude: ['dir/**'],
include: ['dir/keep.cerial']
```

### `include` is not a standalone whitelist

`include` only overrides exclusions. If nothing is excluded, `include` does nothing. You can't use `include` alone to say "only process these files."

### Pattern relativity

Patterns are always relative to their scope:

- Root config patterns are relative to the project root
- Schema entry patterns are relative to the schema path
- Folder config patterns are relative to the folder

### No `../` escaping

Patterns cannot escape their scope directory. A pattern like `../other-schema/*.cerial` is rejected during validation.

### No CLI flags for filtering

Filtering is config-only. There are no `--ignore`, `--exclude`, or `--include` CLI flags.

---

## `cerial init`

The [`cerial init`](./init) command offers to create a `.cerialignore` file with sensible defaults when scaffolding your project config.

---

## Next Steps

- [**Configuration**](./configuration) - Full config file reference
- [**Multi-Schema**](./multi-schema) - Per-schema filter patterns in multi-schema setups
- [**init**](./init) - Scaffold a config and `.cerialignore` with `cerial init`
