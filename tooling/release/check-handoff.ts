// The handoff gate. It exits non-zero, one line per violation, while the tree is not ready for the maintainer
// to cut the release, and while a tag or a published version already exists. It verifies readiness and prints
// the commands the maintainer runs; it never tags, pushes or publishes.
//
//   bun run tooling/release/check-handoff.ts <status> --version <orm> --ext-version <extension>

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withoutGit } from '../hooks/scratch.ts';

/** Programme rows that must be finished: 01 to 11 and 13. Twelve rows are read; 12 is this gate's own. */
export const REQUIRED_ROWS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '13'] as const;

const VERSION = /^\d+\.\d+\.\d+$/;

export type Published = 'yes' | 'no' | { readonly error: string };

export interface HandoffOptions {
  /** Repository root: where git runs and where package.json files and notes pages are read. */
  readonly repo: string;
  readonly status: string;
  readonly version: string;
  readonly extVersion: string;
  /** Whether a package version is on the registry. Injected by tests; the default asks `npm view`. */
  readonly published?: (name: string, version: string) => Published;
}

function git(repo: string, args: string[]): { status: number; out: string } {
  const run = Bun.spawnSync(['git', ...args], { cwd: repo, env: withoutGit(), stdout: 'pipe', stderr: 'pipe' });

  return { status: run.exitCode, out: run.stdout.toString().trim() };
}

/** A missing package is an E404; any other failure (offline, auth) is not an answer and must not pass. */
export function npmPublished(name: string, version: string): Published {
  const run = Bun.spawnSync(['npm', 'view', `${name}@${version}`, 'version'], { stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode === 0) return run.stdout.toString().trim() ? 'yes' : 'no';
  const stderr = run.stderr.toString();
  if (/E404|404 Not Found|No match found/i.test(stderr)) return 'no';

  return { error: stderr.trim().split('\n')[0] || `npm exited ${run.exitCode}` };
}

function packageVersion(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };

    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

function notesPath(repo: string, kind: 'orm' | 'extension', version: string): string {
  const [major, minor] = version.split('.');

  return join(repo, 'apps', 'docs', 'content', 'docs', 'releases', kind, major!, `${minor}.mdx`);
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function checkStatus(status: string, violations: string[]): void {
  if (!existsSync(status)) {
    violations.push(`status table ${status} does not exist`);

    return;
  }
  const rows = new Map<string, { done: number; total: number; state: string }>();
  for (const line of readFileSync(status, 'utf8').split(/\r?\n/)) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 6 || !/^\d{2}$/.test(cells[1]!)) continue;
    const progress = /^(\d+)\/(\d+)$/.exec(cells[3]!);
    if (!progress) continue;
    rows.set(cells[1]!, { done: Number(progress[1]), total: Number(progress[2]), state: cells[4]!.toLowerCase() });
  }
  for (const id of REQUIRED_ROWS) {
    const row = rows.get(id);
    if (!row) violations.push(`status row ${id} is missing`);
    else if (!row.total || row.done !== row.total || row.state !== 'done') {
      violations.push(`status row ${id} is ${row.done}/${row.total} and ${row.state}, not done`);
    }
  }
}

function checkPackage(repo: string, path: string, label: string, version: string, violations: string[]): void {
  const found = packageVersion(join(repo, path));
  if (found !== version) violations.push(`${path} holds ${found ?? 'no version'}, not ${version} (${label})`);
}

function checkNotes(repo: string, kind: 'orm' | 'extension', version: string, violations: string[]): void {
  const path = notesPath(repo, kind, version);
  const shown = path.slice(repo.length + 1);
  if (!existsSync(path)) {
    violations.push(`${kind} notes page ${shown} does not exist`);

    return;
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const heading = lines.findIndex((line) => new RegExp(`^##\\s+${escapeRegExp(version)}\\s*$`).test(line));
  if (heading < 0) {
    violations.push(`${shown} has no "## ${version}" heading`);

    return;
  }
  if (kind !== 'extension') return;
  const next = lines.findIndex((line, i) => i > heading && /^##\s/.test(line));
  const section = lines.slice(heading + 1, next < 0 ? undefined : next);
  const download = section.findIndex((line) => /^###\s+Download\s*$/.test(line));
  const row = download < 0 ? undefined : section.slice(download + 1).find((line) => /^\|\s*v?\d/.test(line));
  if (!row || !row.includes(version)) violations.push(`${shown} has no "### Download" row for ${version}`);
}

export function checkHandoff(options: HandoffOptions): string[] {
  const { repo, version, extVersion } = options;
  const violations: string[] = [];
  const published = options.published ?? npmPublished;
  for (const [flag, value] of [
    ['--version', version],
    ['--ext-version', extVersion],
  ] as const) {
    if (!VERSION.test(value)) violations.push(`${flag} ${value} is not a version like 1.2.3`);
  }
  if (violations.length) return violations;

  checkStatus(options.status, violations);
  checkPackage(repo, 'apps/orm/package.json', 'orm', version, violations);
  checkPackage(repo, 'apps/vscode-extension/package.json', 'extension', extVersion, violations);
  checkNotes(repo, 'orm', version, violations);
  checkNotes(repo, 'extension', extVersion, violations);

  for (const tag of [`orm-v${version}`, `ext-v${extVersion}`]) {
    if (git(repo, ['tag', '-l', tag]).out === tag) violations.push(`tag ${tag} already exists locally`);
  }
  const answer = published('cerial', version);
  if (answer === 'yes') violations.push(`cerial@${version} is already on npm`);
  else if (answer !== 'no') violations.push(`cannot tell whether cerial@${version} is on npm: ${answer.error}`);

  return violations;
}

/** What the maintainer runs next. Printed, never executed here. */
export function runbook(version: string, extVersion: string): string[] {
  return [
    'ready: nothing has been tagged, pushed or published. The maintainer runs, in order:',
    '  1. open the pull request from the release branch into dev and wait for CI to pass on its head',
    `  2. tag orm-v${version} and ext-v${extVersion} on the commit CI passed on`,
    '  3. push the tags; the release workflows publish from them',
  ];
}

function usage(message: string): never {
  process.stderr.write(`${message}\nusage: check-handoff.ts <status> --version <orm> --ext-version <extension>\n`);
  process.exit(2);
}

function flag(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) usage(`${name} needs a value`);

  return value;
}

function main(): void {
  const args = process.argv.slice(2);
  const version = flag(args, '--version');
  const extVersion = flag(args, '--ext-version');
  const status = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (!status) usage('no status table given');
  const repo = git(process.cwd(), ['rev-parse', '--show-toplevel']).out || process.cwd();
  const violations = checkHandoff({ repo, status: resolve(status), version, extVersion });
  for (const line of violations) process.stdout.write(`${line}\n`);
  if (!violations.length) for (const line of runbook(version, extVersion)) process.stdout.write(`${line}\n`);
  process.exit(violations.length ? 1 : 0);
}

if (import.meta.main) main();
