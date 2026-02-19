---
title: init
parent: CLI
nav_order: 5
---

# init

The `init` command creates a [config file](./configuration) for your project. It detects existing schema folders and generates a matching config automatically.

```bash
bunx cerial init
```

---

## Options

| Flag    | Alias | Description                               |
| ------- | ----- | ----------------------------------------- |
| `--yes` | `-y`  | Accept all defaults, skip interactive prompts |

---

## What It Does

1. **Checks for an existing config.** If `cerial.config.ts` or `cerial.config.json` already exists, it stops with an error. Delete the existing file first if you want to reinitialize.

2. **Scans for schema folders.** Cerial looks for [convention markers](./configuration#3-convention-markers) (`schema.cerial`, `main.cerial`, `index.cerial`) and legacy directories (`schemas/`, `schema/`).

3. **Asks you to confirm.** In interactive mode, it shows which folders it found and lets you rename them or skip detection.

4. **Asks for output format.** Choose between TypeScript (default) or JSON.

5. **Writes the config file.** A `cerial.config.ts` or `cerial.config.json` is written to the current directory.

---

## Interactive Mode

Running `cerial init` without flags starts an interactive session:

```
$ bunx cerial init

  Found schema folders: ./schemas/auth, ./schemas/cms
  Configure them? (Y/n) Y
  Schema name for ./schemas/auth? (default: auth)
  Schema name for ./schemas/cms? (default: cms)
  Output format: TypeScript or JSON? (default: TypeScript)

  Created cerial.config.ts
```

Schema names default to the folder name. You can type a different name at the prompt or press Enter to accept the default.

---

## Non-Interactive Mode

Pass `--yes` to skip all prompts and accept defaults. This is useful in CI scripts or automated setups:

```bash
bunx cerial init --yes
```

With `--yes`:

- All detected schema folders are included with their default names
- TypeScript format is used
- No prompts are shown

---

## Generated Output

The config content depends on how many schema folders are detected:

### No Schemas Found

A template config with placeholder paths:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schema: './schemas',
  output: './client',
});
```

### Single Schema

A shorthand config pointing to the detected folder:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schema: './schemas/main',
  output: './client',
});
```

### Multiple Schemas

A multi-schema config with each folder as a named entry:

```typescript
import { defineConfig } from 'cerial';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth' },
    cms: { path: './schemas/cms' },
  },
});
```

### JSON Format

If you choose JSON, the same structure is written as `cerial.config.json`:

```json
{
  "schemas": {
    "auth": { "path": "./schemas/auth" },
    "cms": { "path": "./schemas/cms" }
  }
}
```

---

## Overwrite Protection

`cerial init` refuses to overwrite an existing config file, even with `--yes`. If you see this error:

```
A config file already exists: cerial.config.ts
Remove it first if you want to reinitialize.
```

Delete the existing config and run `init` again.

---

## Next Steps

After creating your config, generate the client:

```bash
bunx cerial generate
```

For more on config options, see [Configuration](./configuration). For multi-schema setups, see [Multi-Schema](./multi-schema).
