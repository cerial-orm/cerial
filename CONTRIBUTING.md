# Contributing to Cerial

Thanks for your interest in contributing to Cerial! This guide covers the conventions you need to follow.

## Release Notes

Every commit that changes user-facing behavior **must** add an entry to the relevant release notes page. This includes new features, bug fixes, breaking changes, and deprecations. Internal refactors and test-only changes do not require an entry.

### Where do release notes live?

Release notes are maintained in the **docs site** as the single source of truth. There are no `CHANGELOG.md` files.

- **ORM** — `apps/docs/content/docs/releases/orm/{major}/{minor}.mdx`
- **Extension** — `apps/docs/content/docs/releases/extension/{major}/{minor}.mdx`

If your change affects both packages, add entries to both.

### Format

We follow [Keep a Changelog](https://keepachangelog.com) categories:

- `### Added` — New features
- `### Changed` — Changes to existing features
- `### Fixed` — Bug fixes
- `### Removed` — Removed features
- `### Deprecated` — Features marked for future removal

### How to add an entry

Add your entry under the current version's heading in the appropriate category:

```mdx
## 0.1.1

### Fixed

- Fix nullable field validation on tuple elements
```

If the category doesn't exist yet under the version heading, create it. Newest version goes at the top of the page.

### Rules

- **Never edit released version entries** — if a released entry has a typo, fix it in the next patch's `### Fixed`
- **Don't skip release notes** — PRs that change user-facing behavior without a release notes entry will be requested to add one

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

Large fixes or features that span multiple types of changes should use multiple commits. Each user-facing commit should have a corresponding entry in the release notes docs page:

```
Commit 1: fix(extension): update inlay hint labels
  → Release notes: ### Changed — Rename 'server-set' hint label to 'auto-generated'

Commit 2: feat(extension): add 'sets on create' inlay hint
  → Release notes: ### Added — Inlay hint for @default fields

Commit 3: docs(extension): update README
  → No release notes entry (docs-only)
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

- Run `bunx tsc --noEmit` after type changes
- Run `bun run test:full` for full test suite
- Bug fixes must include a test that fails without the fix

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
