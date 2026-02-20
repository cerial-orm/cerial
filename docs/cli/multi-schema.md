---
title: Multi-Schema
parent: CLI
nav_order: 4
---

# Multi-Schema

Cerial supports splitting your data layer into multiple independent schemas, each generating its own typed client. This is useful when your project has distinct domains that shouldn't share types or when different services connect to separate databases.

---

## When to Use Multi-Schema

A few situations where multi-schema makes sense:

- **Domain boundaries** ... your app has an auth service and a CMS, each with their own models. Keeping them separate avoids type collisions and keeps each client focused.
- **Separate databases** ... different schemas connect to different SurrealDB namespaces or instances.
- **Team ownership** ... separate teams own separate parts of the data layer and want independent generation cycles.

For most projects, a single schema is all you need. Don't split unless you have a reason to.

---

## Setup

### 1. Organize Your Schema Files

Create a directory per schema, each with its own `.cerial` files:

```
schemas/
├── auth/
│   ├── schema.cerial       # Convention marker
│   └── permissions.cerial
├── cms/
│   ├── schema.cerial       # Convention marker
│   ├── posts.cerial
│   └── categories.cerial
```

Adding a convention marker (`schema.cerial`, `main.cerial`, or `index.cerial`) to each directory tells Cerial where schema roots are. The marker file can contain model definitions or be empty.

### 2. Create a Config File

Run `cerial init` to auto-detect your schema folders and generate a config:

```bash
bunx cerial init
```

Or create `cerial.config.ts` manually:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth' },
    cms: { path: './schemas/cms' },
  },
});
```

### 3. Generate

```bash
bunx cerial generate
```

Each schema generates its own client in its default output directory:

```
schemas/
├── auth/
│   ├── schema.cerial
│   ├── permissions.cerial
│   └── client/              # Generated: AuthCerialClient
│       ├── client.ts
│       ├── models/
│       └── ...
├── cms/
│   ├── schema.cerial
│   ├── posts.cerial
│   └── client/              # Generated: CmsCerialClient
│       ├── client.ts
│       ├── models/
│       └── ...
```

---

## Client Class Naming

Each schema gets its own client class, derived from the schema name in your config:

| Schema Name | Generated Class       |
| ----------- | --------------------- |
| `auth`      | `AuthCerialClient`    |
| `cms`       | `CmsCerialClient`     |
| `my-api`    | `MyApiCerialClient`   |
| `user_data` | `UserDataCerialClient`|

The name is PascalCased from the config key, with `CerialClient` appended. Hyphens and underscores act as word separators.

A single unnamed schema (using the `schema` shorthand) generates the default `CerialClient`.

---

## Using Multiple Clients

Import each generated client separately:

```typescript
import { AuthCerialClient } from './schemas/auth/client';
import { CmsCerialClient } from './schemas/cms/client';

const auth = new AuthCerialClient();
const cms = new CmsCerialClient();

await auth.connect({
  url: 'http://localhost:8000',
  namespace: 'auth',
  database: 'auth',
  auth: { username: 'root', password: 'root' },
});

await cms.connect({
  url: 'http://localhost:8000',
  namespace: 'cms',
  database: 'cms',
  auth: { username: 'root', password: 'root' },
});

// Each client has its own typed db proxy
const users = await auth.db.User.findMany();
const posts = await cms.db.Post.findMany();
```

Each client is completely independent. Types from one schema don't leak into another.

---

## Custom Output Directories

By default, each schema's client is generated into `{schemaPath}/client`. Override this per-schema or with a shared root:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth', output: './generated/auth' },
    cms: { path: './schemas/cms', output: './generated/cms' },
  },
});
```

Or set a root `output` for schemas that don't specify their own:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth' },
    cms: { path: './schemas/cms' },
  },
  output: './generated',
});
```

---

## Targeting a Single Schema

During development, you might want to regenerate just one schema without waiting for all of them. Use the `-n` flag:

```bash
# Regenerate only the auth schema
bunx cerial generate -n auth

# Regenerate only cms
bunx cerial generate -n cms
```

This filters the config to the named schema and generates only that client. The other schemas are untouched.

---

## Watch Mode with Multi-Schema

Watch mode works across all schemas simultaneously:

```bash
bunx cerial generate --watch
```

Each schema is watched independently. A change to `schemas/auth/schema.cerial` triggers regeneration of the auth client only, leaving the cms client untouched. Changes are debounced (300ms) to avoid redundant rebuilds during rapid editing.

You can combine `-n` with `--watch` to watch just one schema:

```bash
bunx cerial generate -n auth --watch
```

---

## Per-Schema Connections

Different schemas can connect to different databases:

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

Schemas without their own `connection` inherit from the root config.

---

## Convention Markers

If you don't want a config file, Cerial can auto-detect schema roots using convention markers. Place one of these files in each schema directory:

- `schema.cerial` (checked first)
- `main.cerial`
- `index.cerial`

The file can contain model definitions or be empty. Its presence marks the directory as a schema root.

**Single root**: Works without a config. Cerial finds the marker, discovers all `.cerial` files in that directory, and generates a `CerialClient`.

**Multiple roots**: Cerial detects them but requires a config file to know how to name and output each schema. It'll display an error pointing you to `cerial init`.

---

## Per-Schema Filtering

Each schema entry supports `ignore`, `exclude`, and `include` patterns for controlling which `.cerial` files are processed. You can also place a `.cerialignore` file inside a schema folder for folder-scoped exclusions.

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
      exclude: ['deprecated/**'],
      include: ['deprecated/still-active.cerial'],
    },
  },
  ignore: ['**/internal-only/**'],
});
```

Root-level filter fields apply across all schemas. Per-schema fields layer on top. Folder-level configs (placed inside schema directories) also support the same filter fields.

For the full filtering reference, cascade priority, and gotchas, see [Path Filtering](./filtering).

---

## Next Steps

- [**Configuration**](./configuration) - Full config file reference
- [**Path Filtering**](./filtering) - Control which `.cerial` files are processed
- [**init**](./init) - Auto-generate a config with `cerial init`
- [**generate**](./generate) - CLI flags for generation
