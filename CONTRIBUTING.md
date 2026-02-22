# Contributing to Cerial

Thanks for your interest in contributing to Cerial! This guide covers the conventions you need to follow.

## Changelog

Every commit that changes user-facing behavior **must** add an entry to the `[Unreleased]` section of the relevant package's `CHANGELOG.md`. This includes new features, bug fixes, breaking changes, and deprecations. Internal refactors and test-only changes do not require an entry.

### Which changelog?

Each package maintains its own changelog:

- **ORM** — `CHANGELOG.md` (root, later `apps/orm/CHANGELOG.md`)
- **Extension** — `extension/CHANGELOG.md` (later `apps/extension/CHANGELOG.md`)

If your change affects both packages, add entries to both.

### Format

We follow [Keep a Changelog](https://keepachangelog.com). Use these categories under each version:

- `### Added` — New features
- `### Changed` — Changes to existing features
- `### Fixed` — Bug fixes
- `### Removed` — Removed features
- `### Deprecated` — Features marked for future removal

### How to add an entry

Add your entry under `## [Unreleased]` in the appropriate category:

```markdown
## [Unreleased]

### Fixed

- Fix nullable field validation on tuple elements
```

If the category doesn't exist yet under `[Unreleased]`, create it.

### Version lifecycle

The active `CHANGELOG.md` contains:
- The `[Unreleased]` section (work in progress)
- All patch releases for the **current minor version**

When a new **minor version** is released (e.g., moving from `0.1.x` to `0.2.0`):
1. `[Unreleased]` becomes `## [0.2.0] - YYYY-MM-DD`
2. A fresh empty `## [Unreleased]` is added above
3. All `0.1.x` entries are archived to `changelogs/0/1.md`

### Archive structure

```
package/
├── CHANGELOG.md          # [Unreleased] + current minor
└── changelogs/
    └── 0/                # Major version 0
        ├── 0.md          # All 0.0.x patches in one file
        └── 1.md          # All 0.1.x patches in one file
```

### Rules

- **Never edit released version entries** — if a released entry has a typo, fix it in the next patch's `### Fixed`
- **Don't skip the changelog** — PRs that change user-facing behavior without a changelog entry will be requested to add one


## Commits

### Atomic commits

Each commit should represent **one logical change**. Split work into small, focused commits — one per feature, fix, or concern.

**Split by:**
- Different features or behaviors → separate commits
- Different directories or modules → separate commits
- Implementation vs tests (unless tightly coupled) → separate commits
- Docs vs code → separate commits

**Combine only when:**
- Splitting would break compilation (e.g., type change + all call sites)
- Implementation file + its direct test file for a single feature

### Multi-commit issue fixes

Large fixes or features that span multiple types of changes should use multiple commits. Each commit gets its own changelog entry under the correct category:

```
Commit 1: fix(extension): update inlay hint labels
  → CHANGELOG: ### Changed — Rename 'server-set' hint label to 'auto-generated'

Commit 2: feat(extension): add 'sets on create' inlay hint
  → CHANGELOG: ### Added — Inlay hint for @default fields

Commit 3: docs(extension): update README
  → No changelog entry (docs-only)
```

### Amend policy

Amend the previous commit when a small follow-up is the same kind of task — e.g., fixing a typo in a just-committed file or tweaking wording in a just-added doc.

**Do NOT amend when:**
- The previous commit has been pushed to remote
- The follow-up is a different kind of change (feature vs fix vs docs)
- The follow-up affects different files or modules
- Someone else authored the previous commit

## Code Style

- Single quotes (enforced by Biome)
- Blank line before `return` statements
- Inline single-statement `if` (no braces)
- `const` over `let`, never `var`
- Strict TypeScript — no `any`, no `@ts-ignore`

Run `bun run format` before committing to ensure Biome formatting is applied.

## Testing

- Run `bun test` for unit tests
- Run `bun run test:e2e` for end-to-end tests (requires SurrealDB running)
- Run `bunx tsc --noEmit` after type changes
- Bug fixes must include a test that fails without the fix

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
