// The release gate for the security review. It exits non-zero, one line per violation, while the review
// document is incomplete, stale against the tree, or holds a finding nobody closed.
//
//   bun run tooling/release/check-review.ts <review> [--through <pass>] [--final] [--sample]
//
// The review path is an argument because the document is not committed. `--through <pass>` applies the
// pass-scoped rules to that pass and the ones before it, so the review can be checked in order.
// `--final` applies everything, and also prints what the maintainer reads before accepting the release.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { findSites } from '../../apps/orm/tests/unit/query/interpolation-sites.ts';
import { withoutGit } from '../hooks/scratch.ts';
import { isPass, PASSES, type Pass, parseReview, type ReviewDoc, type Row, scopeOf, unwrap } from './review-doc.ts';

const EXTENSION_PATH = 'apps/vscode-extension';
const SITE_CLASSES = ['bound', 'constant', 'validated', 'quoted'];
const STATUSES = ['open', 'fixed', 'refuted', 'accepted'];
const SAMPLE_FLOOR = 25;

export interface CheckOptions {
  /** Repository root: where git runs and where the source tree and notes page are read. */
  readonly repo: string;
  /** The review document. Its directory holds the captured output files. */
  readonly review: string;
  readonly through?: Pass;
  readonly final?: boolean;
}

export interface CheckResult {
  readonly violations: string[];
  readonly doc: ReviewDoc;
  /** Every interpolation site in the source tree, keyed. */
  readonly sites: readonly string[];
}

function git(repo: string, args: string[]): { status: number; out: string } {
  const run = Bun.spawnSync(['git', ...args], { cwd: repo, env: withoutGit(), stdout: 'pipe', stderr: 'pipe' });

  return { status: run.exitCode, out: run.stdout.toString().trim() };
}

function versionOf(tag: string, prefix: string): number[] | undefined {
  const match = new RegExp(`^${prefix}-v(\\d+)\\.(\\d+)\\.(\\d+)$`).exec(tag);

  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** The highest release tag by version, not by name or date; prereleases do not count. */
function highestTag(repo: string, prefix: string): string | undefined {
  const tags = git(repo, ['tag', '-l', `${prefix}-v*`])
    .out.split('\n')
    .filter(Boolean);
  let best: { tag: string; version: number[] } | undefined;
  for (const tag of tags) {
    const version = versionOf(tag, prefix);
    if (!version) continue;
    if (!best || compareVersions(version, best.version) > 0) best = { tag, version };
  }

  return best?.tag;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;

  return 0;
}

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) found.push(full);
    }
  };
  if (existsSync(root)) walk(root);

  return found.sort();
}

/** Every site in apps/orm/src, with paths relative to apps/orm so keys match the interpolation allowlist. */
function treeSites(repo: string): string[] {
  const ormRoot = join(repo, 'apps', 'orm');
  const keys = new Set<string>();
  for (const file of sourceFiles(join(ormRoot, 'src'))) {
    const path = relative(ormRoot, file).split('\\').join('/');
    for (const site of findSites(path, readFileSync(file, 'utf8'))) keys.add(site.key);
  }

  return [...keys].sort();
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Backticked names in a reason, as the last segment of a dotted name with a call suffix removed. */
function namedSymbols(reason: string): string[] {
  const names: string[] = [];
  for (const match of reason.matchAll(/`([^`]+)`/g)) {
    const last = match[1]!.replace(/\(.*$/, '').split('.').pop()!.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(last)) names.push(last);
  }

  return names;
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);

  return !!path && !path.startsWith('..') && !isAbsolute(path);
}

function capturedOutput(dir: string, cell: string): boolean {
  const path = unwrap(cell);
  if (!path) return false;
  const full = resolve(dir, path);
  if (!inside(dir, full)) return false;

  return existsSync(full) && statSync(full).isFile() && statSync(full).size > 0;
}

function securitySection(repo: string): string | undefined {
  const version = JSON.parse(readFileSync(join(repo, 'apps', 'orm', 'package.json'), 'utf8')).version as string;
  const [major, minor] = version.split('.');
  const notes = join(repo, 'apps', 'docs', 'content', 'docs', 'releases', 'orm', major!, `${minor}.mdx`);
  if (!existsSync(notes)) return undefined;
  const lines = readFileSync(notes, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => /^###\s+Security\s*$/.test(line));
  if (start < 0) return undefined;
  const end = lines.findIndex((line, i) => i > start && /^#{1,3}\s/.test(line));

  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sites outside the constant class, in an order nobody chooses: SHA-256 of the head plus the key. */
export function sampleSites(head: string, keys: readonly string[], classes: ReadonlyMap<string, string>): string[] {
  const candidates = keys.filter((key) => classes.get(key)?.toLowerCase() !== 'constant');
  const hashed = candidates.map((key) => ({
    key,
    hash: createHash('sha256')
      .update(head + key)
      .digest('hex'),
  }));
  hashed.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  const size = Math.min(hashed.length, Math.max(SAMPLE_FLOOR, Math.ceil(hashed.length / 10)));

  return hashed.slice(0, size).map((entry) => entry.key);
}

function rowsOf(doc: ReviewDoc, section: string, violations: string[]): readonly Row[] {
  const table = doc.tables.get(section);
  if (!table) violations.push(`the document has no "${section}" table`);

  return table?.rows ?? [];
}

export function checkReview(options: CheckOptions): CheckResult {
  const { repo, review } = options;
  const violations: string[] = [];
  const doc = parseReview(readFileSync(review, 'utf8'));
  const sites = treeSites(repo);
  const result = (): CheckResult => ({ violations, doc, sites });
  const final = options.final === true;
  const through = final ? PASSES.length - 1 : PASSES.indexOf(options.through ?? 'output');
  const inRange = (pass: string): boolean => PASSES.indexOf(pass as Pass) <= through;
  const auditDir = dirname(resolve(review));

  const base = doc.fields.base;
  const extBase = doc.fields.ext_base;
  const head = doc.fields.reviewed_head;
  const scope = scopeOf(doc);
  for (const [name, value] of [
    ['base', base],
    ['ext_base', extBase],
    ['reviewed_head', head],
  ] as const) {
    if (!value) violations.push(`frontmatter has no ${name}`);
  }
  if (!scope.length) violations.push('frontmatter has no scope');
  if (!base || !extBase || !head || !scope.length) return result();

  const highestOrm = highestTag(repo, 'orm');
  if (base !== highestOrm)
    violations.push(`base ${base} is not the highest orm-v* tag (${highestOrm ?? 'none exists'})`);
  const highestExt = highestTag(repo, 'ext');
  if (extBase !== highestExt) {
    violations.push(`ext_base ${extBase} is not the highest ext-v* tag (${highestExt ?? 'none exists'})`);
  }

  const headSha = git(repo, ['rev-parse', '--verify', `${head}^{commit}`]);
  if (headSha.status !== 0) {
    violations.push(`reviewed_head ${head} is not a commit`);

    return result();
  }
  if (git(repo, ['merge-base', '--is-ancestor', headSha.out, 'HEAD']).status !== 0) {
    violations.push(`reviewed_head ${head} is not an ancestor of HEAD`);
  }
  const changed = git(repo, ['diff', '--name-only', headSha.out, 'HEAD', '--', ...scope]).out;
  for (const file of changed.split('\n').filter(Boolean)) violations.push(`${file} changed after reviewed_head`);

  // Commits: every one in range that touches the scope needs a row naming the passes that read it
  const commitRows = rowsOf(doc, 'commits', violations);
  const ormScope = scope.filter((path) => !(path === EXTENSION_PATH || path.startsWith(`${EXTENSION_PATH}/`)));
  const ranges: Array<[string, string[]]> = [];
  if (ormScope.length) ranges.push([base, ormScope]);
  if (ormScope.length < scope.length) ranges.push([extBase, scope.filter((path) => !ormScope.includes(path))]);
  const commits = new Set<string>();
  for (const [from, paths] of ranges) {
    const listed = git(repo, ['rev-list', `${from}..${headSha.out}`, '--', ...paths]);
    if (listed.status !== 0) violations.push(`cannot list commits from ${from} to reviewed_head`);
    for (const sha of listed.out.split('\n').filter(Boolean)) commits.add(sha);
  }
  for (const sha of [...commits].sort()) {
    const row = commitRows.find((candidate) => {
      const given = unwrap(candidate.sha ?? '').toLowerCase();

      return given.length >= 7 && sha.startsWith(given);
    });
    if (!row) {
      violations.push(`commit ${sha.slice(0, 8)} is in the range and has no row`);
      continue;
    }
    const passes = (row.passes ?? '')
      .split(/[,\s]+/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!passes.length) violations.push(`commit ${sha.slice(0, 8)} has no pass`);
    for (const name of passes)
      if (!isPass(name)) violations.push(`commit ${sha.slice(0, 8)} names unknown pass ${name}`);
  }

  // Passes
  const statements = new Map(rowsOf(doc, 'passes', violations).map((row) => [row.pass ?? '', row.statement ?? '']));
  for (const pass of PASSES.slice(0, through + 1)) {
    if (!statements.get(pass)?.trim()) violations.push(`pass ${pass} has an empty statement`);
  }

  // Findings
  const findingRows = rowsOf(doc, 'findings', violations);
  const ids = new Set<string>();
  for (const finding of findingRows) {
    const id = unwrap(finding.id ?? '');
    if (!id) violations.push('a finding has no id');
    else if (ids.has(id)) violations.push(`finding id ${id} is used twice`);
    ids.add(id);
  }
  let securityText: string | undefined;
  for (const finding of findingRows) {
    const id = unwrap(finding.id ?? '');
    const pass = finding.pass ?? '';
    if (!isPass(pass)) {
      violations.push(`finding ${id} names unknown pass "${pass}"`);
      continue;
    }
    if (!inRange(pass)) continue;
    if (finding.reviewer !== undefined && !finding.reviewer.trim())
      violations.push(`finding ${id} has an empty reviewer`);
    const status = (finding.status ?? '').toLowerCase();
    if (!STATUSES.includes(status)) violations.push(`finding ${id} has unknown status "${finding.status}"`);
    if (status === 'open') violations.push(`finding ${id} is open`);
    if (status === 'fixed') {
      if (!finding.payload?.trim()) violations.push(`finding ${id} is fixed and has no payload`);
      const fix = unwrap(finding.fix ?? '');
      if (!fix || git(repo, ['merge-base', '--is-ancestor', fix, 'HEAD']).status !== 0) {
        violations.push(`finding ${id} fix ${fix || '(none)'} is not an ancestor of HEAD`);
      }
      const test = unwrap(finding.test ?? '');
      const testPath = resolve(repo, test);
      if (!test || !inside(repo, testPath) || !existsSync(testPath)) {
        violations.push(`finding ${id} test ${test || '(none)'} does not exist`);
      }
    }
    if ((status === 'fixed' || status === 'refuted') && !capturedOutput(auditDir, finding.output ?? '')) {
      violations.push(`finding ${id} has no captured output file`);
    }
    if (status === 'accepted') {
      const cell = finding.accepted ?? '';
      if (!/maintainer\s+\d{4}-\d{2}-\d{2}/i.test(cell) || !/"[^"]+"|“[^”]+”/.test(cell)) {
        violations.push(`finding ${id} is accepted without "maintainer <date>" and the maintainer's quoted words`);
      }
      securityText ??= securitySection(repo) ?? '';
      if (!new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`).test(securityText)) {
        violations.push(`finding ${id} is accepted and the notes' Security section does not mention it`);
      }
    }
  }

  // Sites: the ledger must match the tree. Classes are the identifiers pass's work, so they are
  // required from that pass on and not while the document has only just been generated.
  const siteRows = rowsOf(doc, 'sites', violations);
  const classes = new Map<string, string>();
  const rowByKey = new Map<string, Row>();
  for (const row of siteRows) rowByKey.set(unwrap(row.key ?? ''), row);
  const inTree = new Set(sites);
  for (const key of sites) if (!rowByKey.has(key)) violations.push(`site is missing from the document: ${key}`);
  for (const key of rowByKey.keys()) if (!inTree.has(key)) violations.push(`site is stale, not in the tree: ${key}`);
  for (const [key, row] of rowByKey) {
    const siteClass = (row.class ?? '').trim();
    classes.set(key, siteClass);
    if (!inTree.has(key) || through < 1) continue;
    const lower = siteClass.toLowerCase();
    if (!SITE_CLASSES.includes(lower) && !ids.has(unwrap(siteClass))) {
      violations.push(`site has no class: ${key}`);
      continue;
    }
    if (lower !== 'validated' && lower !== 'quoted') continue;
    const file = join(repo, 'apps', 'orm', key.split('::')[0]!);
    const source = existsSync(file) ? stripComments(readFileSync(file, 'utf8')) : '';
    const found = namedSymbols(row.reason ?? '').some((name) =>
      new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(source),
    );
    if (!found) violations.push(`site ${lower} reason names no symbol that exists in its file: ${key}`);
  }

  // Re-fires
  const refires = rowsOf(doc, 're-fires', violations);
  const refired = new Set<string>();
  for (const row of refires) {
    const key = unwrap(row.key ?? '');
    refired.add(key);
    if (!capturedOutput(auditDir, row.output ?? '')) violations.push(`re-fire of ${key} has no captured output file`);
  }

  if (final) {
    for (const key of sampleSites(headSha.out, sites, classes)) {
      if (!refired.has(key)) violations.push(`sampled site has no re-fire row: ${key}`);
    }
  }

  return result();
}

function usage(message: string): never {
  process.stderr.write(`${message}\nusage: check-review.ts <review> [--through <pass>] [--final] [--sample]\n`);
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  const review = args.find((arg) => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--through');
  if (!review) usage('no review document given');
  const flagIndex = args.indexOf('--through');
  const throughName = flagIndex >= 0 ? args[flagIndex + 1] : undefined;
  if (flagIndex >= 0 && (!throughName || !isPass(throughName))) usage(`--through needs one of: ${PASSES.join(', ')}`);
  if (!existsSync(review)) usage(`${review} does not exist`);
  const repo = git(process.cwd(), ['rev-parse', '--show-toplevel']).out || process.cwd();
  const final = args.includes('--final');
  const { violations, doc, sites } = checkReview({
    repo,
    review: resolve(review),
    through: throughName as Pass | undefined,
    final,
  });

  if (args.includes('--sample')) {
    const classes = new Map(
      (doc.tables.get('sites')?.rows ?? []).map((row) => [unwrap(row.key ?? ''), row.class ?? '']),
    );
    const head = git(repo, ['rev-parse', '--verify', `${doc.fields.reviewed_head ?? ''}^{commit}`]).out;
    for (const key of sampleSites(head, sites, classes)) process.stdout.write(`${key}\n`);

    return;
  }
  for (const line of violations) process.stdout.write(`${line}\n`);
  if (final && !violations.length) {
    for (const row of doc.tables.get('findings')?.rows ?? []) {
      if ((row.status ?? '').toLowerCase() === 'accepted')
        process.stdout.write(`accepted ${row.id}: ${row.accepted}\n`);
    }
    for (const row of doc.tables.get('passes')?.rows ?? [])
      process.stdout.write(`pass ${row.pass}: ${row.statement}\n`);
    process.stdout.write(`sha256 ${createHash('sha256').update(readFileSync(review)).digest('hex')}\n`);
  }
  process.exit(violations.length ? 1 : 0);
}

if (import.meta.main) main();
