// The release gate for the defect ledger. It exits non-zero, one line per violation, while a shipped
// defect has no named test or a required pin has no revert evidence.
//
//   bun run tooling/release/check-defects.ts <ledger> [--require <ids>] [--audit <file>...]
//
// The ledger and the audit files are arguments because they are not committed. The ids the ledger must
// cover are derived from the audit files' finding tables, never listed here, so a finding added to an
// audit cannot be forgotten. Ledger columns: id | source | defect | test file | test name | status | revert.
//
// The contract the ledger author follows:
//   - the ledger is a pipe table with those columns, in any section; `test file` is repo relative and
//     `test name` is the literal string given to test(), it() or describe() in that file.
//   - status is `pinned`, or `declined` followed by a citation holding "decision", "owner" or "maintainer"
//     (in the status cell, or in an optional `decision` column).
//   - a row named by --require carries revert evidence in its `revert` cell, all three parts:
//       `diff <hex>`      the hash (7 to 64 hex digits) of the diff that broke the fix. If the cell also cites a
//                         `.diff` or `.patch` file, the hash must be a prefix of that file's SHA-256.
//       a failing output  a path with a slash, not ending in .diff or .patch, to a non-empty file, relative to
//                         the ledger's directory or the repository root.
//       `bun run build`   the words, recording that the build ran, because e2e runs from dist.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { withoutGit } from '../hooks/scratch.ts';
import { splitCells, unwrap } from './review-doc.ts';

const STATUSES = ['pinned', 'declined'];
// The pending modifier is matched rather than spelled, as tooling/hooks/patterns.ts explains: the
// commit hook's stub scan reads this file and would refuse the bare word.
const MODIFIERS_THAT_DISABLE = ['skip', 'to' + 'do', 'failing'];
const ID_TOKEN = /[A-Z][A-Za-z]*(?:-[A-Za-z0-9]+)+/g;
const DECISION_WORDS = /decision|owner|maintainer/i;

export interface CheckOptions {
  /** Repository root: where test files are resolved. */
  readonly repo: string;
  readonly ledger: string;
  readonly require?: readonly string[];
  readonly audits?: readonly string[];
}

export interface LedgerRow {
  readonly id: string;
  readonly cells: Readonly<Record<string, string>>;
}

const inside = (parent: string, child: string): boolean => {
  const path = relative(parent, child);

  return !!path && !path.startsWith('..') && !isAbsolute(path);
};

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const nonEmptyFile = (path: string): boolean => existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;

/** Every table in the text, as header cells plus rows of cells, found by line shape alone. */
function tablesOf(text: string): Array<{ headers: string[]; rows: string[][] }> {
  const found: Array<{ headers: string[]; rows: string[][] }> = [];
  let current: { headers: string[]; rows: string[][] } | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      current = undefined;
      continue;
    }
    const cells = splitCells(line);
    if (!current) {
      current = { headers: cells.map((cell) => cell.toLowerCase()), rows: [] };
      found.push(current);
    } else if (!cells.every((cell) => /^:?-{1,}:?$/.test(cell))) current.rows.push(cells);
  }

  return found;
}

/** The ledger: the table whose header names a `test file` column. */
export function parseLedger(text: string): { rows: LedgerRow[]; found: boolean } {
  const table = tablesOf(text).find((candidate) => candidate.headers.includes('test file'));
  if (!table) return { rows: [], found: false };
  const rows = table.rows.map((cells) => {
    const named = Object.fromEntries(table.headers.map((header, index) => [header, cells[index] ?? '']));

    return { id: unwrap(named.id ?? ''), cells: named };
  });

  return { rows, found: true };
}

/** Whether a heading line opens a section whose finding tables the ledger must cover. */
function opensScope(title: string): boolean {
  return /^[A-F][.:)\s]/.test(title) || /^Part 1\b/i.test(title);
}

/** The ids in the first cell of every finding table row, in sections A to F and Part 1. */
export function auditIds(text: string): { ids: string[]; scoped: boolean } {
  const ids = new Set<string>();
  let scopeLevel = 0;
  let scoped = false;
  let tableHeaderSeen = false;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      if (scopeLevel && level <= scopeLevel) scopeLevel = 0;
      if (!scopeLevel && opensScope(heading[2]!)) {
        scopeLevel = level;
        scoped = true;
      }
      tableHeaderSeen = false;
      continue;
    }
    if (!line.trim().startsWith('|')) {
      tableHeaderSeen = false;
      continue;
    }
    if (!tableHeaderSeen) {
      tableHeaderSeen = true;
      continue;
    }
    if (!scopeLevel) continue;
    const cells = splitCells(line);
    if (cells.every((cell) => /^:?-{1,}:?$/.test(cell))) continue;
    const first = (cells[0] ?? '').replace(/[`*~_]/g, ' ');
    for (const token of first.match(ID_TOKEN) ?? []) if (/\d/.test(token)) ids.add(token);
  }

  return { ids: [...ids], scoped };
}

type Presence = 'absent' | 'disabled' | 'active';

/** Whether a test named `name` is declared in `source`, and whether any declaration actually runs. */
export function testPresence(source: string, name: string): Presence {
  const quoted = new Set<string>();
  for (const quote of ["'", '"', '`']) {
    quoted.add(`${quote}${name.split(quote).join(`\\${quote}`)}${quote}`);
  }
  let presence: Presence = 'absent';
  for (const literal of quoted) {
    let at = source.indexOf(literal);
    while (at >= 0) {
      const before = source.slice(Math.max(0, at - 80), at);
      const call = /(?:^|[^\w$.])(test|it|describe)((?:\.\w+)*)\s*\(\s*$/.exec(before);
      const commented = /(?:^|\n)\s*(?:\/\/|\*|\/\*)[^\n]*$/.test(before);
      if (call && !commented) {
        const modifiers = call[2]!.split('.').filter(Boolean);
        if (modifiers.some((modifier) => MODIFIERS_THAT_DISABLE.includes(modifier))) {
          if (presence === 'absent') presence = 'disabled';
        } else presence = 'active';
      }
      at = source.indexOf(literal, at + 1);
    }
  }

  return presence;
}

/** The path-looking tokens of a revert cell: anything with a slash, backticks and trailing punctuation removed. */
function pathsIn(cell: string): string[] {
  return cell
    .split(/\s+/)
    .map((token) => token.replace(/^[`("']+|[`)"',;.]+$/g, ''))
    .filter((token) => token.includes('/') && !/^[a-z]+:\/\//i.test(token));
}

export function checkDefects(options: CheckOptions): string[] {
  const { repo, ledger } = options;
  const violations: string[] = [];
  const ledgerDir = dirname(resolve(ledger));
  const parsed = parseLedger(readFileSync(ledger, 'utf8'));
  if (!parsed.found) return ['the ledger has no table with a "test file" column'];

  const seen = new Set<string>();
  for (const row of parsed.rows) {
    if (!row.id) violations.push('a ledger row has no id');
    else if (seen.has(row.id)) violations.push(`${row.id} has two rows`);
    seen.add(row.id);
  }

  for (const id of options.require ?? []) if (!seen.has(id)) violations.push(`required id ${id} has no row`);

  for (const audit of options.audits ?? []) {
    if (!existsSync(audit)) {
      violations.push(`audit file ${audit} does not exist`);
      continue;
    }
    const { ids, scoped } = auditIds(readFileSync(audit, 'utf8'));
    if (!scoped) violations.push(`audit file ${basename(audit)} has no section A to F or Part 1`);
    for (const id of ids) if (!seen.has(id)) violations.push(`${id} from ${basename(audit)} has no row`);
  }

  const required = new Set(options.require ?? []);
  for (const { id, cells } of parsed.rows) {
    if (!id) continue;
    const status = (cells.status ?? '').trim();
    const word = status.split(/[\s(:,]/)[0]!.toLowerCase();
    if (!STATUSES.includes(word)) {
      violations.push(`${id} has status "${status}", not pinned or declined`);
      continue;
    }

    if (word === 'declined') {
      const cited = `${status.slice(word.length)} ${cells.decision ?? ''}`.trim();
      if (!DECISION_WORDS.test(cited)) violations.push(`${id} is declined and cites no decision`);
    } else {
      const file = unwrap(cells['test file'] ?? '');
      const name = unwrap(cells['test name'] ?? '');
      const path = resolve(repo, file);
      if (!file || !inside(repo, path) || !nonEmptyFile(path)) {
        violations.push(`${id} test file ${file || '(none)'} does not exist`);
      } else if (!name) violations.push(`${id} has no test name`);
      else {
        const presence = testPresence(readFileSync(path, 'utf8'), name);
        if (presence === 'absent') violations.push(`${id} test "${name}" is not in ${file}`);
        if (presence === 'disabled') violations.push(`${id} test "${name}" in ${file} is skipped, pending or failing`);
      }
    }

    if (!required.has(id)) continue;
    const revert = (cells.revert ?? '').trim();
    if (!revert) {
      violations.push(`${id} is required and has no revert evidence`);
      continue;
    }
    const paths = pathsIn(revert);
    const patches = paths.filter((path) => /\.(diff|patch)$/.test(path));
    const outputs = paths.filter((path) => !patches.includes(path));
    const hash = /\bdiff[\s:]+`?([0-9a-f]{7,64})\b/i.exec(revert)?.[1]?.toLowerCase();
    if (!hash) violations.push(`${id} revert records no diff hash (write "diff <hex>")`);
    for (const patch of patches) {
      const full = [resolve(ledgerDir, patch), resolve(repo, patch)].find((candidate) => nonEmptyFile(candidate));
      if (!full) violations.push(`${id} revert diff ${patch} is missing or empty`);
      else if (hash && !sha256(full).startsWith(hash)) {
        violations.push(`${id} revert hash ${hash} does not match the SHA-256 of ${patch}`);
      }
    }
    if (!/\bbun run build\b/.test(revert)) violations.push(`${id} revert does not record that bun run build ran`);
    const real = outputs.some((output) =>
      [resolve(ledgerDir, output), resolve(repo, output)].some((full) => nonEmptyFile(full)),
    );
    if (!outputs.length) violations.push(`${id} revert names no failing output path`);
    else if (!real) violations.push(`${id} revert output ${outputs.join(', ')} is missing or empty`);
  }

  return violations;
}

function usage(message: string): never {
  process.stderr.write(`${message}\nusage: check-defects.ts <ledger> [--require <ids>] [--audit <file>...]\n`);
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  let ledger: string | undefined;
  const require: string[] = [];
  const audits: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--require') {
      const value = args[++i];
      if (!value || value.startsWith('--')) usage('--require needs a comma separated list of ids');
      require.push(
        ...value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      );
    } else if (arg === '--audit') {
      const before = audits.length;
      while (args[i + 1] && !args[i + 1]!.startsWith('--')) audits.push(resolve(args[++i]!));
      if (audits.length === before) usage('--audit needs at least one file');
    } else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
    else if (!ledger) ledger = arg;
    else usage(`unexpected argument ${arg}`);
  }
  if (!ledger) usage('no ledger given');
  if (!existsSync(ledger)) usage(`${ledger} does not exist`);
  const top = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], { cwd: process.cwd(), env: withoutGit() });
  const repo = top.exitCode === 0 ? top.stdout.toString().trim() : process.cwd();
  const violations = checkDefects({ repo, ledger: resolve(ledger), require, audits });
  for (const line of violations) process.stdout.write(`${line}\n`);
  process.exit(violations.length ? 1 : 0);
}

if (import.meta.main) main();
