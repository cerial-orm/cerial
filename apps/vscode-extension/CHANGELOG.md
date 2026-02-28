# Changelog

All notable changes will be documented in this file.
For previous versions, see [changelogs/](changelogs/).

## [Unreleased]

## [0.1.0]

### Added

#### Language Support

- `.cerial` file association with language ID, file icon (light and dark variants), and TextMate grammar registration
- Language configuration for comments (`//`, `/* */`), bracket matching, auto-closing pairs, word patterns, and indentation rules
- IPC-based language server with two-pass workspace indexing, file watcher integration, and incremental text synchronization

#### Syntax Highlighting

- TextMate grammar for all `.cerial` constructs: block keywords, field names, types, decorators, string/number literals, comments, and modifiers
- AST-aware semantic tokens layered on top of TextMate for precise coloring of type names, field properties, decorator arguments, enum values, and inherited fields
- Compatible with all VS Code color themes (Dark+, Monokai, One Dark Pro, etc.)

#### IntelliSense

- Context-aware completions for block keywords (`model`, `abstract model`, `object`, `tuple`, `enum`, `literal`)
- 15 primitive type completions (`String`, `Int`, `Float`, `Bool`, `Date`, `Email`, `Record`, `Relation`, `Uuid`, `Duration`, `Decimal`, `Bytes`, `Geometry`, `Number`, `Any`) plus array variants
- Cross-file user-defined type completions for object, tuple, enum, and literal references
- Decorator completions with conflict exclusion (only shows decorators valid for the current context) and snippet arguments for parameterized decorators
- `extends` target completions filtered to compatible parent types
- `@model()` and `@field()` argument completions populated from workspace models and fields
- `Record()` ID type argument completions (`int`, `float`, `string`, `uuid`, object refs, tuple refs)

#### Diagnostics

- Real-time parse error reporting with precise line and column positions
- 11+ schema validators covering ID field requirements, relation pairing, decorator conflict detection, type reference resolution, extends validation, optionality rules, nullable constraints, and more
- Pull-based diagnostic delivery for responsive editing
- Per-file and cross-file validation using resolved AST from the full schema group
- Extension-level diagnostics for decorator validation, unknown type detection, and structural checks beyond ORM validators

#### Code Actions

- 12+ quick fix types for common schema issues
- Add missing `@id` decorator to Record fields
- Remove invalid decorators from wrong contexts (e.g., model-only decorators on object fields)
- Fix unknown type references, typos, and structural problems
- All quick fixes apply as preferred code actions for one-click resolution

#### Hover Documentation

- Type documentation with SurrealDB type mappings for all 15 field types
- Decorator documentation explaining behavior, constraints, and valid contexts
- Field signature info showing the full field declaration
- Block-level hover for model, object, tuple, enum, and literal definitions

#### Inlay Hints

- FK type inference hints showing `CerialId<T>` on Record fields linked via `@model()`
- Behavior indicator hints: `auto-generated` (UUID decorators), `computed` (`@now`), `sets on create` (`@createdAt`, `@default`), `resets on update` (`@updatedAt`, `@defaultAlways`)
- Inheritance source hints showing `from ParentName` on fields inherited via `extends`
- Master toggle (`cerial.inlayHints.enabled`) plus individual toggles for inferred types, behavior hints, and inherited field hints

#### Navigation

- Go to Definition (F12 / Ctrl+Click) for types, models, fields, and `extends` targets across files
- Find All References across all `.cerial` files in the schema group
- Rename Symbol with automatic cross-file updates for type names
- Workspace Symbols (Ctrl+T) for jumping to any type definition across the workspace
- Document Outline showing models, objects, tuples, enums, and literals in a structured tree

#### Document Links

- Clickable cross-file type references for `objectRef`, `tupleRef`, `literalRef`, and `enumRef` fields
- Clickable `extends` parent references, `@model()` arguments, and `Record()` type arguments
- Links navigate directly to the target definition file and position

#### Formatting

- Format document and format selection support via the ORM's formatter engine
- 9 configurable formatting options: `alignmentScope`, `fieldGroupBlankLines`, `blockSeparation`, `indentSize`, `inlineConstructStyle`, `decoratorAlignment`, `trailingComma`, `commentStyle`, `blankLineBeforeDirectives`
- Column-aligned decorators, consistent indentation, and comment style normalization
- Idempotent output: formatting an already-formatted file produces identical results

#### Code Folding

- Block-level folding for `model`, `object`, `tuple`, `enum`, and `literal` blocks
- Comment region folding via regex markers

#### Snippets

- 16 code snippets: `model`, `abstract`, `object`, `tuple`, `enum`, `literal`, `rel11`, `rel1n`, `relnn`, `fdef`, `timestamps`, `id`, `tid`, `@@unique`, `@@index`, `extends`
- Relation snippets generate both sides of the relation (FK field, forward relation, and reverse relation)
- Tabstop placeholders for quick field name and type customization

#### Configuration

- 9 formatting settings under `cerial.format.*` with rich markdown descriptions and enum value documentation
- Diagnostics toggle (`cerial.diagnostics.enabled`) for disabling all parse and validation errors
- 4 inlay hint settings: master toggle plus per-feature toggles for inferred types, behavior hints, and inherited fields
- Language server trace setting (`cerial.trace.server`) with `off`, `messages`, and `verbose` levels

#### Multi-Schema Support

- Workspace-aware schema grouping via `cerial.config.ts` detection
- Isolated type resolution per schema group (types don't leak between groups)
- File watcher integration for detecting schema file additions, renames, and deletions
