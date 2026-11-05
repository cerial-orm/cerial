// The scans that need git beyond reading a file: the lines a commit adds, the
// paths it adds, and the state of the commit before it.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toSnakeCase } from '../../apps/orm/src/utils/string-utils.ts';
import { AS_ANY, SANCTIONED_TYPE_ERROR } from './patterns.ts';
import { gitText, isCodePath, type Refusal, report, type StagedFile, scanE2eSetup, stagedContent } from './scan.ts';

const ROOT = join(import.meta.dir, '..', '..');
const BASELINE_FILE = 'tooling/hooks/baseline.json';
const REGISTRY_FILE = 'apps/orm/tests/e2e/test-helper.ts';
const SCHEMA_DIR = 'apps/orm/tests/e2e/schemas/';
const ORM_PREFIX = 'apps/orm/';
const INTERPOLATION_SCANNER = 'apps/orm/tests/unit/query/interpolation-sites.ts';
const INTERPOLATION_ALLOWLIST = 'apps/orm/tests/unit/query/interpolation-allowlist.json';
const RELEASE_NOTES = /^apps\/docs\/content\/docs\/releases\/(orm|extension)\/.+\.mdx$/;

export const PACKAGE_FOR_SCOPE: Readonly<Record<string, string>> = {
  orm: 'apps/orm/package.json',
  extension: 'apps/vscode-extension/package.json',
};

export type Baseline = Readonly<Record<string, Readonly<Record<string, number>>>>;

function refusal(rule: string, gate: string, where: string, line: string, hint: string): Refusal {
  return { rule, gate, where, line, hint };
}

/** Line numbers, in the new file, that a zero-context unified diff adds. */
export function parseAddedLines(diff: string): number[] {
  const added: number[] = [];
  for (const line of diff.split('\n')) {
    const header = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header === null) continue;
    const start = Number(header[1]);
    const count = header[2] === undefined ? 1 : Number(header[2]);
    for (let offset = 0; offset < count; offset += 1) added.push(start + offset);
  }

  return added;
}

/** The lines a commit adds to a path, as numbers into the staged file. */
export function addedLines(path: string): number[] {
  const diff = gitText(['diff', '--cached', '-U0', '--diff-filter=ACMR', '--', path]);

  return diff === null ? [] : parseAddedLines(diff);
}

/** Paths the index adds, as opposed to the ones it modifies. */
function addedPaths(): string[] {
  const out = gitText(['diff', '--cached', '--name-only', '-z', '--diff-filter=A']);

  return (out ?? '').split('\0').filter((path) => path.length > 0);
}

export function loadBaseline(source: string = readFileSync(join(ROOT, BASELINE_FILE), 'utf8')): Baseline {
  return JSON.parse(source) as Baseline;
}

/**
 * A cast to `any` on an added line. Lines that were already there are left
 * alone, so the count can fall and cannot rise.
 */
export function scanAddedCasts(
  path: string,
  content: string,
  added: readonly number[],
  baseline: Baseline = loadBaseline(),
): Refusal[] {
  if (!isCodePath(path)) return [];
  if (!Object.keys(baseline['as-any'] ?? {}).some((prefix) => path.startsWith(`${prefix}/`))) return [];
  const lines = content.split('\n');
  const refusals: Refusal[] = [];
  for (const number of added) {
    const line = lines[number - 1] ?? '';
    if (!AS_ANY.regex.test(line)) continue;
    if (SANCTIONED_TYPE_ERROR.test(lines[number - 2] ?? '')) continue;
    refusals.push(report(AS_ANY, path, number - 1, line));
  }

  return refusals;
}

/**
 * Interpolations in staged query-text sources that the allowlist does not list. The scanner is loaded
 * only when such a file is staged, because it needs the ORM's compiler dependency, which a commit of
 * anything else, and the scratch repositories the hook tests build, do not have.
 */
export function scanInterpolations(files: readonly StagedFile[]): Refusal[] {
  type Scanner = typeof import('../../apps/orm/tests/unit/query/interpolation-sites.ts');
  const scanner = join(ROOT, INTERPOLATION_SCANNER);
  if (!existsSync(scanner)) return [];
  const { inScope, unlistedSites } = require(scanner) as Scanner;
  const staged = files
    .filter((file) => file.path.startsWith(ORM_PREFIX) && inScope(file.path.slice(ORM_PREFIX.length)))
    .map((file) => ({ path: file.path.slice(ORM_PREFIX.length), source: file.content }));
  if (!staged.length) return [];
  const listed = stagedContent(INTERPOLATION_ALLOWLIST) ?? readFileSync(join(ROOT, INTERPOLATION_ALLOWLIST), 'utf8');

  return unlistedSites(staged, JSON.parse(listed) as Record<string, number>).map((site) =>
    refusal(
      'interpolation.unlisted',
      'raw interpolation',
      `${ORM_PREFIX}${site.split('  ')[0]}`,
      site.split('::').slice(1).join('::'),
      'Query text must take values as bound placeholders. If this is an internal constant, a validated or a quoted identifier, add its key to the allowlist beside the interpolation test; otherwise close it.',
    ),
  );
}

/** Files the index adds under an ignore pattern, which a forced add slips past. */
export function scanIgnoredPaths(paths: readonly string[]): Refusal[] {
  const refusals: Refusal[] = [];
  for (const path of paths) {
    const run = Bun.spawnSync(['git', 'check-ignore', '--no-index', '-q', '--', path], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (run.exitCode !== 0) continue;
    refusals.push(
      refusal(
        'paths.ignored',
        'ignored path',
        path,
        '',
        'This path matches an ignore pattern, so it would be missing for everyone else. Rename it or change the pattern.',
      ),
    );
  }

  return refusals;
}

/** Model names a schema declares, abstract models excluded because they have no table. */
export function modelNames(schema: string): string[] {
  return [...schema.matchAll(/^[ \t]*model[ \t]+(\w+)/gm)].map((match) => match[1] as string);
}

/** Models in an added e2e schema whose table the global cleanup does not know. */
export function scanTableRegistry(files: readonly StagedFile[], registry: string): Refusal[] {
  const refusals: Refusal[] = [];
  for (const file of files) {
    for (const name of modelNames(file.content)) {
      const table = toSnakeCase(name);
      if (registry.includes(`'${table}'`)) continue;
      refusals.push(
        refusal(
          'registry.unregistered-table',
          'unregistered table',
          file.path,
          `model ${name}`,
          `Add '${table}' to the tables registry in ${REGISTRY_FILE}, or global cleanup will not cover it.`,
        ),
      );
    }
  }

  return refusals;
}

/** Release-note sections by version, each with the text from its heading to the next. */
export function releaseSections(source: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | null = null;
  let text: string[] = [];
  const close = (): void => {
    if (current !== null) sections.set(current, text.join('\n').trimEnd());
  };
  for (const line of source.split('\n')) {
    if (/^## /.test(line)) {
      close();
      current = /^## (\d+\.\d+\.\d+)\b/.exec(line)?.[1] ?? null;
      text = [];
    }
    text.push(line);
  }
  close();

  return sections;
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

/**
 * A section whose version is at or below the released one, edited or removed. The
 * released version comes from the release tags, not from package.json, so the
 * review may edit the notes of an unreleased version after its bump.
 */
export function scanReleasedSections(path: string, before: string, after: string, released: string): Refusal[] {
  const next = releaseSections(after);
  const refusals: Refusal[] = [];
  for (const [version, text] of releaseSections(before)) {
    if (compareVersions(version, released) > 0) continue;
    if (next.get(version) === text) continue;
    refusals.push(
      refusal(
        'release-notes.released-entry-edited',
        'released release notes',
        path,
        `## ${version}`,
        `${version} is already released. Correct it in the next patch's Fixed section.`,
      ),
    );
  }

  return refusals;
}

/** The version a package declares at a ref: ':0' for the index, 'HEAD' for the last commit. */
export function packageVersion(file: string, ref: ':0' | 'HEAD'): string | null {
  const source = gitText(['show', `${ref}:${file}`]);
  if (source === null) return null;
  try {
    const version = (JSON.parse(source) as { version?: unknown }).version;

    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

const TAG_PREFIX: Readonly<Record<string, string>> = { orm: 'orm-v', extension: 'ext-v' };

/**
 * The highest release tag's version for a scope, by number. With no tag (a shallow
 * clone) the package's version in the last commit stands in, so the rule never
 * weakens to nothing.
 */
export function releasedVersion(scope: string, pkg: string): string | null {
  const prefix = TAG_PREFIX[scope] as string;
  const versions = (gitText(['tag', '-l', `${prefix}*`]) ?? '')
    .split('\n')
    .filter((tag) => /^\d+\.\d+\.\d+$/.test(tag.slice(prefix.length)) && tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .sort(compareVersions);

  return versions.at(-1) ?? packageVersion(pkg, 'HEAD');
}

function scanStagedReleaseNotes(): Refusal[] {
  const out = gitText(['diff', '--cached', '--name-only', '-z', '--diff-filter=M']);
  const refusals: Refusal[] = [];
  for (const path of (out ?? '').split('\0')) {
    const match = RELEASE_NOTES.exec(path);
    if (match === null) continue;
    const scope = match[1] as string;
    const released = releasedVersion(scope, PACKAGE_FOR_SCOPE[scope] as string);
    const before = gitText(['show', `HEAD:${path}`]);
    const after = stagedContent(path);
    if (released === null || before === null || after === null) continue;
    refusals.push(...scanReleasedSections(path, before, after, released));
  }

  return refusals;
}

/**
 * Casts in the index under a prefix, a no-match search counting as zero. A cast
 * whose preceding line carries the sanction is not counted: the same exemption
 * {@link scanAddedCasts} gives it, so the two halves of the rule agree.
 */
export function countCasts(prefix: string): number {
  // -z ends the path with a NUL, so a colon in a path cannot be mistaken for the line number.
  const run = Bun.spawnSync(['git', 'grep', '--cached', '-z', '-n', '-o', '-P', AS_ANY.regex.source, '--', prefix], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const linesByPath = new Map<string, string[]>();
  let count = 0;
  for (const hit of run.stdout.toString().split('\n').filter(Boolean)) {
    const [path = '', rest = ''] = hit.split('\0');
    const number = Number.parseInt(rest, 10);
    if (!linesByPath.has(path)) linesByPath.set(path, (stagedContent(path) ?? '').split('\n'));
    if (SANCTIONED_TYPE_ERROR.test(linesByPath.get(path)?.[number - 2] ?? '')) continue;
    count++;
  }

  return count;
}

/** The ratchet: the tree must hold exactly the recorded count, and the record may not rise. */
export function checkRatchet(
  current: Baseline = loadBaseline(),
  counts: (prefix: string) => number = countCasts,
): Refusal[] {
  const refusals: Refusal[] = [];
  for (const [prefix, recorded] of Object.entries(current['as-any'] ?? {})) {
    const found = counts(prefix);
    if (found > recorded) {
      refusals.push(
        refusal(
          'ratchet.count-above-baseline',
          'cast to any',
          prefix,
          `${found} found, ${recorded} recorded`,
          'The count of casts to any in this path may fall and may not rise.',
        ),
      );
    } else if (found < recorded) {
      refusals.push(
        refusal(
          'ratchet.baseline-stale',
          'cast to any',
          prefix,
          `${found} found, ${recorded} recorded`,
          `Lower this path's count in ${BASELINE_FILE} to ${found} in the same commit, so the saving is kept.`,
        ),
      );
    }
  }

  return refusals;
}

/** A baseline edited upwards in the index, against the one in the last commit. */
export function scanBaselineRaised(before: Baseline, after: Baseline): Refusal[] {
  const refusals: Refusal[] = [];
  for (const [prefix, was] of Object.entries(before['as-any'] ?? {})) {
    const now = after['as-any']?.[prefix];
    if (now === undefined || now <= was) continue;
    refusals.push(
      refusal(
        'ratchet.baseline-raised',
        'cast to any',
        BASELINE_FILE,
        `${prefix}: ${was} to ${now}`,
        'A recorded count only goes down. Remove the casts instead of recording more of them.',
      ),
    );
  }

  return refusals;
}

function scanStagedBaseline(): Refusal[] {
  const before = gitText(['show', `HEAD:${BASELINE_FILE}`]);
  const after = stagedContent(BASELINE_FILE);
  if (before === null || after === null || before === after) return [];

  return scanBaselineRaised(loadBaseline(before), loadBaseline(after));
}

/** The registry as the commit will carry it, falling back to the last commit and then the disk. */
function registrySource(): string {
  const staged = stagedContent(REGISTRY_FILE);
  if (staged !== null) return staged;
  const committed = gitText(['show', `HEAD:${REGISTRY_FILE}`]);
  if (committed !== null) return committed;
  const disk = join(ROOT, REGISTRY_FILE);

  return existsSync(disk) ? readFileSync(disk, 'utf8') : '';
}

/** Everything that reads the commit's state rather than one file's text. */
export function scanStagedState(files: readonly StagedFile[]): Refusal[] {
  const refusals: Refusal[] = [];
  const baseline = loadBaseline();
  for (const file of files) {
    const added = addedLines(file.path);
    refusals.push(...scanAddedCasts(file.path, file.content, added, baseline));
    refusals.push(...scanE2eSetup(file.path, file.content));
  }
  refusals.push(...scanInterpolations(files));
  const added = addedPaths();
  refusals.push(...scanIgnoredPaths(added));
  const schemas = files.filter(
    (file) => added.includes(file.path) && file.path.startsWith(SCHEMA_DIR) && file.path.endsWith('.cerial'),
  );
  if (schemas.length) refusals.push(...scanTableRegistry(schemas, registrySource()));
  refusals.push(...scanStagedReleaseNotes());
  refusals.push(...scanStagedBaseline());
  refusals.push(...checkRatchet(baseline));

  return refusals;
}
