# Commit hooks

Two git hooks refuse a commit that breaks a repository rule. Run `bun run setup` once
per clone and they run on every `git commit`.

```bash
bun run setup      # from the repo root; sets core.hooksPath to tooling/hooks
```

Git does not clone its own configuration, so a fresh clone has no hooks until you run
this. The command points `core.hooksPath` at this directory instead of copying scripts
into `.git/hooks`, so there is one copy of each hook under version control and a change
to one takes effect at your next pull.

| Hook | Runs | Refuses |
|---|---|---|
| `pre-commit` | before the editor opens | the staged-tree scans, then the local verify |
| `commit-msg` | after you write the message | a message that breaks the message gate |

A refusal prints a gate label, where it found the problem, the offending line and what
to do. Look the label up in the tables below. The tables also give each rule's stable
identifier, which is what the hook tests name and what stays put when a label's wording
is improved. The hooks print the label, not the identifier.

Every rule refuses. None warns. A check that can be softened is a check that will be.

## The staged-tree scans

The scans read what the commit will contain, not what is on disk. They use
`git show :0:<path>`, so a file you staged only in part is judged by the staged part.
All refusals from one run are printed together, then the commit stops. The verify below
does not run until the scans pass.

| Gate label printed | Rule identifier | Refuses | Where it applies |
|---|---|---|---|
| planning identifier | `tracker.decision-record`, `tracker.specification`, `tracker.plan-item`, `tracker.task-row`, `tracker.ledger-id` | A decision-record id, a specification id, a numbered plan item, a numbered plan row or a capability ledger id | Every committed text file except the planning tree |
| planning cross-reference | `tracker.section-reference` | The section sign | Same |
| planning path | `tracker.planning-path` | A path into the planning tree, which is not shipped and resolves to nothing | Same, except `.gitignore`, whose job is to exclude it |
| stub marker | `stub.come-back-to-it`, `stub.fix-it-later`, `stub.bare-alarm`, `stub.admitted-workaround`, `stub.unfinished-marker`, `stub.unfinished-phrase`, `stub.partial-work`, `stub.stand-in-value` | Text that admits the code is unfinished | Shipping paths only: `apps/orm/src/`, `apps/orm/bin/`, `apps/vscode-extension/client/`, `apps/vscode-extension/server/src/` and `tooling/`. Test trees and docs are out of scope |
| tombstone without a reason | `stub.tombstone-without-a-reason` | A tombstone marker with no reason after it. See the next section | Shipping paths |
| unexplained suppression | `suppression.bare` | An oxlint disable directive with no rule, or with no reason on its line (after `--`) or the line after it | Code files (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) |
| e2e schema setup | `e2e-setup.remove-table`, `e2e-setup.reset-migration-state`, `e2e-setup.migrate` | `REMOVE TABLE`, `resetMigrationState(` or `client.migrate(` in an e2e file | Code files under `apps/orm/tests/e2e/`, except `preload.ts`, `test-helper.ts`, `generated/` the one flexible-key injection test that owns a private table, and the four raw-query surface specs under `raw/surfaces/`, whose graph, vector and time-series tables cannot be declared in a schema |
| cast to any | `ratchet.as-any` | A new line containing a cast to `any`. See the ratchet section | Code files under the paths listed in `baseline.json` |
| ignored path | `paths.ignored` | A newly added file that matches an ignore pattern, which a forced add slips past. Rename it or change the pattern | Added files |
| unregistered table | `registry.unregistered-table` | A model in a newly added e2e schema whose table is missing from the `tables` registry in `apps/orm/tests/e2e/test-helper.ts` | New `.cerial` files under `apps/orm/tests/e2e/schemas/` |
| released release notes | `release-notes.released-entry-edited` | An edit to, or removal of, a section for a version at or below the highest `orm-v*` or `ext-v*` release tag for the scope (compared by version; with no tag, the version `package.json` declares in the previous commit). Correct it in the next patch's Fixed section | Modified release notes under `apps/docs/content/docs/releases/` |
| unreadable source | `scan.unreadable-source` | A source file holding a NUL byte, which the scans cannot read. Write the byte as an escape | Staged files with a source extension |

The stub marker rules are named for what the author was admitting, not for the words they
match. The pattern source cannot spell its own markers without refusing itself, so these
docs do not spell them either. The refusal prints the offending line, so the word is in
front of you.

The same rules run over the whole tracked tree in CI (`bun run tooling/hooks/check-tree.ts`),
so a commit made with `--no-verify` is still caught there. Pass paths to check part of a tree.

## Tombstones

When something is deliberately absent, leave a tombstone instead of an unfinished marker.
The form is the marker, a colon, and a reason of at least 20 characters on the same line:

```ts
// TOMBSTONE: the remote engine has no move verb, so a move here would
// be a copy and a delete under a name that promises neither.
```

A line carrying a well-formed tombstone is exempt from every stub marker rule, so the
reason may use words the scan would otherwise refuse. A tombstone with no reason, or a
reason shorter than 20 characters on its line, is refused as `stub.tombstone-without-a-reason`.
That refusal is what stops the tombstone becoming a way to spell the marker it replaces.
The reason has to sit on the marker's own line. A reason on the next line does not count.

## The ratchet

Casts to `any` appear in the tree already and cannot all be removed in one commit. A rule
that refused any edit to a file holding one would be bypassed within a day, so casts are
ratcheted instead: the count per path may fall and may not rise.

`tooling/hooks/baseline.json` is the file the check reads and the authority for the
numbers. It maps each path prefix to the number of casts recorded under it. At the time of
writing it lists these prefixes, which is a snapshot of that file and not a second source:
`apps/orm/tests/client`, `apps/orm/tests/unit`, `apps/orm/tests/e2e`,
`apps/orm/tests/integration`, `apps/orm/src` and `apps/vscode-extension`. If this page and
the file disagree about a count, the file is right.

Three things refuse a commit:

| Gate label printed | Rule identifier | Means |
|---|---|---|
| cast to any | `ratchet.as-any` | The commit adds a line with a cast to `any` under a listed prefix. Narrow to the real type. A line directly after a `@ts-expect-error` comment that carries a reason is exempt, for negative tests |
| cast to any | `ratchet.count-above-baseline` | The index holds more casts under a prefix than the file records |
| cast to any | `ratchet.baseline-stale` | The index holds fewer casts than the file records. Lower the number in the same commit |
| cast to any | `ratchet.baseline-raised` | The commit edits a recorded count upward, against the version in the previous commit |

A baseline can only fall. The stale rule means a saving is written down in the commit that
makes it, so it cannot be spent a second time. A rise is refused because a ratchet with no
rise check quietly becomes a permission slip: the first inconvenient cast would be absorbed
by editing the number, and the number would stop meaning anything. The rule is also enforced
tree-wide by `tooling/hooks/check-tree.ts`, which fails when a recorded count and the live
count differ.

A ratchet needs a rise check and something that runs it, and for a while this one had
neither. `check-tree.ts` ran the file scans and never opened `baseline.json`, so the command
named as the check for "every baseline matches a live count" could not fail. The pre-commit
hook now runs the reconciliation on every commit and `check-tree.ts` runs it over the whole
tree in CI, in both directions, so an unrecorded fall cannot be spent twice either.

If you set out to confirm the counts yourself, count the way the ratchet counts:
`git grep --cached -o -P '\bas\s+any\b'`. A plain `grep -rno 'as any'` gives wrong answers
twice over, because it matches the substring inside "has any" and it reads untracked and
ignored directories. The record was believed stale for a day on the strength of exactly that
mistake.

To lower a count, remove casts, run `bun run tooling/hooks/check-tree.ts` to see the new
live count, put that number in `baseline.json` and commit both together.

## The local verify

After the scans pass, `pre-commit` runs four steps in order and stops at the first that
fails. A step that cannot start counts as failed. The refusal reads
`This commit is refused by the verify.` and names the step and its exit code.

| Step | Where | Command |
|---|---|---|
| oxfmt check on the staged files | repo root | `bun x oxfmt --check` over the staged paths |
| oxlint on the staged files | repo root | `bun x oxlint --deny-warnings` over the staged paths |
| ORM unit suites | `apps/orm` | `bun run test`, the package's own `test` script, so the hook and the documented unit scope are one list |
| extension unit and grammar suites | `apps/vscode-extension` | `bun test tests/unit tests/grammar` |

The whole verify takes about three minutes on a quiet machine. The ORM unit suites are about 12,300 tests and dominate; the extension's suites are 656 tests in about 90 ms.

The verify stops here on purpose, and nobody should "fix" that by adding more.

- `bun run test:full` regenerates the client, runs the compile-time checks, then runs the
  e2e suite against a live SurrealDB. A contributor without a database running could not
  commit at all, and the first thing they would learn is `--no-verify`. A gate that teaches
  people to skip it is worse than a narrower one they keep.
- The extension's `test:integration` and `test:e2e` launch `vscode-test`. Only one such
  process may run on a machine at a time, so a pre-commit hook starting one would break any
  concurrent run, including one you started yourself.
- The generated client, the typechecks, the integration suite and the e2e suite stay in CI.
  Run them yourself before you push: see `CONTRIBUTING.md` for the database setup.

Do not add the e2e run, the integration run or either `vscode-test` suite to
`tooling/hooks/verify.ts`.

## The message gate

`commit-msg` reads the prepared message. Comment lines and the verbose diff are dropped
first. Merge and revert subjects that git writes itself skip the shape rules.

Content rules, matched on every line of the message:

| Gate label printed | Rule identifiers | Refuses |
|---|---|---|
| planning identifier, planning cross-reference, planning path | the `tracker.*` rules above | The same planning shapes as in files. The tree scan and the message gate share one pattern source |
| status claim | `message.status-*` (nine rules) | A result instead of a change: "all green", "12/12", "tests pass", "zero failures", "coverage is 90" |
| process noise | `message.process-*` (four rules) | The work of looking offered as work done: "ran the scan", "cleanup pass", "after a review" |
| defensive narration | `message.defensive-*` (ten rules) | Reassurance about what did not happen: "no behaviour change", "purely cosmetic", "should be safe" |
| attribution | `message.attribution-*` (nine rules) | Who or what produced the change: a vendor or tool name, a generated-by line, a session trailer, a co-author trailer naming a bot or a model. A co-author trailer naming a person is allowed |

Shape rules, all printed with the gate label `shape`:

| Rule identifier | Refuses |
|---|---|
| `shape.subject-missing` | An empty message |
| `shape.subject-too-long` | A subject over 72 characters |
| `shape.subject-trailing-period` | A subject ending in a period |
| `shape.subject-not-conventional` | A subject that does not read `type(scope): description` |
| `shape.type-unknown` | A type other than `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`, `style`, `revert` |
| `shape.scope-unknown` | A scope other than `orm`, `extension`, `docs`, `repo`. The scope may be left out |
| `shape.subject-not-imperative` | A description whose first word reads as past tense or third person: write `add`, not `added` or `adds` |
| `shape.release-form` | A `release v` subject that is not `chore(orm): release v1.2.3` or `chore(extension): release v1.2.3` |
| `shape.release-version` | A release subject whose version differs from the one the staged `package.json` declares |
| `shape.body-not-separated` | No blank line between subject and body |
| `shape.body-missing` | No body on a `feat`, `fix`, `refactor` or `perf` commit |
| `shape.body-too-few-sentences` | A body on those types with fewer than two finished sentences (ended by `.`, `!` or `?`) |
| `shape.body-line-too-long` | A body line over 80 characters. Lines with no spaces and trailer lines are left alone |

A body is required for `feat`, `fix`, `refactor` and `perf`, because the diff cannot say why
a behaviour changed or a defect was fixed. It is not required for `docs`, `test`, `chore`,
`build`, `ci` or `style`. The evidence is in the history: across the last fifty commits the
median body is nine non-blank lines, and every body under three lines is a release-note
`docs` commit whose subject already says everything. A flat minimum would have refused a
fifth of this repository's own commits.

## Known blind spots

These are narrow enough to document rather than fix. If you hit one, it is known, and CI will
not catch it either, because CI runs the same scans.

- **The ratchet reaches six path prefixes.** Only the prefixes recorded in `baseline.json` are
  counted, so a new cast to `any` under `apps/orm/tests/parser` or any other path passes. There
  are none there today. The project rule covers every test; the enforcement does not.
- **The registry scan reads new schema files only.** It checks `.cerial` files newly added under
  `apps/orm/tests/e2e/schemas/`. A model added to an existing file is not checked against the
  `tables` registry.
- **The e2e setup scan names its receiver.** It matches `client.migrate(`, so `db.migrate()` or
  `c.migrate()` in an e2e file escapes it.

When you audit a ratchet, count the way the ratchet counts. A plain `grep` for the text once
reported a stale baseline because it matched the substring inside "has any" and read ignored
directories; the hook's own counter showed every recorded number was right.

## Skipping the hooks

`git commit --no-verify` skips both hooks. It stays available for emergencies, because a
gate with no escape gets bypassed structurally instead of visibly. If you use it, say so in
the commit body so a reviewer can see it was a choice.

A bypassed commit is not a hidden one. CI runs the same scans over the whole tree, so the
refusal comes back on the pull request instead of at your desk. Fixing the cause is faster
than waiting for that.
