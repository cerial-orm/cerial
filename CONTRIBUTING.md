# Contributing to Cerial

Process for people (and agents) making changes. The agent-facing conventions —
code style, test rules, gotchas — live in `CLAUDE.md`. User-facing documentation
lives in `apps/docs/content/docs/`.

## Getting set up

Requires [Bun](https://bun.sh) and Docker.

```bash
bun install                      # from the repo root
docker compose up -d surrealdb   # SurrealDB on :8000, pinned and ephemeral

cd apps/orm
bun test tests/unit tests/generators   # no database needed
bun run test:full                      # everything, database needed
```

`docker-compose.yml` pins `surrealdb/surrealdb:v3.3.0` with the `memory` backend,
the same version and backend CI tests against. The suites expect
`http://127.0.0.1:8000` with `root`/`root` and namespace and database both `main`,
hardcoded in `apps/orm/tests/e2e/test-helper.ts`. Any SurrealDB answering there
works, so if you already run one, use it and skip compose.

Stick to the `memory` backend for tests. On a disk backend the e2e run roughly
doubles and a concurrent many-to-many transaction test fails on lock contention.

`docker compose down` when you are finished. Nothing persists, which is what the
suites want: the e2e preload drops and recreates every table on each run.

Agent-facing conventions — code style, test rules, the SurrealDB gotchas — are in
`CLAUDE.md`.

## Release Notes Rules (CRITICAL)

Release notes live in the **docs site** as the single source of truth. There are no `CHANGELOG.md` files — GitHub Releases link to the docs pages.

**Location:** `apps/docs/content/docs/releases/{orm,extension}/{major}/{minor}.mdx`

- ORM: `apps/docs/content/docs/releases/orm/0/1.mdx` (all 0.1.x patches)
- Extension: `apps/docs/content/docs/releases/extension/0/1.mdx` (all 0.1.x patches)

**URL pattern:** `https://cerial-orm.github.io/cerial/releases/{orm,extension}/{major}/{minor}#{major}{minor}{patch}`
- Example: ORM v0.1.0 → `/releases/orm/0/1#010`
- Example: Extension v0.1.2 → `/releases/extension/0/1#012`

### Format

Follow [Keep a Changelog](https://keepachangelog.com) categories. Each version is a heading that becomes an anchor:

- `### Added` — New features
- `### Changed` — Changes to existing features
- `### Fixed` — Bug fixes
- `### Removed` — Removed features
- `### Deprecated` — Features marked for future removal

### Page structure

Each minor version gets its own `.mdx` page. Patch releases are sections within that page:

```mdx
---
title: 0.1.x
description: ORM release notes for v0.1.x
---

## 0.1.2

### Fixed

- Bug fix description

## 0.1.1

### Added

- Feature description

## 0.1.0

### Added

- Initial minor release features
```

### File hierarchy

When a new minor version is released, create a new `.mdx` file:

```
apps/docs/content/docs/releases/
├── orm/
    │   └── 0/                # Major version 0
        │       ├── 1.mdx         # All 0.1.x patches
        │       └── 2.mdx         # All 0.2.x patches
└── extension/
    └── 0/                # Major version 0
        └── 1.mdx         # All 0.1.x patches
```

### Rules
- **Never edit released version entries** — if a released entry has a typo, fix it in the next patch's `### Fixed`
 - **New version goes at the top** — newest patch at top of the page, oldest at bottom
- **GitHub Releases link to docs** — release workflows create a GitHub Release with a link to the docs page (e.g., `/releases/orm/0/1#010`), not duplicated content
- **Both ORM and extension follow this system independently** — they have separate version numbers and separate release notes pages
- **Extension release notes must include a download table** — Every extension version entry must have a `### Download` section with a table linking to the GitHub Release VSIX asset. Format:
  ```
  ### Download
  | Version | Download |
  |---------|----------|
  | v0.1.0 | [cerial-0.1.0.vsix](https://github.com/cerial-orm/cerial/releases/download/ext-v0.1.0/cerial-0.1.0.vsix) |
  ```
## Commit Rules

### Atomic commits

Each commit should represent **one logical change**. Split work into small, focused commits — one per feature, fix, or concern. This keeps the git history readable and makes each change easy to review, revert, or cherry-pick.

**Split by:**
- Different features or behaviors → separate commits
- Different directories or modules → separate commits
- Implementation vs tests (unless tightly coupled) → separate commits
- Docs vs code → separate commits

**Combine only when:**
- Splitting would break compilation (e.g., type change + all call sites)
- Implementation file + its direct test file for a single feature

### Multi-commit issue fixes

Large fixes or features that span multiple types of changes should use multiple commits. Each user-facing commit should have a corresponding entry in the release notes docs page. Example:

```
Issue: "Inlay hints show wrong labels"

Commit 1: fix(extension): update inlay hint labels for @createdAt/@updatedAt
  → Release notes: ### Changed — Rename 'server-set' hint label to 'auto-generated'

Commit 2: feat(extension): add 'sets on create' inlay hint for @default
  → Release notes: ### Added — Inlay hint for @default fields showing 'sets on create'

Commit 3: docs(extension): update README and settings for new hint labels
  → No release notes entry (docs-only, user behavior unchanged)
```

Each user-facing commit gets its own entry in the release notes page under the correct category (`### Added`, `### Changed`, `### Fixed`, etc.).

### Amend policy

**Amend the previous commit** when a small follow-up change is the same kind of task as the commit it follows — e.g., fixing a typo in a just-committed file, adjusting wording in a just-added doc section, or tweaking a value in a just-written config.

**Do NOT amend when:**
- The previous commit has already been pushed to remote
- The follow-up is a different kind of change (new feature vs fix vs docs)
- The follow-up affects different files or modules than the original commit
- Someone else authored the previous commit

## Release & Branching

**Branching Strategy:**
- `main` — Release branch. Only receives merges from `dev`. Never commit directly
- `dev` — Integration branch. Feature branches merge here. CI runs on push + PRs to dev
- Feature branches — Created from `dev`, merged back to `dev` via PR
- Flow: `feature-branch` → PR to `dev` → test on dev → merge `dev` to `main` → push → tag for release

**Tagging Convention:**
- ORM releases: `orm-v{major}.{minor}.{patch}` (e.g., `orm-v0.1.0`)
- Extension releases: `ext-v{major}.{minor}.{patch}` (e.g., `ext-v0.1.0`)
- Each package has independent versioning and release cycles
- Tags trigger release workflows automatically (orm-v* publishes to npm; ext-v* only packages a VSIX and attaches it to a GitHub Release)
- NEVER push tags from CI — tagging is always a manual release action
- Tag version MUST match package.json version (release workflows verify this)

**Release Process:**
1. Ensure all changes are on `dev` and tests pass
2. Add the version section to the release notes docs page (`apps/docs/content/docs/releases/{orm,extension}/{major}/{minor}.mdx`)
3. Bump version in `package.json`
4. Commit: `chore(orm): release v0.1.0` or `chore(extension): release v0.1.0`
5. Merge `dev` to `main` and push
6. Create and push tag: `git tag orm-v0.1.0 && git push origin orm-v0.1.0`
7. GitHub Actions automatically: runs tests, publishes to npm/marketplace, creates GitHub Release linking to docs page

**GitHub Actions Workflows:**
| Workflow | Trigger | What it does |
|---|---|---|
| `orm-ci.yml` | Push to dev + PRs to dev | Unit tests, E2E (SurrealDB), typecheck, format |
| `extension-ci.yml` | Push to dev + PRs to dev | Build, unit tests, grammar tests (matrix: ubuntu/windows/macos) |
| `orm-release.yml` | `orm-v*` tag push | Build, test, npm publish, GitHub Release linking to docs |
| `extension-release.yml` | `ext-v*` tag push | Build, test, package VSIX, GitHub Release linking to docs. Does NOT publish to the marketplace |
| `docs-deploy.yml` | Push to dev (docs/ changes) | Build Next.js, deploy to GitHub Pages |

**Required GitHub Secrets:**
| Secret | Purpose | Where to create |
|---|---|---|
| `NPM_TOKEN` | npm publish authentication | npmjs.com → Settings → Access Tokens → Granular (read+write) |

**GitHub Repository Settings (manual UI configuration):**
- Settings → Pages → Source: set to "GitHub Actions" (not "Deploy from branch")
- Settings → Branches → Add rule for `main`: require PR reviews, require status checks, restrict push access to maintainers only
- Settings → Tags → Add protection for `orm-v*` and `ext-v*`: restrict creation to maintainers only
- Settings → Rules → Rulesets (alternative to above): create ruleset targeting `main` branch + release tag patterns with role-based restrictions
