# Golden snapshot

`golden-snapshot.test.ts` pins what the generator produces for every schema under
`tests/e2e/schemas/`. It is the reference a second schema frontend is compared against, and the only
check that notices a dependency upgrade changing generated output.

## Layout

One file per schema per part (plus the shared files), under `__snapshots__/`, mirroring the schema path:

| Part | File | Holds |
|---|---|---|
| AST | `ast/<schema>.ast.snap` | the resolved declarations the schema owns (inheritance applied, source positions removed) |
| DDL | `ddl/<schema>.ddl.snap` | the emitted `DEFINE TABLE/FIELD/INDEX` statements per model |
| Registry | `registry/<schema>.registry.snap` | the runtime metadata the client reads: `@onDelete`, `@key`, `@sort`, `@distinct`, relation wiring |
| Types | `types/<schema>.types.snap` | the generated type file of each declaration the schema owns |
| Shared | `shared/<path>.snap` | generated files no one schema owns, whole: `client.ts`, the barrels, `internal/migrations.ts`, `internal/model-registry.ts` |

The DDL and registry parts cover constructs that have no type surface (indexes, delete rules, defaults,
table names, the deliberate skips of tuple-element `DEFINE FIELD`). A type-only snapshot would not
notice a frontend dropping them.

## Determinism

The corpus is generated twice into separate temp directories and every generated file must be
byte-identical across the two runs. Source positions are removed from the AST and object keys are
sorted. Schema discovery sorts file paths, so model order in `client.ts`, the barrels, the migrations
and the registry does not depend on filesystem traversal order.

## Re-approving

```bash
cd apps/orm && bun run snapshot:update
```

This deletes `__snapshots__/` and rewrites it. Review `git diff` of that directory before committing.

A re-approval is legitimate when generator behaviour was changed on purpose and the diff shows exactly
that change and nothing else. It is not legitimate because the test went red. Work out why first: an
unexplained diff is a bug in the change, not in the snapshot.

1. The commit that re-approves says why in its body, naming the construct that moved.
2. A dependency upgrade that changes the snapshot is a finding to investigate, not a formality.
   `oxfmt` formats the generated types, so a formatter upgrade is a legitimate reason for the types part
   to move; `tests/unit/generators/formatting-corpus.test.ts` guards the formatter's byte stability separately.
3. A change that must preserve behaviour and types (a refactor, a performance change, a dependency
   swap) keeps `ast/`, `ddl/` and `registry/` fixed: if one moves, the change is wrong. `types/` and
   `shared/` compare bytes, so a reviewed generator change may move them when it carries a passing
   `bun bench/type-equivalence.ts <before> <after>` run, the select guarantee checks
   (`tests/e2e/typechecks/core/select-guarantees.check.ts`) and its reason in the commit body. Take
   `<before>` with `cp -R` of the generated tree before the edit.

Adding a schema to the corpus also adds snapshot files; the test names the missing file and the same
command writes it.
