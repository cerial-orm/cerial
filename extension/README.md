# Cerial

> Full language support for .cerial schema files, the Prisma-like DSL for SurrealDB.

![Version](https://img.shields.io/visual-studio-marketplace/v/cerial.cerial)
![Installs](https://img.shields.io/visual-studio-marketplace/i/cerial.cerial)
![Rating](https://img.shields.io/visual-studio-marketplace/r/cerial.cerial)

Syntax highlighting, IntelliSense, diagnostics, formatting, navigation, and more for [Cerial](https://github.com/user/cerial) schema files.

## Features

### Syntax Highlighting

Rich TextMate grammar with semantic tokens for models, objects, tuples, enums, literals, decorators, and field types. Works with all VS Code color themes (Dark+, Monokai, One Dark Pro, etc.).

<!-- ![Syntax Highlighting](images/syntax-highlighting.png) -->

### IntelliSense

Smart completions for keywords, field types, decorators, and cross-file type references. Context-aware suggestions know whether you're inside a model, object, tuple, or enum block.

<!-- ![IntelliSense](images/intellisense.png) -->

### Real-time Diagnostics

Parse errors and schema validation from 11 built-in validators. Errors appear as you type with precise line and column locations.

<!-- ![Diagnostics](images/diagnostics.png) -->

### Auto Formatting

Format on save with 9 configurable style options. Column-aligned decorators, consistent indentation, comment normalization, and more.

<!-- ![Formatting](images/formatting.png) -->

### Go to Definition

Ctrl+Click (or F12) to jump to the definition of any model, object, tuple, enum, or literal. Works across files.

### Find All References

Find every usage of a type across all schema files in your workspace.

### Rename Symbol

Safely rename types across all files in a schema group. All references update automatically.

### Hover Documentation

Rich tooltips showing type info, SurrealDB type mappings, and decorator documentation.

<!-- ![Hover](images/hover.png) -->

### Code Actions

Quick fixes for common schema issues: typos, missing decorators, unknown type references. 12 quick fix types available.

### Document Outline

Navigate your schema file through the VS Code Outline panel. Models, objects, tuples, enums, and literals appear in a structured tree.

### Workspace Symbols

Press Ctrl+T to jump to any type definition across your entire workspace.

### Folding

Collapse and expand model, object, tuple, enum, and literal blocks. Comment region folding included.

### Inlay Hints

See inferred FK types on Record fields, automatic behavior indicators (`auto-generated`, `computed`, `sets on create`, `resets on update`), and inherited field sources inline.

<!-- ![Inlay Hints](images/inlay-hints.png) -->

### Document Links

Type references in decorators like `@model(User)` become clickable links that navigate to the target definition.

### Snippets

16 code snippets for common patterns:

| Prefix | Description |
|--------|-------------|
| `model` | New model with id field |
| `abstract` | New abstract model |
| `object` | New embedded object type |
| `tuple` | New tuple type |
| `enum` | New enum type |
| `literal` | New literal union type |
| `rel11` | One-to-one relation pair |
| `rel1n` | One-to-many relation pair |
| `relnn` | Many-to-many relation pair |
| `fdef` | Field with @default |
| `timestamps` | createdAt + updatedAt fields |
| `id` | Standard record ID field |
| `tid` | Typed record ID field |
| `@@unique` | Composite unique constraint |
| `@@index` | Composite index |
| `extends` | Inherit from parent type |

### Multi-Schema Support

Works with `cerial.config.ts` for project-level schema configuration. Multiple isolated schema groups keep types from leaking between them.

## Supported Syntax

**Block types:** `model`, `abstract model`, `object`, `tuple`, `literal`, `enum`

**Field types:** String, Int, Float, Bool, Date, Email, Record, Relation, Uuid, Duration, Decimal, Bytes, Geometry, Number, Any

**Decorators:** @id, @unique, @default, @defaultAlways, @model, @field, @onDelete, @key, @nullable, @now, @createdAt, @updatedAt, @readonly, @flexible, @set, @distinct, @sort, @uuid, @uuid4, @uuid7, @point, @line, @polygon, @multipoint, @multiline, @multipolygon, @geoCollection, @index

**Modifiers:** `extends`, `!!private`, `?` (optional), `[]` (array)

**Directives:** `@@index`, `@@unique`

## Settings

All settings live under the `cerial.*` namespace.

### Formatting

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `cerial.format.alignmentScope` | `group` \| `block` | `group` | Align decorators within each block or across the file |
| `cerial.format.fieldGroupBlankLines` | `single` \| `honor` \| `collapse` | `single` | Blank line handling between field groups |
| `cerial.format.blockSeparation` | `1` \| `2` \| `honor` | `2` | Blank lines between top-level blocks |
| `cerial.format.indentSize` | `2` \| `4` \| `tab` | `2` | Indentation size |
| `cerial.format.inlineConstructStyle` | `single` \| `multi` \| `honor` | `multi` | Style for inline constructs (enums, literals, tuples) |
| `cerial.format.decoratorAlignment` | `aligned` \| `compact` | `aligned` | Column-align decorators or keep compact |
| `cerial.format.trailingComma` | `boolean` | `false` | Trailing commas in multi-line constructs |
| `cerial.format.commentStyle` | `honor` \| `hash` \| `slash` | `honor` | Normalize comment style or preserve existing |
| `cerial.format.blankLineBeforeDirectives` | `always` \| `honor` | `always` | Insert blank line before @@index and @@unique |

### Diagnostics

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `cerial.diagnostics.enabled` | `boolean` | `true` | Enable or disable all diagnostics |

### Inlay Hints

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `cerial.inlayHints.enabled` | `boolean` | `true` | Enable or disable all inlay hints |
| `cerial.inlayHints.inferredTypes` | `boolean` | `true` | Show inferred FK types on Record fields |
| `cerial.inlayHints.behaviorHints` | `boolean` | `true` | Show behavioral hints for fields with automatic behavior |
| `cerial.inlayHints.inheritedFields` | `boolean` | `true` | Show source hints on inherited fields |

### Debugging

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `cerial.trace.server` | `off` \| `messages` \| `verbose` | `off` | Trace communication with the language server |

## Requirements

- VS Code 1.96 or later
- A [Cerial](https://github.com/user/cerial) project with `.cerial` schema files

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Open a folder containing `.cerial` files
3. Start typing. Completions, diagnostics, and formatting kick in automatically

Format on save is enabled by default for `.cerial` files. Tweak formatting preferences through the settings above.

## Development

### Building

```bash
cd extension
bun install              # Install dependencies
bun run build            # Production build (esbuild)
bun run build:dev        # Development build
bun run watch            # Watch mode with auto-rebuild
```

### Testing

The extension has a 4-layer test architecture:

| Layer | Runner | Command | Count |
|-------|--------|---------|-------|
| Unit tests | bun test | `bun run test:unit` | 432 tests |
| Grammar snapshots | bun test | `bun run test:grammar` | 165 tests |
| Integration tests | Mocha + VS Code | `bun run test:integration` | 7 suites |
| E2E tests | Mocha + VS Code | `bun run test:e2e` | 4 suites |

```bash
cd extension
bun run test              # Unit + grammar tests (no VS Code needed)
bun run test:unit         # Unit tests only
bun run test:grammar      # Grammar snapshot tests only
bun run test:integration  # Integration tests (launches VS Code)
bun run test:e2e          # E2E tests (launches VS Code)
```

Integration and E2E tests require a VS Code instance and run via `@vscode/test-electron`. Unit and grammar tests run directly with bun — no VS Code needed.

### Packaging

```bash
cd extension
bun run package           # Create .vsix package
```

## Known Limitations

- No migration preview or diff view
- No embedded SurrealQL highlighting
- No navigation into generated TypeScript code

## License

MIT
