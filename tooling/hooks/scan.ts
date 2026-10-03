// Reading the staged tree, and the two scans that run over it.

import {
  E2E_SETUP_PATTERNS,
  firstHit,
  hasTombstone,
  type Pattern,
  PLANNING_PATH,
  type Rule,
  STUB_PATTERNS,
  SUPPRESSION,
  SUPPRESSION_DIRECTIVE,
  SUPPRESSION_INLINE_REASON,
  SUPPRESSION_NEXT_LINE_REASON,
  TOMBSTONE_MARKER,
  TOMBSTONE_MIN_REASON,
  TRACKER_EXEMPT_PATHS,
  TRACKER_PATTERNS,
} from './patterns.ts';

export interface Refusal {
  /** The rule that refused, named so a test holds it without matching prose. */
  readonly rule: string;
  readonly gate: string;
  /** Where the hit is: a path with a line number, or the name of the input. */
  readonly where: string;
  /** The offending line, trimmed and shortened for the report. */
  readonly line: string;
  readonly hint: string;
}

export interface StagedFile {
  readonly path: string;
  readonly content: string;
}

const MAX_REPORTED_LINE = 120;

/** Runs git and returns its stdout, or null when git refused the request. */
export function git(args: string[]): Uint8Array | null {
  const run = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });

  return run.exitCode === 0 ? run.stdout : null;
}

/** The same, decoded as text. */
export function gitText(args: string[]): string | null {
  const out = git(args);

  return out === null ? null : new TextDecoder().decode(out);
}

/** Paths added, copied, modified or renamed in the index. */
export function stagedPaths(): string[] {
  const out = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']);
  if (out === null) return [];
  return new TextDecoder()
    .decode(out)
    .split('\0')
    .filter((path) => path.length > 0);
}

/**
 * The staged content of a path, which is what the commit will carry. It differs
 * from the file on disk whenever only part of a file was added.
 *
 * Returns null for a path git will not hand back and for anything holding a NUL
 * byte, which is how a text scan recognises a file it has no business reading.
 */
export function stagedContent(path: string): string | null {
  const blob = git(['show', `:0:${path}`]);
  if (blob === null) return null;
  if (blob.includes(0)) return null;
  return new TextDecoder().decode(blob);
}

/**
 * Extensions whose files are source and are therefore text. A file with one of
 * these that git will not hand back as text is refused rather than skipped: it
 * would otherwise pass every scan below without being read, which is the one
 * way a marker or a planning identifier reaches a commit unexamined.
 */
const TEXT_SUFFIXES: readonly string[] = [
  '.cjs',
  '.css',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.md',
  '.mjs',
  '.res',
  '.resi',
  '.rs',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml',
];

export function isSourcePath(path: string): boolean {
  return TEXT_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

export interface Staged {
  /** What the scans below read. */
  readonly files: StagedFile[];
  /** Source files that could not be read as text, which is itself a refusal. */
  readonly refusals: Refusal[];
}

export function readStaged(): Staged {
  const files: StagedFile[] = [];
  const refusals: Refusal[] = [];
  for (const path of stagedPaths()) {
    const content = stagedContent(path);
    if (content !== null) {
      files.push({ path, content });
      continue;
    }
    if (isSourcePath(path)) {
      refusals.push({
        rule: 'scan.unreadable-source',
        gate: 'unreadable source',
        where: path,
        line: '',
        hint: 'A source file holding a NUL byte is not read by the scans, so it would reach a commit unexamined. Write the byte as an escape.',
      });
    }
  }
  return { files, refusals };
}

/** The planning tree, which is the one place a planning identifier belongs. */
export function isPlanningPath(path: string): boolean {
  return PLANNING_PATH.test(path);
}

/** Test trees, which the stub scan leaves alone and the tracker scan reads. */
export function isTestPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((s) => s === 'tests' || s === 'test' || s === '__tests__')) return true;
  if (segments.some((s) => s === 'vectors' || s === 'fixtures' || s === 'testdata')) return true;
  const name = segments[segments.length - 1] ?? '';
  return /\.(?:test|spec)\.[a-z]+$/.test(name) || /_test\.[a-z.]+$/.test(name);
}

/**
 * Paths whose content reaches a user or a contributor's machine: the ORM and the
 * extension sources, and the tooling that gates every commit. Documentation and
 * schemas may discuss an unfinished marker without being unfinished.
 */
const SHIPPING_PREFIXES: readonly string[] = [
  'apps/orm/src/',
  'apps/orm/bin/',
  'apps/vscode-extension/client/',
  'apps/vscode-extension/server/src/',
  'tooling/',
];

export function isShippingPath(path: string): boolean {
  return SHIPPING_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const CODE_SUFFIXES: readonly string[] = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

export function isCodePath(path: string): boolean {
  return CODE_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

/** The one refusal shape, taking what refused from the rule that did. */
export function report(found: Rule, path: string, index: number, line: string): Refusal {
  const shown = line.trim();
  return {
    rule: found.rule,
    gate: found.gate,
    where: `${path}:${index + 1}`,
    line: shown.length > MAX_REPORTED_LINE ? `${shown.slice(0, MAX_REPORTED_LINE)}…` : shown,
    hint: found.hint,
  };
}

function applicable(path: string, pattern: Pattern): boolean {
  if (pattern.gate !== 'planning path') return true;
  return !TRACKER_EXEMPT_PATHS.includes(path);
}

/**
 * Planning identifiers in a file that is about to be committed. Everything
 * committed is in scope except the planning tree itself.
 */
export function scanTracker(path: string, content: string): Refusal[] {
  if (isPlanningPath(path)) return [];
  const patterns = TRACKER_PATTERNS.filter((pattern) => applicable(path, pattern));
  const refusals: Refusal[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    const hit = firstHit(line, patterns);
    if (hit !== null) {
      refusals.push(report(hit.pattern, path, index, line));
    }
  }
  return refusals;
}

/**
 * Code that admits it is unfinished, in a path that ships. A line carrying a
 * tombstone with a reason is exempt; a bare tombstone marker is refused, so the
 * exemption cannot be taken without paying for it.
 */
export function scanStubs(path: string, content: string): Refusal[] {
  if (isPlanningPath(path) || isTestPath(path) || !isShippingPath(path)) return [];
  const refusals: Refusal[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (hasTombstone(line)) continue;
    if (TOMBSTONE_MARKER.test(line)) {
      refusals.push(
        report(
          {
            rule: 'stub.tombstone-without-a-reason',
            gate: 'tombstone without a reason',
            hint: `A tombstone carries a reason of at least ${TOMBSTONE_MIN_REASON} characters on the same line.`,
          },
          path,
          index,
          line,
        ),
      );
      continue;
    }
    const hit = firstHit(line, STUB_PATTERNS);
    if (hit !== null) {
      refusals.push(report(hit.pattern, path, index, line));
    }
  }
  return refusals;
}

/** A lint suppression with no rule, or with no reason on its line or the next one. */
export function scanSuppressions(path: string, content: string): Refusal[] {
  if (!isCodePath(path)) return [];
  const refusals: Refusal[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (!SUPPRESSION_DIRECTIVE.test(line)) continue;
    const explained = SUPPRESSION_INLINE_REASON.test(line) || SUPPRESSION_NEXT_LINE_REASON.test(lines[index + 1] ?? '');
    if (SUPPRESSION.regex.test(line) || !explained) refusals.push(report(SUPPRESSION, path, index, line));
  }

  return refusals;
}

/** The end-to-end tree, minus the two files whose job is the global setup. */
export function isE2eSpecPath(path: string): boolean {
  if (!isCodePath(path) || !path.startsWith('apps/orm/tests/e2e/')) return false;
  // The generated client emits migration statements, and it is not a spec. It is
  // ignored by git so it is never staged, but a whole-tree scan reads it off disk.
  if (path.startsWith('apps/orm/tests/e2e/generated/')) return false;

  return !E2E_SETUP_EXEMPT_PATHS.includes(path);
}

/**
 * Paths allowed to do their own schema work.
 *
 * The preload and the helper own the global setup, so they are where it belongs.
 * The injection test is the one spec that may: it creates and removes a table of
 * its own that no other file and no registry knows about, which is the only way
 * to prove a crafted key cannot drop one. It races nothing, because nothing else
 * can see that table. A spec touching a registered table does race the preload,
 * which is what this rule exists to stop, so add to this list only with a reason
 * of that kind.
 */
// A hostile-input suite carries DDL inside payload strings on purpose, so the scan cannot tell it
// from the real thing: the dangerous shape, a statement passed to the executor, is also a string
// literal. Each exemption is therefore a deliberate entry rather than a directory rule.
const E2E_SETUP_EXEMPT_PATHS: readonly string[] = [
  'apps/orm/tests/e2e/preload.ts',
  'apps/orm/tests/e2e/test-helper.ts',
  'apps/orm/tests/e2e/complex-types/objects/flexible-key-injection.test.ts',
  'apps/orm/tests/e2e/negative/hostile-keys.test.ts',
  'apps/orm/tests/e2e/negative/identifier-sites.test.ts',
  'apps/orm/tests/e2e/negative/include-order-by.test.ts',
  // The multi-schema specs build their own generated clients from their own fixtures and migrate
  // each one themselves, because migration sequencing across two clients is the behaviour under
  // test: you cannot assert "the first client re-runs its migration" without clearing that
  // client's own migration memo. Their tables are `ms_rt_*`, declared in fixtures no registry
  // knows, and they run against a database of their own that they remove afterwards. They race
  // nothing, because nothing else can see any of it.
  'apps/orm/tests/e2e/multi-schema/runtime-helpers.ts',
  'apps/orm/tests/e2e/multi-schema/runtime.test.ts',
  'apps/orm/tests/e2e/multi-schema/same-model-name.test.ts',
];

/** Schema setup in an end-to-end file, for the lines the caller names (every line when none). */
export function scanE2eSetup(path: string, content: string, only?: ReadonlySet<number>): Refusal[] {
  if (!isE2eSpecPath(path)) return [];
  const refusals: Refusal[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (only && !only.has(index + 1)) continue;
    const line = lines[index] as string;
    const hit = firstHit(line, E2E_SETUP_PATTERNS);
    if (hit !== null) refusals.push(report(hit.pattern, path, index, line));
  }

  return refusals;
}

export function scanFiles(files: readonly StagedFile[]): Refusal[] {
  const refusals: Refusal[] = [];
  for (const file of files) {
    refusals.push(...scanStubs(file.path, file.content));
    refusals.push(...scanTracker(file.path, file.content));
    refusals.push(...scanSuppressions(file.path, file.content));
  }

  return refusals;
}
