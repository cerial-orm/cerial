// The release-notes gate. It exits non-zero, one line per violation, while the notes for a version do not
// carry every row of the breaking-change ledger under the section the row names, or do not lead with Security.
//
//   bun run tooling/release/check-notes.ts <ledger> <notes> --version <orm>
//
// The ledger is a table of `name | kind | source | section` rows (`\|` is a literal pipe in a cell). A row
// counts when its name appears, ignoring case, inside the named `###` section under `## <version>`; the same
// name under another section does not count.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VERSION = /^\d+\.\d+\.\d+$/;

export interface LedgerEntry {
  readonly name: string;
  readonly section: string;
}

export interface NotesOptions {
  readonly ledger: string;
  readonly notes: string;
  readonly version: string;
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());
}

/** Data rows of every four-cell table row; the header and the separator are not rows. */
export function parseLedger(text: string): LedgerEntry[] {
  const rows: LedgerEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trimStart().startsWith('|')) continue;
    const row = cells(line);
    if (row.length !== 4 || !row[0] || /^-+$/.test(row[0]) || row[0] === 'name') continue;
    rows.push({ name: row[0], section: row[3]! });
  }

  return rows;
}

interface Section {
  readonly heading: string;
  readonly body: string;
}

/** The `###` sections under `## <version>`, in order, or undefined when the version has no heading. */
export function versionSections(notes: string, version: string): Section[] | undefined {
  const sections: Section[] = [];
  let inVersion = false;
  let found = false;
  let fenced = false;
  for (const line of notes.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? undefined : /^(#{2,3})\s+(.*?)\s*$/.exec(line);
    if (heading?.[1] === '##') {
      inVersion = heading[2] === version;
      found ||= inVersion;
      continue;
    }
    if (!inVersion) continue;
    if (heading) sections.push({ heading: heading[2]!, body: '' });
    else if (sections.length)
      sections[sections.length - 1] = { ...sections.at(-1)!, body: `${sections.at(-1)!.body}${line}\n` };
  }

  return found ? sections : undefined;
}

export function checkNotes(options: NotesOptions): string[] {
  if (!VERSION.test(options.version)) return [`--version ${options.version} is not a version like 1.2.3`];
  for (const [label, path] of [
    ['ledger', options.ledger],
    ['notes', options.notes],
  ] as const) {
    if (!existsSync(path)) return [`${label} ${path} does not exist`];
  }
  const violations: string[] = [];
  const rows = parseLedger(readFileSync(options.ledger, 'utf8'));
  if (!rows.length) violations.push('the ledger has no rows');
  const sections = versionSections(readFileSync(options.notes, 'utf8'), options.version);
  if (!sections) return [...violations, `the notes have no "## ${options.version}" heading`];

  const security = sections.findIndex((section) => section.heading === 'Security');
  if (security < 0) violations.push(`## ${options.version} has no "### Security" section`);
  else if (security > 0) violations.push(`"### Security" is not the first section under ## ${options.version}`);

  for (const row of rows) {
    const section = sections.find((candidate) => candidate.heading === row.section);
    if (!section) violations.push(`${row.name}: no "### ${row.section}" section under ## ${options.version}`);
    else if (!section.body.toLowerCase().includes(row.name.toLowerCase())) {
      violations.push(`${row.name}: missing from "### ${row.section}"`);
    }
  }

  return violations;
}

function usage(message: string): never {
  process.stderr.write(`${message}\nusage: check-notes.ts <ledger> <notes> --version <orm>\n`);
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  const at = args.indexOf('--version');
  const version = at >= 0 ? args[at + 1] : undefined;
  if (!version || version.startsWith('--')) usage('--version needs a value');
  const [ledger, notes] = args.filter((arg, i) => !arg.startsWith('--') && i !== at + 1);
  if (!ledger || !notes) usage('a ledger and a notes page are both required');
  const violations = checkNotes({ ledger: resolve(ledger), notes: resolve(notes), version });
  for (const line of violations) process.stdout.write(`${line}\n`);
  if (!violations.length) process.stdout.write(`ok: every ledger row is in the ${version} notes\n`);
  process.exit(violations.length ? 1 : 0);
}

if (import.meta.main) main();
